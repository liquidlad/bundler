import { NextRequest, NextResponse } from "next/server";
import { getIpfsCache } from "@/lib/bundler/launcher";

export async function POST(req: NextRequest) {
  try {
    const { metadata } = await req.json();
    if (!metadata?.imageUrl) {
      return NextResponse.json({ error: "No image URL" }, { status: 400 });
    }

    const ipfsCache = getIpfsCache();
    const cacheKey = `${metadata.imageUrl}:${metadata.name}:${metadata.symbol}`;

    // Already cached
    if (ipfsCache.has(cacheKey)) {
      return NextResponse.json({ metadataUri: ipfsCache.get(cacheKey), cached: true });
    }

    // Download image
    const imgResponse = await fetch(metadata.imageUrl);
    if (!imgResponse.ok) throw new Error(`Image download failed: ${imgResponse.status}`);
    const imgBlob = await imgResponse.blob();

    // Upload to pump.fun IPFS
    const formData = new FormData();
    formData.append("file", imgBlob, "token-image.png");
    formData.append("name", metadata.name);
    formData.append("symbol", metadata.symbol);
    formData.append("description", metadata.description || "");
    formData.append("showName", "true");
    if (metadata.twitter) formData.append("twitter", metadata.twitter);
    if (metadata.telegram) formData.append("telegram", metadata.telegram);
    if (metadata.website) formData.append("website", metadata.website);

    const response = await fetch("https://pump.fun/api/ipfs", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error(`IPFS upload failed: ${response.status}`);

    const result = await response.json();
    ipfsCache.set(cacheKey, result.metadataUri);

    console.log("Pre-uploaded to IPFS:", result.metadataUri);
    return NextResponse.json({ metadataUri: result.metadataUri, cached: false });
  } catch (error: any) {
    console.error("Pre-upload error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
