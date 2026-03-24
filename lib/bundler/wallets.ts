import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import os from "os";
import type { WalletInfo } from "../types";

const WALLETS_DIR = path.join(process.cwd(), ".wallets");
const WALLETS_FILE = path.join(WALLETS_DIR, "wallets.json");
const BACKUPS_DIR = path.join(WALLETS_DIR, "backups");

// Vault: separate backup location outside the project folder — never overwritten
const VAULT_DIR = path.join(os.homedir(), ".bundler-vault");

function ensureDir() {
  for (const dir of [WALLETS_DIR, BACKUPS_DIR, VAULT_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Auto-backup existing wallets before overwriting.
 * Saves to TWO locations:
 * 1. .wallets/backups/ (inside project — convenient)
 * 2. ~/.bundler-vault/ (outside project — safe from accidental deletion)
 *
 * Backups are timestamped and NEVER deleted or overwritten.
 */
function backupWallets() {
  ensureDir();
  if (!existsSync(WALLETS_FILE)) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const data = readFileSync(WALLETS_FILE, "utf-8");

  // Backup 1: inside project
  const backupFile = path.join(BACKUPS_DIR, `wallets-${timestamp}.json`);
  writeFileSync(backupFile, data);

  // Backup 2: vault outside project (survives project deletion)
  const vaultFile = path.join(VAULT_DIR, `wallets-${timestamp}.json`);
  writeFileSync(vaultFile, data);
}

/**
 * Every wallet ever generated is also appended to the master vault log.
 * This is an append-only file — keys are never removed from it.
 */
function appendToVaultLog(wallets: WalletInfo[]) {
  ensureDir();
  const logFile = path.join(VAULT_DIR, "all-keys-ever.json");

  let existing: WalletInfo[] = [];
  if (existsSync(logFile)) {
    try {
      existing = JSON.parse(readFileSync(logFile, "utf-8"));
    } catch {
      existing = [];
    }
  }

  // Only append keys we haven't seen before
  const existingKeys = new Set(existing.map((w) => w.publicKey));
  const newWallets = wallets.filter((w) => !existingKeys.has(w.publicKey));

  if (newWallets.length > 0) {
    const updated = [
      ...existing,
      ...newWallets.map((w) => ({
        ...w,
        generatedAt: new Date().toISOString(),
      })),
    ];
    writeFileSync(logFile, JSON.stringify(updated, null, 2));
  }
}

export function listBackups(): string[] {
  ensureDir();
  return readdirSync(BACKUPS_DIR)
    .filter((f: string) => f.endsWith(".json"))
    .sort()
    .reverse();
}

export function getVaultPath(): string {
  return VAULT_DIR;
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
  appendToVaultLog(wallets); // Append to permanent vault log
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
