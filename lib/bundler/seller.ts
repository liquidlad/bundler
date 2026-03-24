import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  OnlinePumpSdk,
  PUMP_SDK,
  getSellSolAmountFromTokenAmount,
} from "@pump-fun/pump-sdk";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
} from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";
import type { WalletInfo } from "../types";
import { getKeypair } from "./wallets";

export interface SellResult {
  wallet: string;
  label: string;
  success: boolean;
  txSignature?: string;
  error?: string;
}

/**
 * Get the token balance for a wallet.
 */
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

/**
 * Detect which token program a mint uses (Token vs Token2022).
 */
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

/**
 * Sell tokens from a single wallet using the official pump-fun SDK.
 */
async function sellFromWallet(
  connection: Connection,
  onlineSdk: OnlinePumpSdk,
  mint: PublicKey,
  wallet: Keypair,
  sellPercentage: number,
  tokenProgram: PublicKey
): Promise<string> {
  // Get token balance
  const balance = await getTokenBalance(connection, mint, wallet.publicKey, tokenProgram);
  if (balance.isZero()) throw new Error("No tokens to sell");

  // Calculate amount to sell based on percentage
  const sellAmount = balance.mul(new BN(sellPercentage)).div(new BN(100));
  if (sellAmount.isZero()) throw new Error("Sell amount too small");

  // Fetch on-chain state
  const global = await onlineSdk.fetchGlobal();
  const feeConfig = await onlineSdk.fetchFeeConfig();
  const { bondingCurveAccountInfo, bondingCurve } =
    await onlineSdk.fetchSellState(mint, wallet.publicKey, tokenProgram);

  // Calculate SOL received
  const solAmount = getSellSolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: bondingCurve.tokenTotalSupply,
    bondingCurve,
    amount: sellAmount,
  });

  // Build sell instructions
  const instructions = await PUMP_SDK.sellInstructions({
    global,
    bondingCurveAccountInfo,
    bondingCurve,
    mint,
    user: wallet.publicKey,
    amount: sellAmount,
    solAmount,
    slippage: 10,
    tokenProgram,
    mayhemMode: false,
  });

  const tx = new Transaction().add(...instructions);
  const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
  return sig;
}

/**
 * Sell tokens from all wallets (main + buyers).
 */
export async function sellFromAllWallets(
  connection: Connection,
  mintAddress: string,
  mainWalletKey: string,
  buyerWallets: WalletInfo[],
  sellPercentage: number,
  sellFromMain: boolean
): Promise<SellResult[]> {
  const mint = new PublicKey(mintAddress);
  const onlineSdk = new OnlinePumpSdk(connection);
  const tokenProgram = await detectTokenProgram(connection, mint);
  const results: SellResult[] = [];

  // Sell from main wallet
  if (sellFromMain) {
    const mainKeypair = Keypair.fromSecretKey(bs58.decode(mainWalletKey));
    try {
      const sig = await sellFromWallet(
        connection, onlineSdk, mint, mainKeypair, sellPercentage, tokenProgram
      );
      results.push({ wallet: mainKeypair.publicKey.toBase58(), label: "main", success: true, txSignature: sig });
    } catch (error: any) {
      results.push({ wallet: mainKeypair.publicKey.toBase58(), label: "main", success: false, error: error.message });
    }
  }

  // Sell from buyer wallets
  for (let i = 0; i < buyerWallets.length; i++) {
    const buyer = buyerWallets[i];
    const keypair = getKeypair(buyer);
    try {
      const sig = await sellFromWallet(
        connection, onlineSdk, mint, keypair, sellPercentage, tokenProgram
      );
      results.push({ wallet: buyer.publicKey, label: `buyer-${i + 1}`, success: true, txSignature: sig });
    } catch (error: any) {
      results.push({ wallet: buyer.publicKey, label: `buyer-${i + 1}`, success: false, error: error.message });
    }
  }

  return results;
}

export interface ConsolidateSellResult {
  consolidateTx?: string;
  sellTx?: string;
  totalTokensSold: string;
  solReceived: number;
  success: boolean;
  error?: string;
  walletsConsolidated: number;
}

/**
 * Consolidate all tokens to main wallet, then sell in a single transaction.
 *
 * TX 1: Transfer tokens from all buyer wallets → main wallet (one atomic tx)
 * TX 2: Sell 100% from main wallet
 *
 * This is 2 txs instead of N+1 and executes much faster.
 */
export async function consolidateAndSell(
  connection: Connection,
  mintAddress: string,
  mainWalletKey: string,
  buyerWallets: WalletInfo[],
  slippagePct: number = 15
): Promise<ConsolidateSellResult> {
  const mint = new PublicKey(mintAddress);
  const mainKeypair = Keypair.fromSecretKey(bs58.decode(mainWalletKey));
  const tokenProgram = await detectTokenProgram(connection, mint);
  const mintInfo = await getMint(connection, mint, "confirmed", tokenProgram);
  const decimals = mintInfo.decimals;

  // 1. Get balances from all buyer wallets
  const buyerKeypairs: { keypair: Keypair; balance: BN }[] = [];
  for (const buyer of buyerWallets) {
    const keypair = getKeypair(buyer);
    const balance = await getTokenBalance(connection, mint, keypair.publicKey, tokenProgram);
    if (!balance.isZero()) {
      buyerKeypairs.push({ keypair, balance });
    }
  }

  // Also check main wallet balance
  const mainBalance = await getTokenBalance(connection, mint, mainKeypair.publicKey, tokenProgram);

  const totalFromBuyers = buyerKeypairs.reduce((acc, b) => acc.add(b.balance), new BN(0));
  const totalTokens = mainBalance.add(totalFromBuyers);

  if (totalTokens.isZero()) {
    return {
      success: false,
      error: "No tokens to sell across any wallet",
      totalTokensSold: "0",
      solReceived: 0,
      walletsConsolidated: 0,
    };
  }

  let consolidateTxSig: string | undefined;
  let walletsConsolidated = 0;

  // 2. Consolidate buyer tokens → main wallet (if any buyers have tokens)
  if (buyerKeypairs.length > 0) {
    const mainAta = await getAssociatedTokenAddress(mint, mainKeypair.publicKey, false, tokenProgram);

    // Build one transaction with all transfers
    const consolidateTx = new Transaction();

    // Ensure main wallet ATA exists
    consolidateTx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        mainKeypair.publicKey, // payer
        mainAta,
        mainKeypair.publicKey, // owner
        mint,
        tokenProgram
      )
    );

    const signers: Keypair[] = [mainKeypair];

    for (const { keypair, balance } of buyerKeypairs) {
      const buyerAta = await getAssociatedTokenAddress(mint, keypair.publicKey, false, tokenProgram);

      consolidateTx.add(
        createTransferCheckedInstruction(
          buyerAta,           // source
          mint,               // mint
          mainAta,            // destination
          keypair.publicKey,  // owner/authority
          BigInt(balance.toString()), // amount
          decimals,           // decimals
          [],                 // multiSigners
          tokenProgram
        )
      );

      signers.push(keypair);
    }

    try {
      consolidateTxSig = await sendAndConfirmTransaction(
        connection,
        consolidateTx,
        signers,
        { commitment: "confirmed" }
      );
      walletsConsolidated = buyerKeypairs.length;
      console.log(`Consolidated ${buyerKeypairs.length} wallets → main. TX: ${consolidateTxSig}`);
    } catch (err: any) {
      console.error("Consolidation failed:", err.message);
      // Fall back: try selling individually
      return {
        success: false,
        error: `Consolidation failed: ${err.message}. Use the Sell page to sell from individual wallets.`,
        totalTokensSold: "0",
        solReceived: 0,
        walletsConsolidated: 0,
      };
    }
  }

  // 3. Sell everything from main wallet
  const onlineSdk = new OnlinePumpSdk(connection);

  // Re-fetch balance after consolidation
  const finalBalance = await getTokenBalance(connection, mint, mainKeypair.publicKey, tokenProgram);
  if (finalBalance.isZero()) {
    return {
      success: false,
      error: "Main wallet has no tokens after consolidation",
      consolidateTx: consolidateTxSig,
      totalTokensSold: "0",
      solReceived: 0,
      walletsConsolidated,
    };
  }

  const global = await onlineSdk.fetchGlobal();
  const feeConfig = await onlineSdk.fetchFeeConfig();
  const { bondingCurveAccountInfo, bondingCurve } =
    await onlineSdk.fetchSellState(mint, mainKeypair.publicKey, tokenProgram);

  const solAmount = getSellSolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: bondingCurve.tokenTotalSupply,
    bondingCurve,
    amount: finalBalance,
  });

  const instructions = await PUMP_SDK.sellInstructions({
    global,
    bondingCurveAccountInfo,
    bondingCurve,
    mint,
    user: mainKeypair.publicKey,
    amount: finalBalance,
    solAmount,
    slippage: slippagePct,
    tokenProgram,
    mayhemMode: false,
  });

  try {
    const sellTx = new Transaction().add(...instructions);
    const sellTxSig = await sendAndConfirmTransaction(
      connection,
      sellTx,
      [mainKeypair],
      { commitment: "confirmed" }
    );

    const solReceived = solAmount.toNumber() / LAMPORTS_PER_SOL;
    console.log(`Sold all tokens. TX: ${sellTxSig}. ~${solReceived.toFixed(4)} SOL`);

    return {
      success: true,
      consolidateTx: consolidateTxSig,
      sellTx: sellTxSig,
      totalTokensSold: finalBalance.toString(),
      solReceived,
      walletsConsolidated,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Sell failed: ${err.message}`,
      consolidateTx: consolidateTxSig,
      totalTokensSold: "0",
      solReceived: 0,
      walletsConsolidated,
    };
  }
}
