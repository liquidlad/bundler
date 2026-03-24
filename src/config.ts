import dotenv from "dotenv";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { MonitorConfig, SellStrategy } from "./types";

dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  // Solana
  rpcUrl: optionalEnv("RPC_URL", "https://api.mainnet-beta.solana.com"),
  mainWallet: (): Keypair => {
    const key = requireEnv("MAIN_WALLET_PRIVATE_KEY");
    return Keypair.fromSecretKey(bs58.decode(key));
  },

  // Jito
  jitoBlockEngineUrl: optionalEnv("JITO_BLOCK_ENGINE_URL", "https://mainnet.block-engine.jito.wtf"),
  jitoTipAmount: parseFloat(optionalEnv("JITO_TIP_AMOUNT", "0.001")),

  // PumpPortal
  pumpPortalApiKey: optionalEnv("PUMPPORTAL_API_KEY", ""),

  // Bundler
  numBuyerWallets: parseInt(optionalEnv("NUM_BUYER_WALLETS", "10")),
  buyAmountSol: parseFloat(optionalEnv("BUY_AMOUNT_SOL", "0.1")),
  slippageBps: parseInt(optionalEnv("SLIPPAGE_BPS", "500")),

  // Sell
  sellStrategy: (): SellStrategy => ({
    type: optionalEnv("SELL_STRATEGY", "manual") as SellStrategy["type"],
    delayMs: parseInt(optionalEnv("SELL_DELAY_MS", "60000")),
    marketCapTarget: parseInt(optionalEnv("SELL_MC_TARGET", "100000")),
    sellPercentage: parseInt(optionalEnv("SELL_PERCENTAGE", "100")),
  }),

  // Monitor
  monitor: (): MonitorConfig => ({
    accounts: optionalEnv("TWITTER_ACCOUNTS_TO_MONITOR", "").split(",").filter(Boolean),
    pollIntervalMs: parseInt(optionalEnv("TWITTER_POLL_INTERVAL_MS", "5000")),
    confidenceThreshold: parseFloat(optionalEnv("AI_CONFIDENCE_THRESHOLD", "0.8")),
    autoLaunch: optionalEnv("AUTO_LAUNCH", "false") === "true",
  }),

  // AI
  anthropicApiKey: optionalEnv("ANTHROPIC_API_KEY", ""),
  aiModel: optionalEnv("AI_MODEL", "claude-haiku-4-5-20251001"),

  // Twitter
  twitterUsername: optionalEnv("TWITTER_USERNAME", ""),
  twitterPassword: optionalEnv("TWITTER_PASSWORD", ""),

  // Notifications
  discordWebhookUrl: optionalEnv("DISCORD_WEBHOOK_URL", ""),
  telegramBotToken: optionalEnv("TELEGRAM_BOT_TOKEN", ""),
  telegramChatId: optionalEnv("TELEGRAM_CHAT_ID", ""),
};
