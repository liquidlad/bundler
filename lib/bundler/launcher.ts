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

    const createTx = new Transaction();
    createTx.add(...createAndBuyIxs);
    createTx.feePayer = signerKeypair.publicKey;
    createTx.recentBlockhash = blockhash;
    createTx.sign(signerKeypair, mintKeypair);

    // 4. Build TX 1-4: Buyer wallet buys
    const activeBuyers = buyerWallets.slice(0, 4); // Max 5 txs per Jito bundle
    const buyerTxs: Transaction[] = [];

    if (activeBuyers.length > 0 && bundleBuyAmountSol > 0) {
      console.log(`Building ${activeBuyers.length} buyer buy transactions...`);

      const buySolLamports = new BN(Math.floor(bundleBuyAmountSol * 1e9));

      // Calculate expected curve state after dev buy
      const postDevTokenReserves = INITIAL_VIRTUAL_TOKEN_RESERVES.sub(
        calculateTokensFromSol(
          INITIAL_VIRTUAL_TOKEN_RESERVES,
          INITIAL_VIRTUAL_SOL_RESERVES,
          devSolLamports
        )
      );
      const postDevSolReserves = INITIAL_VIRTUAL_SOL_RESERVES.add(devSolLamports);

      // Running curve state for each subsequent buyer
      let currentTokenReserves = postDevTokenReserves;
      let currentSolReserves = postDevSolReserves;

      for (let i = 0; i < activeBuyers.length; i++) {
        const buyerKeypair = getKeypair(activeBuyers[i]);

        // Calculate expected tokens for this buyer
        const expectedTokens = calculateTokensFromSol(
          currentTokenReserves,
          currentSolReserves,
          buySolLamports
        );

        // Use 1% of expected as minimum (very generous slippage for bundle safety)
        const minTokens = expectedTokens.div(new BN(100));

        // Update running reserves for next buyer's calculation
        currentTokenReserves = currentTokenReserves.sub(expectedTokens);
        currentSolReserves = currentSolReserves.add(buySolLamports);

        // Build buy instructions
        const buyIxs = buildBuyInstructionForBundle(
          mintKeypair.publicKey,
          buyerKeypair.publicKey,
          buySolLamports,
          minTokens
        );

        const buyTx = new Transaction();
        buyTx.add(...buyIxs);

        // Add Jito tip to the LAST transaction in the bundle
        if (i === activeBuyers.length - 1) {
          const tipLamports = Math.floor(jitoTipSol * LAMPORTS_PER_SOL);
          buyTx.add(
            SystemProgram.transfer({
              fromPubkey: buyerKeypair.publicKey,
              toPubkey: randomJitoTipAccount(),
              lamports: tipLamports,
            })
          );
        }

        buyTx.feePayer = buyerKeypair.publicKey;
        buyTx.recentBlockhash = blockhash;
        buyTx.sign(buyerKeypair);

        buyerTxs.push(buyTx);
      }
    }

    // 5. Submit everything as ONE Jito bundle
    console.log(`Submitting Jito bundle: 1 create + ${buyerTxs.length} buys...`);

    const allTxsBase58 = [
      bs58.encode(createTx.serialize()),
      ...buyerTxs.map((tx) => bs58.encode(tx.serialize())),
    ];

    // Try multiple Jito endpoints for reliability
    const jitoEndpoints = [
      "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
      "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles",
      "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
      "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
      "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
    ];

    let jitoSuccess = false;
    let jitoError = "";

    for (const endpoint of jitoEndpoints) {
      try {
        const jitoResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [allTxsBase58],
          }),
        });

        const jitoResult = await jitoResponse.json();

        if (!jitoResult.error) {
          console.log("Jito bundle accepted via", endpoint);
          console.log("Bundle ID:", jitoResult.result);
          jitoSuccess = true;
          break;
        } else {
          jitoError = JSON.stringify(jitoResult.error);
          console.log("Jito rejected at", endpoint, ":", jitoError);
        }
      } catch (e: any) {
        jitoError = e.message;
        console.log("Jito error at", endpoint, ":", e.message);
      }
    }

    if (!jitoSuccess) {
      // Fallback: send create tx directly, then buys individually
      console.log("All Jito endpoints failed. Sending transactions directly...");

      const createSig = await connection.sendRawTransaction(createTx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      await connection.confirmTransaction(createSig, "confirmed");
      console.log("Create confirmed:", createSig);

      for (const buyTx of buyerTxs) {
        try {
          await connection.sendRawTransaction(buyTx.serialize(), {
            skipPreflight: true,
            maxRetries: 3,
          });
        } catch (e: any) {
          console.error("Individual buy failed:", e.message);
        }
      }

      return {
        success: true,
        mintAddress,
        txSignature: createSig,
        error: `Token launched but Jito failed (${jitoError}). Buys sent individually — may not be in same block.`,
        timestamp,
      };
    }

    // Wait for on-chain confirmation (poll for mint account)
    const createSig = bs58.encode(createTx.signature!);
    console.log("Jito accepted. Waiting for on-chain confirmation...");

    let confirmed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((r) => setTimeout(r, 2000)); // 2s between checks
      const mintAccount = await connection.getAccountInfo(
        mintKeypair.publicKey
      );
      if (mintAccount) {
        confirmed = true;
        console.log("Token confirmed on-chain! Mint:", mintAddress);
        break;
      }
      console.log(`Waiting... attempt ${attempt + 1}/30`);
    }

    if (!confirmed) {
      // Bundle was accepted but never landed
      console.error("Bundle was accepted by Jito but never landed on-chain");
      return {
        success: false,
        mintAddress,
        error: "Jito bundle was accepted but dropped — token was NOT created. Try again with a higher Jito tip.",
        timestamp,
      };
    }

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
