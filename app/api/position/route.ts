import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  OnlinePumpSdk,
  getSellSolAmountFromTokenAmount,
  bondingCurveMarketCap,
} from "@pump-fun/pump-sdk";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";
import { loadWallets } from "@/lib/bundler/wallets";
import { getConfig } from "@/lib/config";

interface WalletPosition {
  label: string;
  publicKey: string;
  tokenBalance: string; // raw token amount
  tokenBalanceFormatted: number; // human readable (divided by decimals)
}

async function getTokenBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey
): Promise<BN> {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner, false, tokenProgram);
    const account = await getAccount(connection, ata, "confirmed", tokenProgram);
    return new BN(account.amount.toString());
  } catch {
    return new BN(0);
  }
}

async function detectTokenProgram(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint account not found: ${mint.toBase58()}`);
  return info.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
}

export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { mintAddress } = body;
    if (!mintAddress) {
      return NextResponse.json({ error: "Mint address is required" }, { status: 400 });
    }

    const config = getConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");
    const mint = new PublicKey(mintAddress.trim());
    const onlineSdk = new OnlinePumpSdk(connection);

    // Detect token program
    const tokenProgram = await detectTokenProgram(connection, mint);

    // Fetch bonding curve state
    const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
    const mainKeypair = mainWalletKey
      ? Keypair.fromSecretKey(bs58.decode(mainWalletKey))
      : null;

    // We need any wallet to call fetchSellState — use main or first buyer
    const buyerWallets = loadWallets();
    const anyWallet = mainKeypair?.publicKey || (buyerWallets.length > 0 ? new PublicKey(buyerWallets[0].publicKey) : null);
    if (!anyWallet) {
      return NextResponse.json({ error: "No wallets configured" }, { status: 400 });
    }

    const global = await onlineSdk.fetchGlobal();
    const feeConfig = await onlineSdk.fetchFeeConfig();
    const { bondingCurve } = await onlineSdk.fetchSellState(mint, anyWallet, tokenProgram);

    // Get market cap
    const mcapLamports = bondingCurveMarketCap({
      mintSupply: bondingCurve.tokenTotalSupply,
      virtualSolReserves: bondingCurve.virtualSolReserves,
      virtualTokenReserves: bondingCurve.virtualTokenReserves,
    });
    const marketCapSol = mcapLamports.toNumber() / LAMPORTS_PER_SOL;

    // Spot price per token (in SOL)
    const spotPrice = bondingCurve.virtualSolReserves.toNumber() / bondingCurve.virtualTokenReserves.toNumber();

    // Gather all wallet balances
    const walletPositions: WalletPosition[] = [];
    let totalTokens = new BN(0);

    // Main wallet
    if (mainKeypair) {
      const bal = await getTokenBalance(connection, mint, mainKeypair.publicKey, tokenProgram);
      totalTokens = totalTokens.add(bal);
      walletPositions.push({
        label: "main",
        publicKey: mainKeypair.publicKey.toBase58(),
        tokenBalance: bal.toString(),
        tokenBalanceFormatted: bal.toNumber() / 1e6, // pump.fun tokens have 6 decimals
      });
    }

    // Buyer wallets
    // Check ALL wallets for token balances (not just enabled)
    const enabledBuyers = buyerWallets;
    for (let i = 0; i < enabledBuyers.length; i++) {
      const buyer = enabledBuyers[i];
      const bal = await getTokenBalance(
        connection,
        mint,
        new PublicKey(buyer.publicKey),
        tokenProgram
      );
      totalTokens = totalTokens.add(bal);
      walletPositions.push({
        label: buyer.label || `buyer-${i + 1}`,
        publicKey: buyer.publicKey,
        tokenBalance: bal.toString(),
        tokenBalanceFormatted: bal.toNumber() / 1e6,
      });
    }

    // Calculate REAL sell value — what you'd actually get selling everything
    // This accounts for price impact on the bonding curve
    let realSellValueLamports = new BN(0);
    if (!totalTokens.isZero()) {
      realSellValueLamports = getSellSolAmountFromTokenAmount({
        global,
        feeConfig,
        mintSupply: bondingCurve.tokenTotalSupply,
        bondingCurve,
        amount: totalTokens,
      });
    }
    const realSellValueSol = realSellValueLamports.toNumber() / LAMPORTS_PER_SOL;

    // Naive value (spot price × tokens, ignoring slippage)
    const naiveValueSol = (totalTokens.toNumber() / 1e6) * spotPrice;

    // Price impact percentage
    const priceImpactPct = naiveValueSol > 0
      ? ((naiveValueSol - realSellValueSol) / naiveValueSol) * 100
      : 0;

    // Bonding curve complete = migrated to Raydium/PumpSwap
    const isMigrated = bondingCurve.complete;

    return NextResponse.json({
      mint: mintAddress.trim(),
      marketCapSol,
      spotPrice,
      isMigrated,
      wallets: walletPositions,
      totalTokens: totalTokens.toString(),
      totalTokensFormatted: totalTokens.toNumber() / 1e6,
      naiveValueSol,
      realSellValueSol,
      priceImpactPct,
      virtualSolReserves: bondingCurve.virtualSolReserves.toNumber() / LAMPORTS_PER_SOL,
      virtualTokenReserves: bondingCurve.virtualTokenReserves.toNumber() / 1e6,
    });
  } catch (error: any) {
    console.error("Position error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch position" },
      { status: 500 }
    );
  }
}
