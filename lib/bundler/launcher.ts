import { Keypair, VersionedTransaction, Connection } from "@solana/web3.js";
import bs58 from "bs58";
import type { TokenMetadata, LaunchResult, WalletInfo } from "../types";
import { getKeypair } from "./wallets";
import { getConfig } from "../config";

/**
 * Launch a token on Pump.fun via PumpPortal API.
 *
 * PumpPortal flow:
 * 1. Generate a new mint keypair
 * 2. Upload image to IPFS via pump.fun/api/ipfs
 * 3. Send create + buy requests to PumpPortal
 * 4. PumpPortal returns serialized transactions
 * 5. Sign transactions locally
 * 6. PumpPortal submits as Jito bundle
 *
 * Docs: https://pumpportal.fun/creation/
 */

async function uploadImageToIpfs(imageUrl: string, metadata: TokenMetadata): Promise<string> {
  // Download the image
  const imgResponse = await fetch(imageUrl);
  const imgBlob = await imgResponse.blob();

  // Upload to pump.fun IPFS
  const formData = new FormData();
  formData.append("file", imgBlob, "token-image.png");
  formData.append("name", metadata.name);
  formData.append("symbol", metadata.symbol);
  formData.append("description", metadata.description);
  if (metadata.twitter) formData.append("twitter", metadata.twitter);
  if (metadata.telegram) formData.append("telegram", metadata.telegram);
  if (metadata.website) formData.append("website", metadata.website);

  const response = await fetch("https://pump.fun/api/ipfs", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`IPFS upload failed: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  return result.metadataUri;
}

export async function launchToken(
  metadata: TokenMetadata,
  mainWallet: WalletInfo,
  buyerWallets: WalletInfo[],
  buyAmountSol: number,
  jitoTipSol: number
): Promise<LaunchResult> {
  const config = getConfig();
  const connection = new Connection(config.rpcUrl);
  const timestamp = Date.now();

  try {
    // 1. Generate mint keypair
    const mintKeypair = Keypair.generate();

    // 2. Upload metadata to IPFS
    const metadataUri = await uploadImageToIpfs(metadata.imageUrl, metadata);

    // 3. Build the bundle request for PumpPortal
    // Main wallet creates the token + does first buy
    const signerKeypair = getKeypair(mainWallet);

    const bundleRequests = [
      // Transaction 0: Create token + dev buy
      {
        action: "create",
        tokenMetadata: {
          name: metadata.name,
          symbol: metadata.symbol,
          uri: metadataUri,
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: "true",
        amount: buyAmountSol,
        slippage: config.defaultSlippageBps / 100,
        priorityFee: jitoTipSol,
        pool: "pump",
      },
      // Transactions 1-N: Buyer wallet buys
      ...buyerWallets.slice(0, 4).map((w) => ({
        action: "buy" as const,
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: "true",
        amount: buyAmountSol,
        slippage: config.defaultSlippageBps / 100,
        priorityFee: jitoTipSol,
        pool: "pump",
      })),
    ];

    // 4. Send to PumpPortal for transaction generation
    const response = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundleRequests[0]), // Create tx first
    });

    if (!response.ok) {
      throw new Error(`PumpPortal API error: ${response.status} ${await response.text()}`);
    }

    // 5. Deserialize, sign, and send
    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    tx.sign([signerKeypair, mintKeypair]);

    const sig = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    // 6. Confirm
    const confirmation = await connection.confirmTransaction(sig, "confirmed");
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return {
      success: true,
      mintAddress: mintKeypair.publicKey.toBase58(),
      txSignature: sig,
      timestamp,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error",
      timestamp,
    };
  }
}

/**
 * Launch token with bundled buys using PumpPortal's bundle endpoint.
 * This sends create + multiple buys as a Jito bundle (all same block).
 */
export async function launchTokenBundled(
  metadata: TokenMetadata,
  mainWallet: WalletInfo,
  buyerWallets: WalletInfo[],
  buyAmountSol: number,
  jitoTipSol: number
): Promise<LaunchResult> {
  const config = getConfig();
  const timestamp = Date.now();

  try {
    const mintKeypair = Keypair.generate();
    const metadataUri = await uploadImageToIpfs(metadata.imageUrl, metadata);
    const signerKeypair = getKeypair(mainWallet);

    // PumpPortal bundle: up to 5 txs (create + 4 buys)
    // For more wallets, we send additional buy bundles after
    const activeBuyers = buyerWallets.slice(0, 4);

    const createPayload = {
      action: "create",
      tokenMetadata: {
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadataUri,
      },
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: "true",
      amount: buyAmountSol,
      slippage: config.defaultSlippageBps / 100,
      priorityFee: jitoTipSol,
      pool: "pump",
    };

    const buyPayloads = activeBuyers.map(() => ({
      action: "buy" as const,
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: "true",
      amount: buyAmountSol,
      slippage: config.defaultSlippageBps / 100,
      priorityFee: jitoTipSol,
      pool: "pump",
    }));

    // Send bundle request
    const allPayloads = [createPayload, ...buyPayloads];
    const response = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(allPayloads),
    });

    if (!response.ok) {
      throw new Error(`PumpPortal bundle error: ${response.status} ${await response.text()}`);
    }

    // PumpPortal returns array of serialized transactions
    const txsData = await response.json();
    const connection = new Connection(config.rpcUrl);

    // Sign each transaction with the appropriate keypair
    const signedTxs: Uint8Array[] = [];
    for (let i = 0; i < txsData.length; i++) {
      const txBytes = Buffer.from(txsData[i], "base64");
      const tx = VersionedTransaction.deserialize(txBytes);

      if (i === 0) {
        // Create tx: sign with main wallet + mint keypair
        tx.sign([signerKeypair, mintKeypair]);
      } else {
        // Buy tx: sign with buyer wallet
        const buyerKp = getKeypair(activeBuyers[i - 1]);
        tx.sign([buyerKp]);
      }

      signedTxs.push(tx.serialize());
    }

    // Submit as Jito bundle via PumpPortal
    const bundleResponse = await fetch("https://pumpportal.fun/api/send-bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: signedTxs.map((tx) => Buffer.from(tx).toString("base64")),
      }),
    });

    if (!bundleResponse.ok) {
      throw new Error(`Bundle submission failed: ${bundleResponse.status}`);
    }

    const bundleResult = await bundleResponse.json();

    return {
      success: true,
      mintAddress: mintKeypair.publicKey.toBase58(),
      txSignature: bundleResult.signature || bundleResult.bundleId,
      timestamp,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error",
      timestamp,
    };
  }
}
