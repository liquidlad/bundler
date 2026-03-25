import {
  Keypair,
  Connection,
  Transaction,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  PUMP_SDK,
  OnlinePumpSdk,
  getBuyTokenAmountFromSolAmount,
  bondingCurvePda,
  bondingCurveV2Pda,
  creatorVaultPda,
  userVolumeAccumulatorPda,
  PUMP_PROGRAM_ID,
  GLOBAL_PDA,
  GLOBAL_VOLUME_ACCUMULATOR_PDA,
  PUMP_EVENT_AUTHORITY_PDA,
  PUMP_FEE_CONFIG_PDA,
  PUMP_FEE_PROGRAM_ID,
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

// Jito tip accounts
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4bPCLz2yGMCMGHUPcLAUJn8",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
];

function randomJitoTipAccount(): PublicKey {
  return new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
}

// Pump.fun fee recipient (constant across all tokens)
const FEE_RECIPIENT = new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");

// Buy instruction discriminator: SHA256("global:buy")[0..8]
const BUY_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);

// Initial bonding curve parameters for new pump.fun tokens
const INITIAL_VIRTUAL_TOKEN_RESERVES = new BN("1073000000000000");
const INITIAL_VIRTUAL_SOL_RESERVES = new BN("30000000000");

/**
 * Upload token image + metadata to IPFS via pump.fun API.
 */
async function uploadToIpfs(imageUrl: string, metadata: TokenMetadata): Promise<string> {
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) throw new Error(`Failed to download image: ${imgResponse.status}`);
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

  const response = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: formData });
  if (!response.ok) throw new Error(`IPFS upload failed: ${response.status} ${await response.text()}`);

  const result = await response.json();
  return result.metadataUri;
}

/**
 * Calculate tokens from SOL using constant product formula.
 */
function calculateTokensFromSol(vTokenRes: BN, vSolRes: BN, solLamports: BN): BN {
  const k = vTokenRes.mul(vSolRes);
  return vTokenRes.sub(k.div(vSolRes.add(solLamports)));
}

/**
 * Build a V2 buy instruction for Jito bundle (token doesn't exist yet on-chain).
 * Uses all 17 accounts exactly matching the SDK's output format.
 */
function buildV2BuyInstruction(
  mint: PublicKey,
  buyer: PublicKey,
  creator: PublicKey,
  solAmountLamports: BN,
  minTokens: BN
): TransactionInstruction[] {
  const bc = bondingCurvePda(mint);
  const bcV2 = bondingCurveV2Pda(mint);
  const assocBC = getAssociatedTokenAddressSync(mint, bc, true, TOKEN_2022_PROGRAM_ID);
  const assocUser = getAssociatedTokenAddressSync(mint, buyer, false, TOKEN_2022_PROGRAM_ID);
  const creatorVault = creatorVaultPda(creator);
  const userVolume = userVolumeAccumulatorPda(buyer);

  // 1. Create ATA for buyer (idempotent — safe if already exists)
  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    buyer, assocUser, buyer, mint, TOKEN_2022_PROGRAM_ID
  );

  // 2. Buy instruction with all 17 accounts
  // Data: discriminator + tokenAmount (how many tokens to buy) + maxSolCost (slippage cap)
  const maxSolCost = solAmountLamports.mul(new BN(2)); // 2x slippage cap
  const data = Buffer.alloc(8 + 8 + 8);
  BUY_DISCRIMINATOR.copy(data, 0);
  minTokens.toArrayLike(Buffer, "le", 8).copy(data, 8);   // token amount to buy
  maxSolCost.toArrayLike(Buffer, "le", 8).copy(data, 16);  // max SOL willing to pay

  const buyIx = new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: [
      { pubkey: GLOBAL_PDA, isSigner: false, isWritable: false },                    // [0]
      { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },                  // [1]
      { pubkey: mint, isSigner: false, isWritable: false },                           // [2]
      { pubkey: bc, isSigner: false, isWritable: true },                              // [3]
      { pubkey: assocBC, isSigner: false, isWritable: true },                         // [4]
      { pubkey: assocUser, isSigner: false, isWritable: true },                       // [5]
      { pubkey: buyer, isSigner: true, isWritable: true },                            // [6]
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },        // [7]
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },          // [8]
      { pubkey: creatorVault, isSigner: false, isWritable: true },                    // [9]
      { pubkey: PUMP_EVENT_AUTHORITY_PDA, isSigner: false, isWritable: false },       // [10]
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },                // [11]
      { pubkey: GLOBAL_VOLUME_ACCUMULATOR_PDA, isSigner: false, isWritable: false },  // [12]
      { pubkey: userVolume, isSigner: false, isWritable: true },                      // [13]
      { pubkey: PUMP_FEE_CONFIG_PDA, isSigner: false, isWritable: false },            // [14]
      { pubkey: PUMP_FEE_PROGRAM_ID, isSigner: false, isWritable: false },            // [15]
      { pubkey: bcV2, isSigner: false, isWritable: false },                           // [16]
    ],
    data,
  });

  return [createAtaIx, buyIx];
}

/**
 * Launch token with ALL transactions in a single Jito bundle.
 * Everything lands in the SAME BLOCK.
 *
 * Bundle structure:
 * TX 0: Create token + dev buy (SDK createV2AndBuyInstructions)
 * TX 1-N: Buyer wallet buys (manually constructed V2 buy instructions)
 * Jito tip on create TX (main wallet pays)
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
    // Jito max 5 txs per bundle: 1 create + up to 4 buyer buys
    // Remaining buyers will be sent directly after if Jito succeeds
    const jitoBuyers = buyerWallets.slice(0, 4);
    const extraBuyers = buyerWallets.slice(4);

    // 1. Upload metadata to IPFS + fetch global state in PARALLEL
    console.log("Uploading to IPFS + fetching global state...");
    const startTime = Date.now();
    const [metadataUri, global] = await Promise.all([
      uploadToIpfs(metadata.imageUrl, metadata),
      onlineSdk.fetchGlobal(),
    ]);
    console.log(`IPFS + global: ${Date.now() - startTime}ms`);

    // 2. Build transactions
    const devSolLamports = new BN(Math.floor(devBuyAmountSol * 1e9));
    const devTokenAmount = getBuyTokenAmountFromSolAmount({
      global, feeConfig: null, mintSupply: null, bondingCurve: null, amount: devSolLamports,
    });

    // 3. Build TX 0: Create + dev buy
    const createAndBuyIxs = await PUMP_SDK.createV2AndBuyInstructions({
      global, mint: mintKeypair.publicKey,
      name: metadata.name, symbol: metadata.symbol, uri: metadataUri,
      creator: signerKeypair.publicKey, user: signerKeypair.publicKey,
      solAmount: devSolLamports, amount: devTokenAmount, mayhemMode: false,
    });

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tipLamports = Math.floor(jitoTipSol * LAMPORTS_PER_SOL);

    const createTx = new Transaction();
    createTx.add(...createAndBuyIxs);

    // Jito tip always on create TX (main wallet pays)
    createTx.add(SystemProgram.transfer({
      fromPubkey: signerKeypair.publicKey, toPubkey: randomJitoTipAccount(), lamports: tipLamports,
    }));

    createTx.feePayer = signerKeypair.publicKey;
    createTx.recentBlockhash = blockhash;
    createTx.sign(signerKeypair, mintKeypair);

    // 4. Build buyer buy TXs with correct V2 instruction format
    const buyerTxs: Transaction[] = [];

    if (jitoBuyers.length > 0 && bundleBuyAmountSol > 0) {
      console.log(`Building ${jitoBuyers.length} buyer buy TXs for bundle...`);

      const buySolLamports = new BN(Math.floor(bundleBuyAmountSol * 1e9));

      // Calculate expected curve state after dev buy
      const devTokensBought = calculateTokensFromSol(INITIAL_VIRTUAL_TOKEN_RESERVES, INITIAL_VIRTUAL_SOL_RESERVES, devSolLamports);
      let curTokenRes = INITIAL_VIRTUAL_TOKEN_RESERVES.sub(devTokensBought);
      let curSolRes = INITIAL_VIRTUAL_SOL_RESERVES.add(devSolLamports);

      for (let i = 0; i < jitoBuyers.length; i++) {
        const buyerKeypair = getKeypair(jitoBuyers[i]);

        // Calculate expected tokens for this buyer
        const expectedTokens = calculateTokensFromSol(curTokenRes, curSolRes, buySolLamports);

        curTokenRes = curTokenRes.sub(expectedTokens);
        curSolRes = curSolRes.add(buySolLamports);

        const buyIxs = buildV2BuyInstruction(
          mintKeypair.publicKey,
          buyerKeypair.publicKey,
          signerKeypair.publicKey, // creator = main wallet
          buySolLamports,
          expectedTokens // full expected token amount
        );

        const buyTx = new Transaction();
        buyTx.add(...buyIxs);
        buyTx.feePayer = buyerKeypair.publicKey;
        buyTx.recentBlockhash = blockhash;
        buyTx.sign(buyerKeypair);

        buyerTxs.push(buyTx);
      }
    }

    // 5. Submit as single Jito bundle
    const allTxsBase58 = [
      bs58.encode(createTx.serialize()),
      ...buyerTxs.map(tx => bs58.encode(tx.serialize())),
    ];

    console.log(`Submitting Jito bundle: 1 create + ${buyerTxs.length} buys...`);

    const jitoEndpoints = [
      "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
      "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
      "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles",
      "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
      "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
    ];

    let jitoSuccess = false;
    let jitoError = "";

    for (const endpoint of jitoEndpoints) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendBundle", params: [allTxsBase58] }),
        });
        const result = await res.json();
        if (!result.error) {
          console.log("Jito accepted via", endpoint, "Bundle:", result.result);
          jitoSuccess = true;
          break;
        }
        jitoError = JSON.stringify(result.error);
        console.log("Jito rejected at", endpoint, ":", jitoError);
      } catch (e: any) {
        jitoError = e.message;
      }
    }

    // 6. Verify on-chain
    if (jitoSuccess) {
      console.log("Waiting for on-chain confirmation...");
      let confirmed = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await connection.getAccountInfo(mintKeypair.publicKey)) {
          confirmed = true;
          break;
        }
      }

      if (confirmed) {
        console.log("SAME-BLOCK LAUNCH SUCCESS! Mint:", mintAddress);

        // Send extra buyers (wallets 5+) if any
        if (extraBuyers.length > 0) {
          console.log(`Sending ${extraBuyers.length} extra buyer buys...`);
          const { blockhash: freshHash } = await connection.getLatestBlockhash("confirmed");
          const feeConfig = await onlineSdk.fetchFeeConfig();
          const { bondingCurveAccountInfo, bondingCurve } =
            await onlineSdk.fetchBuyState(mintKeypair.publicKey, getKeypair(extraBuyers[0]).publicKey, TOKEN_2022_PROGRAM_ID);
          const buySolLamports = new BN(Math.floor(bundleBuyAmountSol * 1e9));
          const tokenAmt = getBuyTokenAmountFromSolAmount({
            global, feeConfig, mintSupply: bondingCurve.tokenTotalSupply, bondingCurve, amount: buySolLamports,
          });

          await Promise.all(extraBuyers.map(async (buyer) => {
            try {
              const kp = getKeypair(buyer);
              const ixs = await PUMP_SDK.buyInstructions({
                global, bondingCurveAccountInfo, bondingCurve,
                associatedUserAccountInfo: null, mint: mintKeypair.publicKey,
                user: kp.publicKey, solAmount: buySolLamports, amount: tokenAmt,
                slippage: 50, tokenProgram: TOKEN_2022_PROGRAM_ID,
              });
              const tx = new Transaction().add(...ixs);
              tx.feePayer = kp.publicKey;
              tx.recentBlockhash = freshHash;
              tx.sign(kp);
              await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
            } catch (e: any) {
              console.error("Extra buyer failed:", e.message);
            }
          }));
        }

        return { success: true, mintAddress, txSignature: bs58.encode(createTx.signature!), timestamp };
      }

      // Bundle accepted but dropped — fall through to direct send
      console.log("Jito bundle dropped. Falling back to direct send...");
    }

    // 7. Fallback: send create directly, then buyer buys concurrently
    console.log("Sending create tx directly...");
    const createSig = await connection.sendRawTransaction(createTx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(createSig, "confirmed");
    console.log("Token created:", mintAddress);

    if (buyerTxs.length > 0) {
      // Rebuild buyer txs with fresh blockhash (old one may be expired)
      const { blockhash: freshHash } = await connection.getLatestBlockhash("confirmed");
      const allBuyers = [...jitoBuyers, ...extraBuyers];
      const freshBuyerTxs = await Promise.all(allBuyers.map(async (buyer, i) => {
        try {
          const buyerKeypair = getKeypair(buyer);
          const buySolLamports = new BN(Math.floor(bundleBuyAmountSol * 1e9));

          const { bondingCurveAccountInfo, bondingCurve } =
            await onlineSdk.fetchBuyState(mintKeypair.publicKey, buyerKeypair.publicKey, TOKEN_2022_PROGRAM_ID);

          const tokenAmount = getBuyTokenAmountFromSolAmount({
            global, feeConfig: await onlineSdk.fetchFeeConfig(),
            mintSupply: bondingCurve.tokenTotalSupply, bondingCurve, amount: buySolLamports,
          });

          const buyIxs = await PUMP_SDK.buyInstructions({
            global, bondingCurveAccountInfo, bondingCurve,
            associatedUserAccountInfo: null, mint: mintKeypair.publicKey,
            user: buyerKeypair.publicKey, solAmount: buySolLamports,
            amount: tokenAmount, slippage: 50, tokenProgram: TOKEN_2022_PROGRAM_ID,
          });

          const tx = new Transaction().add(...buyIxs);
          tx.feePayer = buyerKeypair.publicKey;
          tx.recentBlockhash = freshHash;
          tx.sign(buyerKeypair);
          return tx;
        } catch (e: any) {
          console.error(`buyer-${i + 1} build failed:`, e.message);
          return null;
        }
      }));

      const validTxs = freshBuyerTxs.filter(Boolean) as Transaction[];
      console.log(`Sending ${validTxs.length} buyer buys concurrently...`);
      await Promise.all(validTxs.map(tx =>
        connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 }).catch(() => {})
      ));
    }

    return {
      success: true, mintAddress, txSignature: createSig,
      error: jitoError ? `Token created but Jito failed (${jitoError}). Buys sent separately.` : undefined,
      timestamp,
    };
  } catch (error: any) {
    console.error("Launch error:", error);
    return { success: false, error: error.message || "Unknown error", timestamp };
  }
}
