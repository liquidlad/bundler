// Wallet generation and management

import { Keypair } from "@solana/web3.js";
import type { BuyerWallet } from "../types";

/**
 * Generates, funds, and manages buyer wallets.
 *
 * Flow:
 * - Generate N keypairs and save to local encrypted file
 * - Fund from main wallet with configurable SOL amounts
 * - Gather remaining SOL back to main wallet after sells
 * - Check balances across all wallets
 */

// TODO: Implement wallet management
// - Generate keypairs and persist securely
// - Fund wallets via SOL transfers
// - Gather funds back
// - Balance checking

export function generateWallets(count: number, buyAmountSol: number): BuyerWallet[] {
  const wallets: BuyerWallet[] = [];
  for (let i = 0; i < count; i++) {
    wallets.push({
      keypair: Keypair.generate(),
      label: `buyer-${i + 1}`,
      buyAmountSol,
    });
  }
  return wallets;
}
