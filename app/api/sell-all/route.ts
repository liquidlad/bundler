import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { loadWallets } from "@/lib/bundler/wallets";
import { consolidateAndSell } from "@/lib/bundler/seller";
import { getConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const { mintAddress, slippagePct } = await req.json();

    if (!mintAddress) {
      return NextResponse.json({ error: "Mint address is required" }, { status: 400 });
    }

    const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
    if (!mainWalletKey) {
      return NextResponse.json({ error: "MAIN_WALLET_PRIVATE_KEY not set" }, { status: 400 });
    }

    const config = getConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");
    // Use ALL wallets for sell (not just enabled — tokens might be in disabled wallets)
    const buyerWallets = loadWallets();

    const result = await consolidateAndSell(
      connection,
      mintAddress.trim(),
      mainWalletKey,
      buyerWallets,
      slippagePct || 15
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Sell-all error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sell" },
      { status: 500 }
    );
  }
}
