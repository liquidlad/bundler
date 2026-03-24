import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { loadWallets } from "@/lib/bundler/wallets";
import { sellFromAllWallets } from "@/lib/bundler/seller";
import { getConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const { mintAddress, sellPercentage, sellFromMain, slippageBps } = await req.json();

    if (!mintAddress) {
      return NextResponse.json({ error: "Mint address is required" }, { status: 400 });
    }

    const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
    if (!mainWalletKey) {
      return NextResponse.json({ error: "MAIN_WALLET_PRIVATE_KEY not set" }, { status: 400 });
    }

    const config = getConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");
    const buyerWallets = loadWallets();

    const results = await sellFromAllWallets(
      connection,
      mintAddress.trim(),
      mainWalletKey,
      buyerWallets,
      sellPercentage || 100,
      sellFromMain !== false
    );

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({ results, succeeded, failed });
  } catch (error: any) {
    console.error("Sell error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sell" },
      { status: 500 }
    );
  }
}
