import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { WalletInfo } from "../types";
import { getKeypair } from "./wallets";

/**
 * Fund buyer wallets from the main wallet.
 * Sends SOL to each buyer wallet in individual transactions.
 */
export async function fundWallets(
  connection: Connection,
  mainWalletKey: string,
  buyerWallets: WalletInfo[],
  amountPerWalletSol: number
): Promise<{ funded: string[]; failed: { wallet: string; error: string }[] }> {
  const mainKeypair = Keypair.fromSecretKey(bs58.decode(mainWalletKey));
  const lamportsPerWallet = Math.floor(amountPerWalletSol * LAMPORTS_PER_SOL);

  const funded: string[] = [];
  const failed: { wallet: string; error: string }[] = [];

  for (const wallet of buyerWallets) {
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: mainKeypair.publicKey,
          toPubkey: new PublicKey(wallet.publicKey),
          lamports: lamportsPerWallet,
        })
      );

      const sig = await sendAndConfirmTransaction(connection, tx, [mainKeypair]);
      funded.push(wallet.publicKey);
    } catch (error: any) {
      failed.push({
        wallet: wallet.publicKey,
        error: error.message || "Unknown error",
      });
    }
  }

  return { funded, failed };
}

/**
 * Gather all SOL from buyer wallets back to the main wallet.
 * Leaves a small amount for rent (0.001 SOL).
 */
export async function gatherFunds(
  connection: Connection,
  mainWalletKey: string,
  buyerWallets: WalletInfo[]
): Promise<{ gathered: string[]; totalSol: number; failed: { wallet: string; error: string }[] }> {
  const mainKeypair = Keypair.fromSecretKey(bs58.decode(mainWalletKey));
  const gathered: string[] = [];
  const failed: { wallet: string; error: string }[] = [];
  let totalLamports = 0;

  // Minimum to leave for transaction fee
  const FEE_BUFFER = 5000; // 0.000005 SOL

  for (const wallet of buyerWallets) {
    try {
      const buyerKeypair = getKeypair(wallet);
      const balance = await connection.getBalance(buyerKeypair.publicKey);

      // Skip if balance too low to transfer
      if (balance <= FEE_BUFFER) continue;

      const transferAmount = balance - FEE_BUFFER;

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: buyerKeypair.publicKey,
          toPubkey: mainKeypair.publicKey,
          lamports: transferAmount,
        })
      );

      await sendAndConfirmTransaction(connection, tx, [buyerKeypair]);
      gathered.push(wallet.publicKey);
      totalLamports += transferAmount;
    } catch (error: any) {
      failed.push({
        wallet: wallet.publicKey,
        error: error.message || "Unknown error",
      });
    }
  }

  return {
    gathered,
    totalSol: totalLamports / LAMPORTS_PER_SOL,
    failed,
  };
}
