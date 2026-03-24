// Image upload to IPFS via pump.fun API

/**
 * Uploads token image to IPFS using pump.fun's API endpoint.
 * Returns the IPFS URI for use in token metadata.
 *
 * Endpoint: POST https://pump.fun/api/ipfs
 * Accepts: PNG/JPG image file
 * Returns: { metadataUri: string }
 */

// TODO: Implement IPFS upload
// - Download image from URL (tweet attachment)
// - Upload to pump.fun/api/ipfs
// - Return metadata URI

export async function uploadToIpfs(imageUrl: string): Promise<string> {
  throw new Error("Not yet implemented");
}
