import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { loadWallets } from "@/lib/bundler/wallets";
import { gatherFunds } from "@/lib/bundler/funder";
import { getConfig } from "@/lib/config";

export async function POST() {
  const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
  if (!mainWalletKey) {
    return NextResponse.json({ error: "MAIN_WALLET_PRIVATE_KEY not set" }, { status: 400 });
  }

  const config = getConfig();
  const connection = new Connection(config.rpcUrl);
  const wallets = loadWallets();

  if (wallets.length === 0) {
    return NextResponse.json({ error: "No buyer wallets found." }, { status: 400 });
  }

  try {
    const result = await gatherFunds(connection, mainWalletKey, wallets);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
