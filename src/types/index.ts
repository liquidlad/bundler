import { Keypair } from "@solana/web3.js";

// === Token Metadata ===
export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

// === AI Extraction ===
export interface ExtractionResult {
  metadata: TokenMetadata;
  confidence: number;
  shouldLaunch: boolean;
  sourceTweetId: string;
  sourceTweetUrl: string;
  sourceAccount: string;
}

// === Wallet ===
export interface BuyerWallet {
  keypair: Keypair;
  label: string;
  buyAmountSol: number;
}

// === Launch Config ===
export interface LaunchConfig {
  metadata: TokenMetadata;
  mainWallet: Keypair;
  buyerWallets: BuyerWallet[];
  jitoTipSol: number;
  slippageBps: number;
  sellStrategy: SellStrategy;
}

// === Sell Strategies ===
export type SellStrategyType = "manual" | "timed" | "market-cap" | "percentage" | "dump-all";

export interface SellStrategy {
  type: SellStrategyType;
  delayMs?: number;
  marketCapTarget?: number;
  sellPercentage?: number;
}

// === Launch Result ===
export interface LaunchResult {
  success: boolean;
  mintAddress?: string;
  txSignature?: string;
  bundleId?: string;
  error?: string;
  timestamp: number;
}

// === Monitor Config ===
export interface MonitorConfig {
  accounts: string[];
  pollIntervalMs: number;
  confidenceThreshold: number;
  autoLaunch: boolean;
}

// === Notification ===
export interface NotificationPayload {
  type: "launch" | "sell" | "error" | "monitor";
  title: string;
  message: string;
  fields?: Record<string, string>;
}
