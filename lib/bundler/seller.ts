import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { WalletInfo } from "../types";
import { getKeypair } from "./wallets";

export interface SellResult {
  wallet: string;
  success: boolean;
  txSignature?: string;
  error?: string;
}

/**
 * Sell tokens from buyer wallets via PumpPortal API.
 * Each wallet sells its token holdings.
 *
 * PumpPortal trade-local endpoint handles:
 * - Selling on pump.fun bonding curve
 * - Jito bundle for same-block execution
 */
export async function sellFromWallets(
  connection: Connection,
  mintAddress: string,
  wallets: WalletInfo[],
  sellPercentage: number, // 1-100
  slippageBps: number,
  priorityFee: number
): Promise<SellResult[]> {
  const results: SellResult[] = [];

  for (const wallet of wallets) {
    try {
      const keypair = getKeypair(wallet);

      // Request sell transaction from PumpPortal
      const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: keypair.publicKey.toBase58(),
          action: "sell",
          mint: mintAddress,
          denominatedInSol: "false",
          amount: sellPercentage === 100 ? "100%" : `${sellPercentage}%`,
          slippage: slippageBps / 100,
          priorityFee: priorityFee,
          pool: "pump",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`PumpPortal error: ${response.status} ${errText}`);
      }

      // Deserialize and sign
      const txData = await response.arrayBuffer();
      const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
      tx.sign([keypair]);

      // Send
      const sig = await connection.sendTransaction(tx, {
        skipPreflight: false,
        maxRetries: 3,
      });

      const confirmation = await connection.confirmTransaction(sig, "confirmed");
      if (confirmation.value.err) {
        throw new Error(`Tx failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      results.push({
        wallet: wallet.publicKey,
        success: true,
        txSignature: sig,
      });
    } catch (error: any) {
      results.push({
        wallet: wallet.publicKey,
        success: false,
        error: error.message || "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Sell from main wallet specifically.
 */
export async function sellFromMainWallet(
  connection: Connection,
  mainWalletKey: string,
  mintAddress: string,
  sellPercentage: number,
  slippageBps: number,
  priorityFee: number
): Promise<SellResult> {
  const keypair = Keypair.fromSecretKey(bs58.decode(mainWalletKey));

  try {
    const response = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: keypair.publicKey.toBase58(),
        action: "sell",
        mint: mintAddress,
        denominatedInSol: "false",
        amount: sellPercentage === 100 ? "100%" : `${sellPercentage}%`,
        slippage: slippageBps / 100,
        priorityFee: priorityFee,
        pool: "pump",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`PumpPortal error: ${response.status} ${errText}`);
    }

    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    tx.sign([keypair]);

    const sig = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    const confirmation = await connection.confirmTransaction(sig, "confirmed");
    if (confirmation.value.err) {
      throw new Error(`Tx failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return {
      wallet: keypair.publicKey.toBase58(),
      success: true,
      txSignature: sig,
    };
  } catch (error: any) {
    return {
      wallet: keypair.publicKey.toBase58(),
      success: false,
      error: error.message || "Unknown error",
    };
  }
}
