import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  OnlinePumpSdk,
  PUMP_SDK,
  getSellSolAmountFromTokenAmount,
} from "@pump-fun/pump-sdk";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";
import type { WalletInfo } from "../types";
import { getKeypair } from "./wallets";

export interface SellResult {
  wallet: string;
  label: string;
  success: boolean;
  txSignature?: string;
  error?: string;
}

/**
 * Get the token balance for a wallet.
 */
async function getTokenBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey
): Promise<BN> {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner, false, tokenProgram);
    const account = await getAccount(connection, ata, "confirmed", tokenProgram);
    return new BN(account.amount.toString());
  } catch {
    return new BN(0);
  }
}

/**
 * Detect which token program a mint uses (Token vs Token2022).
 */
async function detectTokenProgram(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint account not found: ${mint.toBase58()}`);
  return info.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
}

/**
 * Sell tokens from a single wallet using the official pump-fun SDK.
 */
async function sellFromWallet(
  connection: Connection,
  onlineSdk: OnlinePumpSdk,
  mint: PublicKey,
  wallet: Keypair,
  sellPercentage: number,
  tokenProgram: PublicKey
): Promise<string> {
  // Get token balance
  const balance = await getTokenBalance(connection, mint, wallet.publicKey, tokenProgram);
  if (balance.isZero()) throw new Error("No tokens to sell");

  // Calculate amount to sell based on percentage
  const sellAmount = balance.mul(new BN(sellPercentage)).div(new BN(100));
  if (sellAmount.isZero()) throw new Error("Sell amount too small");

  // Fetch on-chain state
  const global = await onlineSdk.fetchGlobal();
  const feeConfig = await onlineSdk.fetchFeeConfig();
  const { bondingCurveAccountInfo, bondingCurve } =
    await onlineSdk.fetchSellState(mint, wallet.publicKey, tokenProgram);

  // Calculate SOL received
  const solAmount = getSellSolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: bondingCurve.tokenTotalSupply,
    bondingCurve,
    amount: sellAmount,
  });

  // Build sell instructions
  const instructions = await PUMP_SDK.sellInstructions({
    global,
    bondingCurveAccountInfo,
    bondingCurve,
    mint,
    user: wallet.publicKey,
    amount: sellAmount,
    solAmount,
    slippage: 10,
    tokenProgram,
    mayhemMode: false,
  });

  const tx = new Transaction().add(...instructions);
  const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
  return sig;
}

/**
 * Sell tokens from all wallets (main + buyers).
 */
export async function sellFromAllWallets(
  connection: Connection,
  mintAddress: string,
  mainWalletKey: string,
  buyerWallets: WalletInfo[],
  sellPercentage: number,
  sellFromMain: boolean
): Promise<SellResult[]> {
  const mint = new PublicKey(mintAddress);
  const onlineSdk = new OnlinePumpSdk(connection);
  const tokenProgram = await detectTokenProgram(connection, mint);
  const results: SellResult[] = [];

  // Sell from main wallet
  if (sellFromMain) {
    const mainKeypair = Keypair.fromSecretKey(bs58.decode(mainWalletKey));
    try {
      const sig = await sellFromWallet(
        connection, onlineSdk, mint, mainKeypair, sellPercentage, tokenProgram
      );
      results.push({ wallet: mainKeypair.publicKey.toBase58(), label: "main", success: true, txSignature: sig });
    } catch (error: any) {
      results.push({ wallet: mainKeypair.publicKey.toBase58(), label: "main", success: false, error: error.message });
    }
  }

  // Sell from buyer wallets
  for (let i = 0; i < buyerWallets.length; i++) {
    const buyer = buyerWallets[i];
    const keypair = getKeypair(buyer);
    try {
      const sig = await sellFromWallet(
        connection, onlineSdk, mint, keypair, sellPercentage, tokenProgram
      );
      results.push({ wallet: buyer.publicKey, label: `buyer-${i + 1}`, success: true, txSignature: sig });
    } catch (error: any) {
      results.push({ wallet: buyer.publicKey, label: `buyer-${i + 1}`, success: false, error: error.message });
    }
  }

  return results;
}
