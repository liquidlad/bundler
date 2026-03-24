import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import type { WalletInfo } from "../types";

const WALLETS_DIR = path.join(process.cwd(), ".wallets");
const WALLETS_FILE = path.join(WALLETS_DIR, "wallets.json");
const BACKUPS_DIR = path.join(WALLETS_DIR, "backups");

function ensureDir() {
  if (!existsSync(WALLETS_DIR)) {
    mkdirSync(WALLETS_DIR, { recursive: true });
  }
  if (!existsSync(BACKUPS_DIR)) {
    mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

/**
 * Auto-backup existing wallets before overwriting.
 * Backups are timestamped and never deleted automatically.
 */
function backupWallets() {
  ensureDir();
  if (!existsSync(WALLETS_FILE)) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUPS_DIR, `wallets-${timestamp}.json`);
  const data = readFileSync(WALLETS_FILE, "utf-8");
  writeFileSync(backupFile, data);
}

export function listBackups(): string[] {
  ensureDir();
  if (!existsSync(BACKUPS_DIR)) return [];
  const { readdirSync } = require("fs");
  return readdirSync(BACKUPS_DIR)
    .filter((f: string) => f.endsWith(".json"))
    .sort()
    .reverse();
}

export function restoreBackup(filename: string): WalletInfo[] {
  const backupFile = path.join(BACKUPS_DIR, filename);
  if (!existsSync(backupFile)) throw new Error(`Backup not found: ${filename}`);
  const data = readFileSync(backupFile, "utf-8");
  const wallets = JSON.parse(data);
  saveWallets(wallets);
  return wallets;
}

export function generateWallets(count: number): WalletInfo[] {
  const wallets: WalletInfo[] = [];
  for (let i = 0; i < count; i++) {
    const kp = Keypair.generate();
    wallets.push({
      publicKey: kp.publicKey.toBase58(),
      privateKey: bs58.encode(kp.secretKey),
      label: `buyer-${i + 1}`,
      balanceSol: 0,
    });
  }
  return wallets;
}

export function saveWallets(wallets: WalletInfo[]) {
  ensureDir();
  backupWallets(); // Always backup before saving
  writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2));
}

export function loadWallets(): WalletInfo[] {
  if (!existsSync(WALLETS_FILE)) return [];
  const data = readFileSync(WALLETS_FILE, "utf-8");
  return JSON.parse(data);
}

export function getKeypair(wallet: WalletInfo): Keypair {
  return Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
}

export async function getBalance(
  connection: Connection,
  publicKey: string
): Promise<number> {
  const balance = await connection.getBalance(new PublicKey(publicKey));
  return balance / LAMPORTS_PER_SOL;
}

export async function refreshBalances(
  connection: Connection,
  wallets: WalletInfo[]
): Promise<WalletInfo[]> {
  const updated = await Promise.all(
    wallets.map(async (w) => ({
      ...w,
      balanceSol: await getBalance(connection, w.publicKey),
    }))
  );
  return updated;
}
