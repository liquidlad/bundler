import { NextRequest, NextResponse } from "next/server";
import { launchTokenBundled } from "@/lib/bundler/launcher";
import { loadWallets } from "@/lib/bundler/wallets";
import type { TokenMetadata } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    metadata,
    buyAmountSol = 0.1,
    buyerWalletCount = 6,
    jitoTipSol = 0.001,
  } = body as {
    metadata: TokenMetadata;
    buyAmountSol: number;
    buyerWalletCount: number;
    jitoTipSol: number;
  };

  // Validate metadata
  if (!metadata?.name || !metadata?.symbol) {
    return NextResponse.json(
      { error: "Token name and symbol are required" },
      { status: 400 }
    );
  }

  // Load main wallet
  const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
  if (!mainWalletKey) {
    return NextResponse.json(
      { error: "MAIN_WALLET_PRIVATE_KEY not set in .env" },
      { status: 400 }
    );
  }

  const { Keypair } = await import("@solana/web3.js");
  const bs58 = (await import("bs58")).default;
  let mainWallet;
  try {
    const kp = Keypair.fromSecretKey(bs58.decode(mainWalletKey));
    mainWallet = {
      publicKey: kp.publicKey.toBase58(),
      privateKey: mainWalletKey,
      label: "main",
      balanceSol: 0,
    };
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid MAIN_WALLET_PRIVATE_KEY" },
      { status: 400 }
    );
  }

  // Load buyer wallets
  const allWallets = loadWallets();
  if (allWallets.length === 0) {
    return NextResponse.json(
      { error: "No buyer wallets generated. Go to Wallets page first." },
      { status: 400 }
    );
  }

  const buyerWallets = allWallets.slice(0, buyerWalletCount);

  try {
    const result = await launchTokenBundled(
      metadata,
      mainWallet,
      buyerWallets,
      buyAmountSol,
      jitoTipSol
    );

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Launch failed" },
      { status: 500 }
    );
  }
}
