import {
  Keypair,
  Connection,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  PublicKey,
} from "@solana/web3.js";
import {
  PUMP_SDK,
  OnlinePumpSdk,
  getBuyTokenAmountFromSolAmount,
} from "@pump-fun/pump-sdk";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";
import type { TokenMetadata, LaunchResult, WalletInfo } from "../types";
import { getKeypair } from "./wallets";
import { getConfig } from "../config";

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
 * Launch token using official @pump-fun/pump-sdk.
 *
 * Step 1: Upload metadata to IPFS
 * Step 2: Create token + dev buy (atomic, same tx)
 * Step 3: Bundle buy with buyer wallets via Jito
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

    // 2. Fetch global state for price calculation
    console.log("Fetching global state...");
    const global = await onlineSdk.fetchGlobal();

    // Calculate token amount for dev buy
    const devSolLamports = new BN(Math.floor(devBuyAmountSol * 1e9));
    const devTokenAmount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig: null,
      mintSupply: null,
      bondingCurve: null,
      amount: devSolLamports,
    });

    // 3. Build create + dev buy instructions
    console.log("Building create + dev buy transaction...");
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

    // Build and sign the create+buy transaction
    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    const createTx = new Transaction();
    createTx.add(...createAndBuyIxs);
    createTx.feePayer = signerKeypair.publicKey;
    createTx.recentBlockhash = blockhash;
    createTx.sign(signerKeypair, mintKeypair);

    // 4. Send create+dev buy tx and confirm
    console.log("Sending create + dev buy transaction...");
    const createSig = await connection.sendRawTransaction(createTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(createSig, "confirmed");
    console.log("Token created! Mint:", mintAddress, "Sig:", createSig);

    // 5. Build buyer wallet buy transactions (now the token exists on-chain)
    const activeBuyers = buyerWallets.slice(0, 4);
    const buyerTxs: Transaction[] = [];

    if (activeBuyers.length > 0 && bundleBuyAmountSol > 0) {
      console.log(`Building ${activeBuyers.length} buyer buy transactions...`);

      const feeConfig = await onlineSdk.fetchFeeConfig();
      const buySolLamports = new BN(Math.floor(bundleBuyAmountSol * 1e9));

      for (const buyer of activeBuyers) {
        const buyerKeypair = getKeypair(buyer);

        // Fetch current bonding curve state (token now exists)
        const { bondingCurveAccountInfo, bondingCurve, associatedUserAccountInfo } =
          await onlineSdk.fetchBuyState(
            mintKeypair.publicKey,
            buyerKeypair.publicKey,
            TOKEN_2022_PROGRAM_ID
          );

        const buyTokenAmount = getBuyTokenAmountFromSolAmount({
          global,
          feeConfig,
          mintSupply: bondingCurve.tokenTotalSupply,
          bondingCurve,
          amount: buySolLamports,
        });

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

        const freshBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
        const buyTx = new Transaction();
        buyTx.add(...buyIxs);
        buyTx.feePayer = buyerKeypair.publicKey;
        buyTx.recentBlockhash = freshBlockhash;
        buyTx.sign(buyerKeypair);

        buyerTxs.push(buyTx);
      }
    }

    if (buyerTxs.length === 0) {
      return {
        success: true,
        mintAddress,
        txSignature: createSig,
        timestamp,
      };
    }

    // 6. Submit buyer buys as Jito bundle (all in same block)
    console.log("Submitting buyer buy bundle to Jito...");

    const buyTxsBase58 = buyerTxs.map((tx) => bs58.encode(tx.serialize()));

    const jitoResponse = await fetch(
      "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sendBundle",
          params: [buyTxsBase58],
        }),
      }
    );

    const jitoResult = await jitoResponse.json();

    if (jitoResult.error) {
      console.error("Jito bundle failed, sending buys individually:", jitoResult.error);
      // Fallback: send each buy tx individually
      for (const buyTx of buyerTxs) {
        try {
          await connection.sendRawTransaction(buyTx.serialize(), { skipPreflight: false, maxRetries: 3 });
        } catch (e: any) {
          console.error("Individual buy failed:", e.message);
        }
      }
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
