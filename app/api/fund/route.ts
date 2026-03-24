import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { loadWallets } from "@/lib/bundler/wallets";
import { fundWallets } from "@/lib/bundler/funder";
import { getConfig } from "@/lib/config";

export const maxDuration = 300; // Allow up to 5 minutes for stealth funding (staggered delays)

export async function POST(req: NextRequest) {
  try {
    const { amountPerWallet, walletIndices, stealth = true } = await req.json();

    const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
    if (!mainWalletKey) {
      return NextResponse.json({ error: "MAIN_WALLET_PRIVATE_KEY not set" }, { status: 400 });
    }

    const config = getConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");
    const allWallets = loadWallets();

    if (allWallets.length === 0) {
      return NextResponse.json({ error: "No buyer wallets. Generate them first." }, { status: 400 });
    }

    // Only fund enabled wallets (or specific indices if provided)
    const walletsToFund = walletIndices
      ? walletIndices.map((i: number) => allWallets[i]).filter(Boolean)
      : allWallets.filter((w) => w.enabled !== false);

    const amount = parseFloat(amountPerWallet) || config.defaultBuyAmountSol;

    const result = await fundWallets(connection, mainWalletKey, walletsToFund, amount, { stealth });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Fund error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fund wallets" },
      { status: 500 }
    );
  }
}
