// Generate buyer wallets and save keypairs locally
// Usage: npm run generate-wallets

import { generateWallets } from "../src/bundler/wallets";
import { config } from "../src/config";

// TODO: Generate wallets, encrypt and save to local file
// - Generate N keypairs
// - Save to wallets/ directory (gitignored)
// - Print public keys for verification

console.log(`Generating ${config.numBuyerWallets} buyer wallets...`);
const wallets = generateWallets(config.numBuyerWallets, config.buyAmountSol);
wallets.forEach((w) => {
  console.log(`  ${w.label}: ${w.keypair.publicKey.toBase58()}`);
});
