// Sell strategy execution

import type { SellStrategy, BuyerWallet } from "../types";

/**
 * Executes sell orders based on configured strategy.
 *
 * Strategies:
 * - manual: wait for user command
 * - timed: sell after delay
 * - market-cap: sell when MC target hit
 * - percentage: sell X% of holdings
 * - dump-all: sell everything immediately
 */

// TODO: Implement sell strategies
// - Monitor token price/MC for trigger-based sells
// - Construct sell instructions per wallet
// - Bundle sells via Jito for same-block execution

export async function executeSell(
  mintAddress: string,
  wallets: BuyerWallet[],
  strategy: SellStrategy
): Promise<string[]> {
  throw new Error("Not yet implemented");
}
