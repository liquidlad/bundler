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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Randomize an amount by ±percentage to avoid identical transfer patterns.
 * e.g., 0.1 SOL with 15% variance → 0.085 to 0.115 SOL
 */
function randomizeAmount(baseLamports: number, variancePercent: number): number {
  const variance = baseLamports * (variancePercent / 100);
  const offset = (Math.random() * 2 - 1) * variance;
  return Math.floor(baseLamports + offset);
}

/**
 * Random delay between min and max milliseconds.
 */
function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs) + minMs);
}

/**
 * Shuffle array order so wallets aren't funded in sequence.
 */
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export interface FundOptions {
  stealth: boolean; // Enable anti-detection mode
  variancePercent?: number; // Amount variance (default 12%)
  minDelayMs?: number; // Min delay between transfers (default 3000)
  maxDelayMs?: number; // Max delay between transfers (default 12000)
}

/**
 * Fund buyer wallets from the main wallet.
 *
 * Stealth mode applies:
 * - Randomized transfer amounts (±12% variance by default)
 * - Random delays between transfers (3-12 seconds)
 * - Shuffled wallet order (not sequential)
 */
export async function fundWallets(
  connection: Connection,
  mainWalletKey: string,
  buyerWallets: WalletInfo[],
  amountPerWalletSol: number,
  options: FundOptions = { stealth: true }
): Promise<{ funded: string[]; failed: { wallet: string; error: string }[] }> {
  const mainKeypair = Keypair.fromSecretKey(bs58.decode(mainWalletKey));
  const baseLamports = Math.floor(amountPerWalletSol * LAMPORTS_PER_SOL);

  const variance = options.variancePercent ?? 12;
  const minDelay = options.minDelayMs ?? 3000;
  const maxDelay = options.maxDelayMs ?? 12000;

  const funded: string[] = [];
  const failed: { wallet: string; error: string }[] = [];

  // Shuffle wallet order in stealth mode
  const walletsToFund = options.stealth
    ? shuffleArray(buyerWallets)
    : buyerWallets;

  for (let i = 0; i < walletsToFund.length; i++) {
    const wallet = walletsToFund[i];

    try {
      // Randomize amount in stealth mode
      const lamports = options.stealth
        ? randomizeAmount(baseLamports, variance)
        : baseLamports;

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: mainKeypair.publicKey,
          toPubkey: new PublicKey(wallet.publicKey),
          lamports,
        })
      );

      await sendAndConfirmTransaction(connection, tx, [mainKeypair]);
      funded.push(wallet.publicKey);

      // Random delay between transfers in stealth mode (skip after last one)
      if (options.stealth && i < walletsToFund.length - 1) {
        const delay = randomDelay(minDelay, maxDelay);
        await sleep(delay);
      }
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
 * Leaves a small amount for transaction fees.
 *
 * Also uses stealth mode: random order and delays.
 */
export async function gatherFunds(
  connection: Connection,
  mainWalletKey: string,
  buyerWallets: WalletInfo[],
  stealth: boolean = true
): Promise<{ gathered: string[]; totalSol: number; failed: { wallet: string; error: string }[] }> {
  const mainKeypair = Keypair.fromSecretKey(bs58.decode(mainWalletKey));
  const gathered: string[] = [];
  const failed: { wallet: string; error: string }[] = [];
  let totalLamports = 0;

  const FEE_BUFFER = 5000;

  const walletsToGather = stealth ? shuffleArray(buyerWallets) : buyerWallets;

  for (let i = 0; i < walletsToGather.length; i++) {
    const wallet = walletsToGather[i];

    try {
      const buyerKeypair = getKeypair(wallet);
      const balance = await connection.getBalance(buyerKeypair.publicKey);

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

      // Random delay in stealth mode
      if (stealth && i < walletsToGather.length - 1) {
        await sleep(randomDelay(2000, 8000));
      }
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
