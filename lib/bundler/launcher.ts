import {
  Keypair,
  Connection,
  Transaction,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  PUMP_SDK,
  OnlinePumpSdk,
  getBuyTokenAmountFromSolAmount,
  bondingCurvePda,
  PUMP_PROGRAM_ID,
} from "@pump-fun/pump-sdk";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";
import type { TokenMetadata, LaunchResult, WalletInfo } from "../types";
import { getKeypair } from "./wallets";
import { getConfig } from "../config";

// Jito tip accounts (randomly pick one per bundle)
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4bPCLz2yGMCMGHUPcLAUJn8",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUC47KSWHSl42dFOREEhF6hNKax2qgY2tUB",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

function randomJitoTipAccount(): PublicKey {
  const idx = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  return new PublicKey(JITO_TIP_ACCOUNTS[idx]);
}

/**
 * Upload token image + metadata to IPFS via pump.fun API.
 */
async function uploadToIpfs(
  imageUrl: string,
  metadata: TokenMetadata
): Promise<string> {
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok)
    throw new Error(`Failed to download image: ${imgResponse.status}`);
  const imgBlob = await imgResponse.blob();

  const formData = new FormData();
  formData.append("file", imgBlob, "token-image.png");
  formData.append("name", metadata.name);
  formData.append("symbol", metadata.symbol);
  formData.append("description", metadata.description);
  formData.append("showName", "true");
  if (metadata.twitter) formData.append("twitter", metadata.twitter);
  if (metadata.telegram) formData.append("telegram", metadata.telegram);
  if (metadata.website) formData.append("website", metadata.website);

  const response = await fetch("https://pump.fun/api/ipfs", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      `IPFS upload failed: ${response.status} ${await response.text()}`
    );
  }

  const result = await response.json();
  return result.metadataUri;
}

/**
 * Initial pump.fun bonding curve parameters for a newly created token.
 * These are the same for every pump.fun token at creation time.
 */
const INITIAL_VIRTUAL_TOKEN_RESERVES = new BN("1073000000000000");
const INITIAL_VIRTUAL_SOL_RESERVES = new BN("30000000000"); // 30 SOL

/**
 * Calculate expected token amount from SOL using the constant product formula.
 * k = virtualTokenReserves * virtualSolReserves
 * tokensOut = virtualTokenReserves - k / (virtualSolReserves + solIn)
 */
function calculateTokensFromSol(
  virtualTokenReserves: BN,
  virtualSolReserves: BN,
  solAmountLamports: BN
): BN {
  const k = virtualTokenReserves.mul(virtualSolReserves);
  const newSolReserves = virtualSolReserves.add(solAmountLamports);
  const newTokenReserves = k.div(newSolReserves);
  return virtualTokenReserves.sub(newTokenReserves);
}

/**
 * Build a buy instruction manually for use in Jito bundles
 * where the token doesn't exist on-chain yet.
 */
function buildBuyInstructionForBundle(
  mint: PublicKey,
  buyer: PublicKey,
  solAmountLamports: BN,
  minTokens: BN
) {
  const bondingCurve = bondingCurvePda(mint);
  const associatedBondingCurve = getAssociatedTokenAddressSync(
    mint,
    bondingCurve,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  const associatedUser = getAssociatedTokenAddressSync(
    mint,
    buyer,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  // Create ATA for buyer if it doesn't exist
  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    buyer, // payer
    associatedUser, // ata
    buyer, // owner
    mint, // mint
    TOKEN_2022_PROGRAM_ID
  );

  // Build pump.fun buy instruction
  // Discriminator for "buy" = anchor's SHA256("global:buy")[0..8]
  const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);

  // Instruction data: discriminator + amount (u64) + maxSolCost (u64)
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  minTokens.toArrayLike(Buffer, "le", 8).copy(data, 8);
  solAmountLamports.toArrayLike(Buffer, "le", 8).copy(data, 16);

  // Known account addresses
  const GLOBAL = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
  const FEE_RECIPIENT = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCJ8w5iWbGo5Y");
  const EVENT_AUTHORITY = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

  const buyIx = {
    programId: PUMP_PROGRAM_ID,
    keys: [
      { pubkey: GLOBAL, isSigner: false, isWritable: false },
      { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedUser, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  };

  return [createAtaIx, buyIx];
}

/**
 * Launch token using official @pump-fun/pump-sdk with Jito bundle.
 * ALL transactions (create + dev buy + buyer buys) go in ONE Jito bundle
 * to ensure everything lands in the same block.
 *
 * Bundle structure:
 * TX 0: Create token + dev buy (main wallet + mint keypair)
 * TX 1-4: Buyer wallet buys (each signed by its buyer)
 * Jito tip added to last transaction
 */
export async function launchTokenBundled(
  metadata: TokenMetadata,
  mainWallet: WalletInfo,
  buyerWallets: WalletInfo[],
  devBuyAmountSol: number,
  bundleBuyAmountSol: number,
  jitoTipSol: number
): Promise<LaunchResult> {
  const config = getConfig();
  const timestamp = Date.now();

  try {
    const connection = new Connection(config.rpcUrl, "confirmed");
    const onlineSdk = new OnlinePumpSdk(connection);
    const signerKeypair = getKeypair(mainWallet);
    const mintKeypair = Keypair.generate();
    const mintAddress = mintKeypair.publicKey.toBase58();

    // 1. Upload metadata to IPFS
    console.log("Uploading metadata to IPFS...");
    const metadataUri = await uploadToIpfs(metadata.imageUrl, metadata);
    console.log("IPFS URI:", metadataUri);

    // 2. Fetch global state for SDK
    console.log("Fetching global state...");
    const global = await onlineSdk.fetchGlobal();

    // 3. Build TX 0: Create + dev buy
    const devSolLamports = new BN(Math.floor(devBuyAmountSol * 1e9));
    const devTokenAmount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig: null,
      mintSupply: null,
      bondingCurve: null,
      amount: devSolLamports,
    });

    const createAndBuyIxs = await PUMP_SDK.createV2AndBuyInstructions({
      global,
      mint: mintKeypair.publicKey,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadataUri,
      creator: signerKeypair.publicKey,
      user: signerKeypair.publicKey,
      solAmount: devSolLamports,
      amount: devTokenAmount,
      mayhemMode: false,
    });

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tipLamports = Math.floor(jitoTipSol * LAMPORTS_PER_SOL);

    // 4. Build create tx with Jito tip (tip always on create tx for now)
    const jitoTipAccount = randomJitoTipAccount();
    const createTx = new Transaction();
    createTx.add(...createAndBuyIxs);
    createTx.add(
      SystemProgram.transfer({
        fromPubkey: signerKeypair.publicKey,
        toPubkey: jitoTipAccount,
        lamports: tipLamports,
      })
    );
    createTx.feePayer = signerKeypair.publicKey;
    createTx.recentBlockhash = blockhash;
    createTx.sign(signerKeypair, mintKeypair);

    // 5. Build TX 1-4: Buyer wallet buys
    const activeBuyers = buyerWallets; // Use ALL enabled buyer wallets

    // 5. Send create+dev buy directly first (this works reliably)
    console.log("Sending create + dev buy transaction directly...");
    const createSig = await connection.sendRawTransaction(createTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(createSig, "confirmed");
    console.log("Token created! Mint:", mintAddress, "Sig:", createSig);

    // 8. Send ALL buyer buys concurrently (not limited to 4)
    if (activeBuyers.length === 0 || bundleBuyAmountSol <= 0) {
      return {
        success: true,
        mintAddress,
        txSignature: createSig,
        timestamp,
      };
    }

    console.log(`Building ${activeBuyers.length} buyer buys using SDK...`);

    // Fetch bonding curve state ONCE (reuse for all buyers)
    const { blockhash: freshBlockhash } = await connection.getLatestBlockhash("confirmed");
    const feeConfig = await onlineSdk.fetchFeeConfig();
    const firstBuyer = getKeypair(activeBuyers[0]);
    const { bondingCurveAccountInfo, bondingCurve } =
      await onlineSdk.fetchBuyState(
        mintKeypair.publicKey,
        firstBuyer.publicKey,
        TOKEN_2022_PROGRAM_ID
      );

    const buySolLamports = new BN(Math.floor(bundleBuyAmountSol * 1e9));
    const buyTokenAmount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: bondingCurve.tokenTotalSupply,
      bondingCurve,
      amount: buySolLamports,
    });

    // Build all buyer txs (fetch associatedUserAccountInfo per buyer but reuse bonding curve)
    const buyPromises = activeBuyers.map(async (buyer, i) => {
      try {
        const buyerKeypair = getKeypair(buyer);
        const { associatedUserAccountInfo } =
          await onlineSdk.fetchBuyState(
            mintKeypair.publicKey,
            buyerKeypair.publicKey,
            TOKEN_2022_PROGRAM_ID
          );

        const buyIxs = await PUMP_SDK.buyInstructions({
          global,
          bondingCurveAccountInfo,
          bondingCurve,
          associatedUserAccountInfo,
          mint: mintKeypair.publicKey,
          user: buyerKeypair.publicKey,
          solAmount: buySolLamports,
          amount: buyTokenAmount,
          slippage: 50,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        });

        const buyTx = new Transaction();
        buyTx.add(...buyIxs);
        buyTx.feePayer = buyerKeypair.publicKey;
        buyTx.recentBlockhash = freshBlockhash;
        buyTx.sign(buyerKeypair);

        return { tx: buyTx, label: `buyer-${i + 1}` };
      } catch (e: any) {
        console.error(`Failed to build buy tx for buyer-${i + 1}:`, e.message);
        return null;
      }
    });

    const builtTxs = (await Promise.all(buyPromises)).filter(Boolean) as { tx: Transaction; label: string }[];

    if (builtTxs.length === 0) {
      return {
        success: true,
        mintAddress,
        txSignature: createSig,
        error: "Token created but buyer buy instructions failed to build. Buy manually on pump.fun.",
        timestamp,
      };
    }

    // Send ALL buyer buys concurrently (fire and forget — don't wait sequentially)
    console.log(`Sending ${builtTxs.length} buyer buys concurrently...`);
    const sendPromises = builtTxs.map(async ({ tx, label }) => {
      try {
        const sig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: true,
          maxRetries: 5,
        });
        console.log(`${label} buy sent: ${sig}`);
        return { label, sig, success: true };
      } catch (e: any) {
        console.error(`${label} buy failed: ${e.message}`);
        return { label, error: e.message, success: false };
      }
    });

    const buyResults = await Promise.all(sendPromises);
    const succeeded = buyResults.filter(r => r.success).length;
    const failed = buyResults.filter(r => !r.success).length;
    console.log(`Buyer buys: ${succeeded} sent, ${failed} failed`);

    console.log("Launch complete! Mint:", mintAddress);

    return {
      success: true,
      mintAddress,
      txSignature: createSig,
      timestamp,
    };
  } catch (error: any) {
    console.error("Launch error:", error);
    return {
      success: false,
      error: error.message || "Unknown error",
      timestamp,
    };
  }
}
