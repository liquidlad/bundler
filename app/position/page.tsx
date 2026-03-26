"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface WalletPosition {
  label: string;
  publicKey: string;
  tokenBalance: string;
  tokenBalanceFormatted: number;
}

interface PositionData {
  mint: string;
  marketCapSol: number;
  spotPrice: number;
  isMigrated: boolean;
  wallets: WalletPosition[];
  totalTokens: string;
  totalTokensFormatted: number;
  naiveValueSol: number;
  realSellValueSol: number;
  priceImpactPct: number;
  virtualSolReserves: number;
  virtualTokenReserves: number;
}

interface SellAllResult {
  success: boolean;
  consolidateTx?: string;
  sellTx?: string;
  totalTokensSold: string;
  solReceived: number;
  walletsConsolidated: number;
  error?: string;
}

function PositionContent() {
  const searchParams = useSearchParams();
  const mintParam = searchParams.get("mint") || "";
  const costParam = searchParams.get("cost") || "0";

  const [mintAddress, setMintAddress] = useState(mintParam);
  const [activeMint, setActiveMint] = useState(mintParam);
  const [position, setPosition] = useState<PositionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [costBasis, setCostBasis] = useState(costParam);

  // Sell state
  const [selling, setSelling] = useState(false);
  const [sellingWallet, setSellingWallet] = useState<string | null>(null);
  const [sellResult, setSellResult] = useState<SellAllResult | null>(null);
  const [confirmSell, setConfirmSell] = useState(false);
  const [sellStatus, setSellStatus] = useState("");

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPosition = useCallback(async (mint: string) => {
    if (!mint.trim()) return;
    try {
      const res = await fetch("/api/position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAddress: mint.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      setPosition(data);
      setLastUpdate(new Date());
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  // Initial load + auto-refresh
  useEffect(() => {
    if (!activeMint) return;

    setLoading(true);
    fetchPosition(activeMint).finally(() => setLoading(false));

    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchPosition(activeMint);
      }, 3000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeMint, autoRefresh, fetchPosition]);

  function handleTrack() {
    if (!mintAddress.trim()) return;
    setActiveMint(mintAddress.trim());
    setPosition(null);
    setSellResult(null);
    setConfirmSell(false);
  }

  async function handleSellAll() {
    if (!activeMint) return;
    setSelling(true);
    setSellResult(null);
    setConfirmSell(false);
    setSellStatus("Consolidating tokens to main wallet...");

    try {
      const res = await fetch("/api/sell-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mintAddress: activeMint,
          slippagePct: 15,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sell failed");

      setSellResult(data);
      setAutoRefresh(false);
      // Refresh position after sell
      setTimeout(() => fetchPosition(activeMint), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSelling(false);
      setSellStatus("");
    }
  }

  async function handleSellWallet(walletPublicKey: string) {
    if (!activeMint) return;
    setSellingWallet(walletPublicKey);
    try {
      const res = await fetch("/api/sell-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAddress: activeMint, walletPublicKey, sellPercentage: 100 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sell failed");
      // Refresh position after sell
      setTimeout(() => fetchPosition(activeMint), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSellingWallet(null);
    }
  }

  const costBasisNum = parseFloat(costBasis) || 0;
  // Total value = current token value + any SOL already received from sells
  const realizedSol = sellResult?.success ? sellResult.solReceived : 0;
  const totalValue = position ? position.realSellValueSol + realizedSol : realizedSol;
  const pnlSol = totalValue - costBasisNum;
  const pnlPct = costBasisNum > 0 ? (pnlSol / costBasisNum) * 100 : 0;
  const isProfit = pnlSol >= 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Position Tracker</h2>

      {/* Mint Input */}
      {!activeMint && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold">Enter Token Mint</h3>
          <div className="flex gap-3">
            <input
              type="text"
              className="input-field flex-1"
              placeholder="Token mint address..."
              value={mintAddress}
              onChange={(e) => setMintAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTrack()}
            />
            <button
              className="btn-primary"
              onClick={handleTrack}
              disabled={!mintAddress.trim()}
            >
              Track
            </button>
          </div>
          <div>
            <label className="label">Cost Basis (SOL spent)</label>
            <input
              type="number"
              className="input-field"
              value={costBasis}
              onChange={(e) => setCostBasis(e.target.value)}
              step="0.01"
              placeholder="Total SOL invested..."
            />
          </div>
        </div>
      )}

      {error && (
        <div
          className="p-4 rounded-lg border"
          style={{ background: "#1a0a0e", borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {loading && !position && (
        <div className="card text-center py-12">
          <div className="text-4xl animate-pulse" style={{ color: "var(--accent)" }}>...</div>
          <p className="mt-4" style={{ color: "var(--text-secondary)" }}>Loading position data...</p>
        </div>
      )}

      {/* Position Display */}
      {position && (
        <>
          {/* P&L Hero */}
          <div
            className="card text-center py-8"
            style={{
              borderColor: isProfit ? "var(--accent)" : "var(--danger)",
              borderWidth: "2px",
            }}
          >
            <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              {realizedSol > 0
                ? (position.realSellValueSol > 0 ? "Sold + remaining value:" : "Total received from sell:")
                : "If you sell everything now, you get:"}
            </p>
            <p
              className="text-5xl font-bold tracking-tight"
              style={{ color: isProfit ? "var(--accent)" : "var(--danger)" }}
            >
              {totalValue.toFixed(4)} SOL
            </p>

            {costBasisNum > 0 && (
              <div className="mt-4 flex items-center justify-center gap-6">
                <div>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>P&L</p>
                  <p
                    className="text-2xl font-bold"
                    style={{ color: isProfit ? "var(--accent)" : "var(--danger)" }}
                  >
                    {isProfit ? "+" : ""}{pnlSol.toFixed(4)} SOL
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Return</p>
                  <p
                    className="text-2xl font-bold"
                    style={{ color: isProfit ? "var(--accent)" : "var(--danger)" }}
                  >
                    {isProfit ? "+" : ""}{pnlPct.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Cost</p>
                  <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                    {costBasisNum.toFixed(4)} SOL
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span>
                Naive value: {position.naiveValueSol.toFixed(4)} SOL
              </span>
              <span>|</span>
              <span style={{ color: "var(--warning)" }}>
                Price impact: -{position.priceImpactPct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* SELL ALL Button */}
          <div className="card">
            {selling ? (
              <div className="text-center py-6 space-y-3">
                <div className="text-3xl animate-pulse" style={{ color: "var(--danger)" }}>...</div>
                <p className="font-bold text-lg">{sellStatus || "Selling..."}</p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Consolidating tokens → main wallet → single sell
                </p>
              </div>
            ) : !confirmSell ? (
              <button
                className="w-full py-5 rounded-lg text-xl font-bold transition-all duration-200"
                style={{
                  background: "var(--danger)",
                  color: "#fff",
                  fontSize: "1.25rem",
                }}
                onClick={() => setConfirmSell(true)}
                disabled={position.totalTokensFormatted === 0}
              >
                {position.totalTokensFormatted === 0 ? "NO TOKENS TO SELL" : "SELL ALL"}
              </button>
            ) : (
              <div className="space-y-3">
                <div
                  className="p-4 rounded-lg border text-center"
                  style={{ background: "#1a0a0e", borderColor: "var(--danger)" }}
                >
                  <p className="font-bold" style={{ color: "var(--danger)" }}>
                    Confirm: Consolidate + sell 100%?
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                    All buyer wallets → main wallet → single sell for ~{position.realSellValueSol.toFixed(4)} SOL
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    15% slippage tolerance &middot; 2 transactions total
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    className="flex-1 py-4 rounded-lg text-lg font-bold"
                    style={{ background: "var(--danger)", color: "#fff" }}
                    onClick={handleSellAll}
                  >
                    CONFIRM SELL ALL
                  </button>
                  <button
                    className="px-6 py-4 rounded-lg font-medium"
                    style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                    onClick={() => setConfirmSell(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sell Result */}
          {sellResult && (
            <div
              className="card space-y-3"
              style={{ borderColor: sellResult.success ? "var(--accent)" : "var(--danger)", borderWidth: "2px" }}
            >
              <h3 className="text-lg font-semibold">
                {sellResult.success ? "Sell Complete" : "Sell Failed"}
              </h3>

              {sellResult.success ? (
                <div className="space-y-3">
                  <div className="text-center py-2">
                    <p className="text-3xl font-bold" style={{ color: "var(--accent)" }}>
                      +{sellResult.solReceived.toFixed(4)} SOL
                    </p>
                    {sellResult.walletsConsolidated > 0 && (
                      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                        Consolidated {sellResult.walletsConsolidated} wallet{sellResult.walletsConsolidated !== 1 ? "s" : ""} → main → sold
                      </p>
                    )}
                  </div>

                  {sellResult.consolidateTx && (
                    <div className="p-3 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Consolidate TX</p>
                      <p className="text-xs font-mono" style={{ color: "var(--accent)" }}>
                        {sellResult.consolidateTx}
                      </p>
                    </div>
                  )}
                  {sellResult.sellTx && (
                    <div className="p-3 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Sell TX</p>
                      <p className="text-xs font-mono" style={{ color: "var(--accent)" }}>
                        {sellResult.sellTx}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-lg" style={{ background: "#1a0a0e" }}>
                  <p style={{ color: "var(--danger)" }}>{sellResult.error}</p>
                </div>
              )}
            </div>
          )}

          {/* Market Info */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Market Data</h3>
              <div className="flex items-center gap-3">
                <button
                  className="text-xs px-3 py-1 rounded-lg"
                  style={{
                    background: autoRefresh ? "var(--accent)" : "var(--bg-secondary)",
                    color: autoRefresh ? "#000" : "var(--text-secondary)",
                  }}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                >
                  {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
                </button>
                {lastUpdate && (
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {lastUpdate.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Market Cap</p>
                <p className="text-lg font-bold">{position.marketCapSol.toFixed(2)} SOL</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Status</p>
                <p className="text-lg font-bold" style={{ color: position.isMigrated ? "var(--warning)" : "var(--accent)" }}>
                  {position.isMigrated ? "Migrated" : "Bonding Curve"}
                </p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>SOL in Curve</p>
                <p className="text-lg font-bold">{position.virtualSolReserves.toFixed(2)} SOL</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Total Tokens Held</p>
                <p className="text-lg font-bold">{(position.totalTokensFormatted).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Per-Wallet Breakdown */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Wallet Breakdown</h3>
            <div className="space-y-2">
              {position.wallets.map((w) => {
                const pctOfTotal = position.totalTokensFormatted > 0
                  ? (w.tokenBalanceFormatted / position.totalTokensFormatted) * 100
                  : 0;
                const walletValue = position.totalTokensFormatted > 0
                  ? (w.tokenBalanceFormatted / position.totalTokensFormatted) * position.realSellValueSol
                  : 0;
                return (
                  <div
                    key={w.publicKey}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ background: "var(--bg-secondary)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="status-dot"
                        style={{ background: w.tokenBalanceFormatted > 0 ? "var(--accent)" : "var(--text-secondary)" }}
                      />
                      <div>
                        <p className="text-sm font-medium">{w.label}</p>
                        <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                          {w.publicKey.slice(0, 8)}...{w.publicKey.slice(-4)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold">
                          {w.tokenBalanceFormatted.toLocaleString()} tokens
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          ~{walletValue.toFixed(4)} SOL ({pctOfTotal.toFixed(1)}%)
                        </p>
                      </div>
                      {w.tokenBalanceFormatted > 0 && (
                        <button
                          className="px-3 py-1 rounded text-xs font-medium transition-colors"
                          style={{
                            background: sellingWallet === w.publicKey ? "var(--border)" : "var(--danger)",
                            color: "#fff",
                            opacity: sellingWallet ? 0.5 : 1,
                          }}
                          onClick={() => handleSellWallet(w.publicKey)}
                          disabled={!!sellingWallet}
                        >
                          {sellingWallet === w.publicKey ? "Selling..." : "Sell"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Change Mint / Cost Basis */}
          <div className="card">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Cost Basis (SOL)</label>
                <input
                  type="number"
                  className="input-field"
                  value={costBasis}
                  onChange={(e) => setCostBasis(e.target.value)}
                  step="0.01"
                />
              </div>
              <div>
                <label className="label">Track Different Token</label>
                <button
                  className="w-full py-3 rounded-lg text-sm font-medium"
                  style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  onClick={() => {
                    setActiveMint("");
                    setPosition(null);
                    setSellResult(null);
                    setConfirmSell(false);
                    setSellStatus("");
                  }}
                >
                  Change Token
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PositionPage() {
  return (
    <Suspense fallback={
      <div className="max-w-3xl mx-auto">
        <div className="card text-center py-12">
          <div className="text-4xl animate-pulse" style={{ color: "var(--accent)" }}>...</div>
        </div>
      </div>
    }>
      <PositionContent />
    </Suspense>
  );
}
