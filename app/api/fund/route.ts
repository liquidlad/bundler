import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { loadWallets } from "@/lib/bundler/wallets";
import { fundWallets } from "@/lib/bundler/funder";
import { getConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  const { amountPerWallet, walletIndices } = await req.json();

  const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
  if (!mainWalletKey) {
    return NextResponse.json({ error: "MAIN_WALLET_PRIVATE_KEY not set" }, { status: 400 });
  }

  const config = getConfig();
  const connection = new Connection(config.rpcUrl);
  const allWallets = loadWallets();

  if (allWallets.length === 0) {
    return NextResponse.json({ error: "No buyer wallets. Generate them first." }, { status: 400 });
  }

  // Fund specific wallets or all
  const walletsToFund = walletIndices
    ? walletIndices.map((i: number) => allWallets[i]).filter(Boolean)
    : allWallets;

  const amount = parseFloat(amountPerWallet) || config.defaultBuyAmountSol;

  try {
    const result = await fundWallets(connection, mainWalletKey, walletsToFund, amount);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
