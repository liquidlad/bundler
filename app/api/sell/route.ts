import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { loadWallets } from "@/lib/bundler/wallets";
import { sellFromWallets, sellFromMainWallet } from "@/lib/bundler/seller";
import { getConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  const { mintAddress, sellPercentage, sellFromMain, slippageBps, priorityFee } = await req.json();

  if (!mintAddress) {
    return NextResponse.json({ error: "Mint address is required" }, { status: 400 });
  }

  const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
  if (!mainWalletKey) {
    return NextResponse.json({ error: "MAIN_WALLET_PRIVATE_KEY not set" }, { status: 400 });
  }

  const config = getConfig();
  const connection = new Connection(config.rpcUrl);
  const pct = sellPercentage || 100;
  const slippage = slippageBps || config.defaultSlippageBps;
  const fee = priorityFee || config.jitoTipAmount;

  const results: any[] = [];

  try {
    // Sell from main wallet if requested
    if (sellFromMain !== false) {
      const mainResult = await sellFromMainWallet(
        connection, mainWalletKey, mintAddress, pct, slippage, fee
      );
      results.push({ ...mainResult, label: "main" });
    }

    // Sell from buyer wallets
    const buyerWallets = loadWallets();
    if (buyerWallets.length > 0) {
      const buyerResults = await sellFromWallets(
        connection, mintAddress, buyerWallets, pct, slippage, fee
      );
      buyerResults.forEach((r, i) => results.push({ ...r, label: `buyer-${i + 1}` }));
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({ results, succeeded, failed });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
