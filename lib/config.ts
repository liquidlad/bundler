export function getConfig() {
  return {
    rpcUrl: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
    jitoTipAmount: parseFloat(process.env.JITO_TIP_AMOUNT || "0.001"),
    pumpPortalApiKey: process.env.PUMPPORTAL_API_KEY || "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    aiModel: process.env.AI_MODEL || "claude-haiku-4-5-20251001",
    defaultBuyAmountSol: parseFloat(process.env.BUY_AMOUNT_SOL || "0.1"),
    defaultSlippageBps: parseInt(process.env.SLIPPAGE_BPS || "500"),
    defaultBuyerWallets: parseInt(process.env.NUM_BUYER_WALLETS || "6"),
  };
}
