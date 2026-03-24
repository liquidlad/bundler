"use client";

import { useState } from "react";

interface SellResultItem {
  label: string;
  wallet: string;
  success: boolean;
  txSignature?: string;
  error?: string;
}

export default function SellPage() {
  const [mintAddress, setMintAddress] = useState("");
  const [sellPercentage, setSellPercentage] = useState("100");
  const [sellFromMain, setSellFromMain] = useState(true);
  const [slippage, setSlippage] = useState("10");
  const [priorityFee, setPriorityFee] = useState("0.001");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<SellResultItem[] | null>(null);

  async function handleSell() {
    if (!mintAddress.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);

    try {
      const res = await fetch("/api/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mintAddress: mintAddress.trim(),
          sellPercentage: parseInt(sellPercentage),
          sellFromMain,
          slippageBps: parseInt(slippage) * 100,
          priorityFee: parseFloat(priorityFee),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sell failed");

      setResults(data.results);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Sell Tokens</h2>

      {error && (
        <div
          className="p-4 rounded-lg border"
          style={{ background: "#1a0a0e", borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      <div className="card space-y-4">
        <h3 className="text-lg font-semibold">Sell Configuration</h3>

        <div>
          <label className="label">Token Mint Address</label>
          <input
            type="text"
            className="input-field"
            value={mintAddress}
            onChange={(e) => setMintAddress(e.target.value)}
            placeholder="Paste the token mint address..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Sell Percentage</label>
            <div className="flex gap-2">
              {["25", "50", "75", "100"].map((pct) => (
                <button
                  key={pct}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: sellPercentage === pct ? "var(--accent)" : "var(--bg-secondary)",
                    color: sellPercentage === pct ? "#000" : "var(--text-secondary)",
                  }}
                  onClick={() => setSellPercentage(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Slippage %</label>
            <input
              type="number"
              className="input-field"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              min="1"
              max="50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Priority Fee (SOL)</label>
            <input
              type="number"
              className="input-field"
              value={priorityFee}
              onChange={(e) => setPriorityFee(e.target.value)}
              step="0.001"
              min="0.001"
            />
          </div>
          <div>
            <label className="label">Sell from Main Wallet</label>
            <button
              className="w-full py-3 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: sellFromMain ? "var(--accent)" : "var(--bg-secondary)",
                color: sellFromMain ? "#000" : "var(--text-secondary)",
              }}
              onClick={() => setSellFromMain(!sellFromMain)}
            >
              {sellFromMain ? "Yes — Include Main" : "No — Buyers Only"}
            </button>
          </div>
        </div>

        <div
          className="p-4 rounded-lg border text-sm"
          style={{
            background: "#1a0f0a",
            borderColor: "var(--warning)",
            color: "var(--text-secondary)",
          }}
        >
          This will sell <strong style={{ color: "var(--text-primary)" }}>{sellPercentage}%</strong> of
          holdings from {sellFromMain ? "main wallet + " : ""}all buyer wallets.
        </div>

        <button
          className="btn-danger w-full"
          onClick={handleSell}
          disabled={loading || !mintAddress.trim()}
        >
          {loading ? "Selling..." : `Sell ${sellPercentage}% from All Wallets`}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div className="card space-y-3">
          <h3 className="text-lg font-semibold">
            Sell Results — {results.filter((r) => r.success).length}/{results.length} succeeded
          </h3>
          {results.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-lg"
              style={{ background: "var(--bg-secondary)" }}
            >
              <div className="flex items-center gap-3">
                <span className={`status-dot ${r.success ? "active" : "error"}`} />
                <div>
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                    {r.wallet.slice(0, 12)}...
                  </p>
                </div>
              </div>
              <div className="text-right">
                {r.success ? (
                  <p className="text-xs font-mono" style={{ color: "var(--accent)" }}>
                    {r.txSignature?.slice(0, 16)}...
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: "var(--danger)" }}>
                    {r.error?.slice(0, 40)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
