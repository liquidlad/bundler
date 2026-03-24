/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@solana/web3.js", "bs58"],
  },
};

module.exports = nextConfig;
