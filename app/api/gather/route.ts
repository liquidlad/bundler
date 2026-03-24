import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { loadWallets } from "@/lib/bundler/wallets";
import { gatherFunds } from "@/lib/bundler/funder";
import { getConfig } from "@/lib/config";

export const maxDuration = 120; // Allow up to 2 minutes for staggered gathering

export async function POST() {
  try {
    const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
    if (!mainWalletKey) {
      return NextResponse.json({ error: "MAIN_WALLET_PRIVATE_KEY not set" }, { status: 400 });
    }

    const config = getConfig();
    const connection = new Connection(config.rpcUrl, "confirmed");
    const wallets = loadWallets();

    if (wallets.length === 0) {
      return NextResponse.json({ error: "No buyer wallets found." }, { status: 400 });
    }

    const result = await gatherFunds(connection, mainWalletKey, wallets, true);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Gather error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to gather funds" },
      { status: 500 }
    );
  }
}
