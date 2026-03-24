import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  OnlinePumpSdk,
  PUMP_SDK,
  getSellSolAmountFromTokenAmount,
} from "@pump-fun/pump-sdk";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";
import { loadWallets } from "@/lib/bundler/wallets";
import { getConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const { mintAddress, walletPublicKey, sellPercentage = 100 } = await req.json();

    if (!mintAddress || !walletPublicKey) {
      return NextResponse.json({ error: "mintAddress and walletPublicKey required" }, { status: 400 });
    }

    const config = getConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");
    const mint = new PublicKey(mintAddress.trim());
    const onlineSdk = new OnlinePumpSdk(connection);

    // Find the keypair — check main wallet and buyer wallets
    let keypair: Keypair | null = null;

    const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
    if (mainWalletKey) {
      const mainKp = Keypair.fromSecretKey(bs58.decode(mainWalletKey));
      if (mainKp.publicKey.toBase58() === walletPublicKey) {
        keypair = mainKp;
      }
    }

    if (!keypair) {
      const allWallets = loadWallets();
      const found = allWallets.find(w => w.publicKey === walletPublicKey);
      if (found) {
        keypair = Keypair.fromSecretKey(bs58.decode(found.privateKey));
      }
    }

    if (!keypair) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 400 });
    }

    // Detect token program
    const mintInfo = await connection.getAccountInfo(mint);
    if (!mintInfo) return NextResponse.json({ error: "Mint not found" }, { status: 400 });
    const tokenProgram = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

    // Get token balance
    const ata = await getAssociatedTokenAddress(mint, keypair.publicKey, false, tokenProgram);
    let balance: BN;
    try {
      const account = await getAccount(connection, ata, "confirmed", tokenProgram);
      balance = new BN(account.amount.toString());
    } catch {
      return NextResponse.json({ error: "No tokens in this wallet" }, { status: 400 });
    }

    if (balance.isZero()) {
      return NextResponse.json({ error: "No tokens to sell" }, { status: 400 });
    }

    const sellAmount = balance.mul(new BN(sellPercentage)).div(new BN(100));

    // Fetch state and build sell
    const global = await onlineSdk.fetchGlobal();
    const feeConfig = await onlineSdk.fetchFeeConfig();
    const { bondingCurveAccountInfo, bondingCurve } =
      await onlineSdk.fetchSellState(mint, keypair.publicKey, tokenProgram);

    const solAmount = getSellSolAmountFromTokenAmount({
      global,
      feeConfig,
      mintSupply: bondingCurve.tokenTotalSupply,
      bondingCurve,
      amount: sellAmount,
    });

    const instructions = await PUMP_SDK.sellInstructions({
      global,
      bondingCurveAccountInfo,
      bondingCurve,
      mint,
      user: keypair.publicKey,
      amount: sellAmount,
      solAmount,
      slippage: 15,
      tokenProgram,
      mayhemMode: false,
    });

    const tx = new Transaction().add(...instructions);
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });

    return NextResponse.json({
      success: true,
      txSignature: sig,
      solReceived: solAmount.toNumber() / 1e9,
      tokensSold: sellAmount.toString(),
    });
  } catch (error: any) {
    console.error("Sell-wallet error:", error);
    return NextResponse.json({ error: error.message || "Sell failed" }, { status: 500 });
  }
}
