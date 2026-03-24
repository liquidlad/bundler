"use client";

import { useState } from "react";
import type { ExtractionResult, TokenMetadata } from "@/lib/types";

type LaunchStep = "input" | "preview" | "configure" | "launching" | "result";

export default function LaunchPage() {
  const [step, setStep] = useState<LaunchStep>("input");
  const [tweetUrl, setTweetUrl] = useState("");
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [metadata, setMetadata] = useState<TokenMetadata>({
    name: "",
    symbol: "",
    description: "",
    imageUrl: "",
  });
  const [buyAmount, setBuyAmount] = useState("0.1");
  const [walletCount, setWalletCount] = useState("6");
  const [jitoTip, setJitoTip] = useState("0.001");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  // Step 1: Extract metadata from tweet
  async function handleExtract() {
    if (!tweetUrl.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetUrl }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Extraction failed");

      setExtraction(data);
      setMetadata(data.metadata);
      setStep("preview");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Step 2: User reviews and edits metadata, then configures launch
  function handleApprove() {
    setStep("configure");
  }

  // Step 3: Launch the token
  async function handleLaunch() {
    setStep("launching");
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata,
          buyAmountSol: parseFloat(buyAmount),
          buyerWalletCount: parseInt(walletCount),
          jitoTipSol: parseFloat(jitoTip),
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Launch failed");

      setResult(data);
      setStep("result");
    } catch (e: any) {
      setError(e.message);
      setStep("configure");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Launch Token</h2>

      {/* Step indicator */}
      <div className="flex gap-2 text-sm">
        {["input", "preview", "configure", "launching", "result"].map((s) => (
          <span
            key={s}
            className="px-3 py-1 rounded-full capitalize"
            style={{
              background: step === s ? "var(--accent)" : "var(--bg-card)",
              color: step === s ? "#000" : "var(--text-secondary)",
            }}
          >
            {s}
          </span>
        ))}
      </div>

      {error && (
        <div
          className="p-4 rounded-lg border"
          style={{ background: "#1a0a0e", borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {/* Step 1: Tweet Input */}
      {step === "input" && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold">Paste Tweet URL</h3>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Paste a tweet URL and AI will extract token name, ticker, and description.
          </p>
          <input
            type="text"
            className="input-field"
            placeholder="https://x.com/username/status/123456789"
            value={tweetUrl}
            onChange={(e) => setTweetUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleExtract()}
          />
          <button
            className="btn-primary"
            onClick={handleExtract}
            disabled={loading || !tweetUrl.trim()}
          >
            {loading ? "Extracting..." : "Extract Metadata"}
          </button>

          <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              Or enter token details manually:
            </p>
            <button
              className="text-sm px-4 py-2 rounded-lg"
              style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              onClick={() => setStep("preview")}
            >
              Manual Entry
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview & Edit */}
      {step === "preview" && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold">Token Details</h3>

          {extraction && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ background: "var(--bg-secondary)" }}
            >
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                AI Confidence:
              </span>
              <span
                className="font-bold"
                style={{
                  color:
                    extraction.confidence > 0.7
                      ? "var(--accent)"
                      : extraction.confidence > 0.4
                      ? "var(--warning)"
                      : "var(--danger)",
                }}
              >
                {(extraction.confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}

          <div>
            <label className="label">Token Name</label>
            <input
              type="text"
              className="input-field"
              value={metadata.name}
              onChange={(e) => setMetadata({ ...metadata, name: e.target.value })}
              placeholder="e.g. Doge Supreme"
            />
          </div>
          <div>
            <label className="label">Symbol / Ticker</label>
            <input
              type="text"
              className="input-field"
              value={metadata.symbol}
              onChange={(e) =>
                setMetadata({ ...metadata, symbol: e.target.value.toUpperCase() })
              }
              placeholder="e.g. DOGE"
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input-field"
              rows={3}
              value={metadata.description}
              onChange={(e) =>
                setMetadata({ ...metadata, description: e.target.value })
              }
              placeholder="A fun description for your token..."
            />
          </div>
          <div>
            <label className="label">Image URL</label>
            <input
              type="text"
              className="input-field"
              value={metadata.imageUrl}
              onChange={(e) =>
                setMetadata({ ...metadata, imageUrl: e.target.value })
              }
              placeholder="https://... or upload coming soon"
            />
          </div>
          {/* Socials */}
          <div>
            <label className="label">Twitter / X Link</label>
            <input
              type="text"
              className="input-field"
              value={metadata.twitter || ""}
              onChange={(e) =>
                setMetadata({ ...metadata, twitter: e.target.value })
              }
              placeholder="https://x.com/yourtoken"
            />
          </div>
          <div>
            <label className="label">Website</label>
            <input
              type="text"
              className="input-field"
              value={metadata.website || ""}
              onChange={(e) =>
                setMetadata({ ...metadata, website: e.target.value })
              }
              placeholder="https://yourtoken.fun"
            />
          </div>
          <div>
            <label className="label">Telegram</label>
            <input
              type="text"
              className="input-field"
              value={metadata.telegram || ""}
              onChange={(e) =>
                setMetadata({ ...metadata, telegram: e.target.value })
              }
              placeholder="https://t.me/yourtoken (optional)"
            />
          </div>

          {metadata.imageUrl && (
            <div className="mt-2">
              <img
                src={metadata.imageUrl}
                alt="Token"
                className="w-24 h-24 rounded-lg object-cover border"
                style={{ borderColor: "var(--border)" }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button className="btn-primary" onClick={handleApprove}>
              Approve & Configure Launch
            </button>
            <button
              className="px-4 py-2 rounded-lg"
              style={{ color: "var(--text-secondary)" }}
              onClick={() => setStep("input")}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Configure Launch */}
      {step === "configure" && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold">Launch Configuration</h3>

          <div
            className="p-3 rounded-lg"
            style={{ background: "var(--bg-secondary)" }}
          >
            <span className="font-bold" style={{ color: "var(--accent)" }}>
              ${metadata.symbol}
            </span>{" "}
            — {metadata.name}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Buy Amount (SOL per wallet)</label>
              <input
                type="number"
                className="input-field"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                step="0.01"
                min="0.01"
              />
            </div>
            <div>
              <label className="label">Buyer Wallets (first buy)</label>
              <input
                type="number"
                className="input-field"
                value={walletCount}
                onChange={(e) => setWalletCount(e.target.value)}
                min="1"
                max="8"
              />
            </div>
            <div>
              <label className="label">Jito Tip (SOL)</label>
              <input
                type="number"
                className="input-field"
                value={jitoTip}
                onChange={(e) => setJitoTip(e.target.value)}
                step="0.001"
                min="0.001"
              />
            </div>
            <div>
              <label className="label">Est. Total Cost</label>
              <div className="input-field flex items-center" style={{ cursor: "default" }}>
                <span className="font-bold" style={{ color: "var(--accent)" }}>
                  {(
                    parseFloat(buyAmount) * (parseInt(walletCount) + 1) +
                    parseFloat(jitoTip)
                  ).toFixed(4)}{" "}
                  SOL
                </span>
              </div>
            </div>
          </div>

          <div
            className="p-4 rounded-lg border text-sm"
            style={{
              background: "#0f1a14",
              borderColor: "var(--accent)",
              color: "var(--text-secondary)",
            }}
          >
            This will create <strong style={{ color: "var(--text-primary)" }}>${metadata.symbol}</strong> on
            Pump.fun and buy with{" "}
            <strong style={{ color: "var(--text-primary)" }}>{walletCount} wallets</strong> +
            your main wallet in the same block.
          </div>

          <div className="flex gap-3 pt-2">
            <button className="btn-primary" onClick={handleLaunch}>
              Launch Token
            </button>
            <button
              className="px-4 py-2 rounded-lg"
              style={{ color: "var(--text-secondary)" }}
              onClick={() => setStep("preview")}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Launching */}
      {step === "launching" && (
        <div className="card text-center py-12 space-y-4">
          <div
            className="text-4xl animate-pulse"
            style={{ color: "var(--accent)" }}
          >
            ...
          </div>
          <p className="text-lg font-semibold">Launching ${metadata.symbol}</p>
          <p style={{ color: "var(--text-secondary)" }}>
            Creating token and executing bundled buys...
          </p>
        </div>
      )}

      {/* Step 5: Result */}
      {step === "result" && result && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold">
            {result.success ? "Launch Successful!" : "Launch Failed"}
          </h3>

          {result.success ? (
            <div className="space-y-3">
              <div>
                <label className="label">Mint Address</label>
                <p className="font-mono text-sm p-3 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
                  {result.mintAddress}
                </p>
              </div>
              <div>
                <label className="label">Transaction</label>
                <p className="font-mono text-sm p-3 rounded-lg" style={{ background: "var(--bg-secondary)" }}>
                  {result.txSignature}
                </p>
              </div>
              <div className="flex gap-3">
                <a
                  href={`https://pump.fun/${result.mintAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  View on Pump.fun
                </a>
                <button
                  className="px-4 py-2 rounded-lg"
                  style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                  onClick={() => {
                    setStep("input");
                    setTweetUrl("");
                    setExtraction(null);
                    setResult(null);
                  }}
                >
                  Launch Another
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ color: "var(--danger)" }}>{result.error}</p>
              <button
                className="btn-primary mt-4"
                onClick={() => setStep("configure")}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
