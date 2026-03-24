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
  sourceTweetUrl: string;
  sourceAccount: string;
}

// === Wallet ===
export interface WalletInfo {
  publicKey: string;
  privateKey: string;
  label: string;
  balanceSol: number;
  enabled: boolean;
}

// === Launch Config ===
export interface LaunchConfig {
  metadata: TokenMetadata;
  buyerWalletCount: number;
  buyAmountPerWallet: number;
  jitoTipSol: number;
  slippageBps: number;
}

// === Launch Result ===
export interface LaunchResult {
  success: boolean;
  mintAddress?: string;
  txSignature?: string;
  error?: string;
  timestamp: number;
}

// === App State ===
export interface AppState {
  wallets: WalletInfo[];
  mainWallet: WalletInfo | null;
  recentLaunches: LaunchResult[];
}
