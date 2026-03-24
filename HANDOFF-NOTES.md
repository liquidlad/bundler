# Handoff Notes — March 24, 2026

## What was done

Picked up the project from a fresh clone on a new machine. No `.env` file was present (keys stayed on the original machine, which is correct). All work below was done without env vars — everything builds and the UI renders, but API calls (launch, sell, extract) require the env to be set up.

### 1. Position Tracker Page (`/position`)

**New page** that shows real-time P&L after launching a token.

**The problem it solves:** After launching, you had no way to quickly see how much SOL you'd actually get if you sold everything. Naive math (`tokens x spot price`) is misleading on pump.fun because the bonding curve means selling a large position moves the price significantly.

**How it works:**
- Enter a mint address (or arrive automatically after launch)
- Reads the on-chain bonding curve reserves (`virtualSolReserves`, `virtualTokenReserves`)
- Uses the SDK's `getSellSolAmountFromTokenAmount()` with your **total** token holdings across ALL wallets (main + buyers)
- This gives you the **real SOL you'd receive**, not the fake spot-price number
- Shows price impact percentage (difference between naive value and real value)
- Auto-refreshes every 5 seconds
- Shows per-wallet token breakdown with proportional value
- Market cap, curve reserves, migration status

**Files:**
- `app/position/page.tsx` — The UI
- `app/api/position/route.ts` — Backend that reads balances + bonding curve state

### 2. Consolidate-Then-Sell (`SELL ALL`)

**New sell flow** — replaces the old approach of selling from each wallet individually.

**Old way:** N separate sell transactions (one per wallet). Slow, sequential, each one moves the curve before the next lands. 7 wallets = 7 txs.

**New way:** 2 transactions total:
1. **TX 1 (Consolidate):** One atomic transaction that transfers tokens from ALL buyer wallets into the main wallet. All buyer keypairs sign a single tx. If any transfer fails, the whole thing reverts cleanly.
2. **TX 2 (Sell):** Single sell from main wallet for the full consolidated balance.

**Files:**
- `lib/bundler/seller.ts` — Added `consolidateAndSell()` function
- `app/api/sell-all/route.ts` — New API endpoint
- The old `/api/sell` and `/sell` page still work for individual wallet sells

### 3. Auto-Redirect After Launch

The launch page (`/launch`) now automatically redirects to the position tracker after a successful launch. No more clicking through a result screen.

**Flow:** Launch → token confirmed on-chain → redirect to `/position?mint=<address>&cost=<total_sol_spent>`

The cost basis is pre-calculated from the launch config (dev buy + bundle buys + jito tip).

**File:** `app/launch/page.tsx` — Modified `handleLaunch()` to use `router.push()` on success

### 4. Navbar Update

Added "Position" link to the navbar between "Launch" and "Wallets".

**File:** `components/Navbar.tsx`

---

## Files changed (from commit `36d3a74`)

| File | Change |
|------|--------|
| `app/position/page.tsx` | **NEW** — Position tracker page |
| `app/api/position/route.ts` | **NEW** — Position data API (balances + bonding curve math) |
| `app/api/sell-all/route.ts` | **NEW** — Consolidate-then-sell API |
| `lib/bundler/seller.ts` | **MODIFIED** — Added `consolidateAndSell()`, new imports for SPL token transfers |
| `app/launch/page.tsx` | **MODIFIED** — Auto-redirect to position tracker on success |
| `components/Navbar.tsx` | **MODIFIED** — Added Position link |

## Nothing was broken

- The old `/sell` page and `/api/sell` endpoint are untouched and still work
- No env vars were changed or added — same `.env` as before
- No dependencies were added — everything uses existing `@pump-fun/pump-sdk` and `@solana/spl-token`

## Still needs `.env` to test

The machine this was built on doesn't have the `.env` file. To test, you need:

```
RPC_URL=https://mainnet.helius-rpc.com/?api-key=<YOUR_KEY>
MAIN_WALLET_PRIVATE_KEY=<base58 secret key>
ANTHROPIC_API_KEY=sk-ant-...
```

## Known issues (pre-existing, not introduced)

From CLAUDE.md — these were already noted before this work:
1. **Jito bundles dropping** — Create+dev buy works but buyer buy instructions may have wrong account layout for V2. The consolidate-then-sell is not affected by this since it uses the SDK's `sellInstructions()` which works correctly.
2. **Wallets page missing** — `/wallets` is in the navbar but `app/wallets/page.tsx` doesn't exist in the repo (may have been deleted or never committed from the other machine).
