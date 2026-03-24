import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { loadWallets, refreshBalances, getBalance } from "@/lib/bundler/wallets";
import { getConfig } from "@/lib/config";

export async function GET() {
  const config = getConfig();
  const connection = new Connection(config.rpcUrl);

  try {
    let wallets = loadWallets();
    wallets = await refreshBalances(connection, wallets);

    // Also get main wallet balance
    let mainWallet = null;
    const mainWalletKey = process.env.MAIN_WALLET_PRIVATE_KEY;
    if (mainWalletKey) {
      const { Keypair } = await import("@solana/web3.js");
      const bs58 = (await import("bs58")).default;
      const kp = Keypair.fromSecretKey(bs58.decode(mainWalletKey));
      const balance = await getBalance(connection, kp.publicKey.toBase58());
      mainWallet = {
        publicKey: kp.publicKey.toBase58(),
        privateKey: "[hidden]",
        label: "main",
        balanceSol: balance,
      };
    }

    return NextResponse.json({
      wallets: wallets.map((w) => ({ ...w, privateKey: "[hidden]" })),
      mainWallet,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch balances" },
      { status: 500 }
    );
  }
}
