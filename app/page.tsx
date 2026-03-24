"use client";

import { useEffect, useState } from "react";
import type { WalletInfo, LaunchResult } from "@/lib/types";

export default function Dashboard() {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [mainWallet, setMainWallet] = useState<WalletInfo | null>(null);
  const [launches, setLaunches] = useState<LaunchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Fetch real on-chain balances
      const res = await fetch("/api/balances");
      const data = await res.json();
      setWallets(data.wallets || []);
      setMainWallet(data.mainWallet || null);
      setLaunches(data.recentLaunches || []);
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }

  const totalBalance = wallets.reduce((sum, w) => sum + w.balanceSol, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="label">Main Wallet</p>
          <p className="text-lg font-mono truncate">
            {mainWallet ? mainWallet.publicKey.slice(0, 8) + "..." : "Not set"}
          </p>
          <p style={{ color: "var(--accent)" }} className="text-sm mt-1">
            {mainWallet ? `${mainWallet.balanceSol.toFixed(4)} SOL` : "--"}
          </p>
        </div>
        <div className="card">
          <p className="label">Buyer Wallets</p>
          <p className="text-2xl font-bold">{wallets.length}</p>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-1">
            of 30 max
          </p>
        </div>
        <div className="card">
          <p className="label">Total Balance</p>
          <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
            {totalBalance.toFixed(4)}
          </p>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-1">
            SOL across all wallets
          </p>
        </div>
        <div className="card">
          <p className="label">Launches</p>
          <p className="text-2xl font-bold">{launches.length}</p>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-1">
            tokens created
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <a href="/launch" className="btn-primary">
            Launch Token
          </a>
          <a href="/wallets" className="btn-primary" style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            Manage Wallets
          </a>
        </div>
      </div>

      {/* Recent Launches */}
      {launches.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Recent Launches</h3>
          <div className="space-y-3">
            {launches.map((launch, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: "var(--bg-secondary)" }}
              >
                <div>
                  <p className="font-mono text-sm truncate" style={{ maxWidth: 300 }}>
                    {launch.mintAddress || "Failed"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {new Date(launch.timestamp).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`status-dot ${launch.success ? "active" : "error"}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
