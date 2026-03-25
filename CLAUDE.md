# Bundler — Pump.fun Bundle Bot

## Project Overview
A self-hosted Pump.fun bundle bot with tweet-triggered auto-launch capability. Built from scratch with clean, audited dependencies — no forked bundler code with supply chain risks.

## Core Features
1. **Multi-Wallet Bundler** — Create token + bundle buy with up to 20+ wallets in a single Jito bundle (same block)
2. **Tweet Auto-Launch** — Monitor Twitter/X accounts, extract token metadata via AI, auto-deploy on Pump.fun
3. **Anti-Detection** — Bubblemap bypass, holder wallet distribution, staggered buys
4. **Sell Strategies** — Percentage-based, time-delayed, market-cap-aware, dump-all
5. **PumpSwap Migration** — Full lifecycle: launch → bundle → migrate to PumpSwap → sell

## Tech Stack
- **Language:** TypeScript (Node.js) — pure TS, no Python
- **Token Creation:** Official @pump-fun/pump-sdk (v1.31.0) — createV2 + buy instructions, Token2022 support
- **Tweet Input:** Manual tweet URL paste → HTTP scrape → AI extract (Phase 1). Auto-monitor later (Phase 5).
- **AI Extraction:** Claude API (structured JSON output) — extract name/ticker/description/image from tweets
- **Image Pipeline:** Download tweet image → upload to IPFS via pump.fun/api/ipfs
- **Wallets:** Up to 30 generated keypairs, 6-8 used per first buy
- **UI:** CLI (commander.js). Web dashboard is future Phase 6.
- **Notifications:** Discord/Telegram webhook for launch confirmations

## Architecture
```
Phase 1-2 Flow (manual tweet input):
[Paste Tweet URL] → [Scrape Tweet] → [AI Extract Metadata] → [User Approval] → [PumpPortal Launch + Buy] → [Manual Sell]
                                            |
                                      Claude Haiku
                                      name/ticker/img
                                      confidence score

Phase 5 Flow (future auto-monitor):
[Twitter Poller] → [AI Extract] → [User Approval] → [Launch + Buy] → [Auto Sell on Profit Target]
```

## Confirmed Decisions (2026-03-23)
- **PumpPortal API** — Use PumpPortal (0.5% fee) over raw SDK. Saves weeks of dev time. Can swap to raw SDK later if volume justifies it.
- **30 wallets total** — Up to 30 buyer wallets generated. First buy uses 6-8 wallets.
- **Tweet input: manual link paste first** — User pastes tweet URL → scrape → AI extract → approve → launch. Free, instant, zero maintenance. Automated monitoring added later.
- **Approval required** — No fully autonomous launches yet. User confirms before every launch.
- **Manual sell only (for now)** — Future: auto-dump based on profit target.
- **Web dashboard (Next.js)** — User is not very technical, web UI is easier to use than CLI.
- **No forked bundler code** — all existing open-source bundlers have security issues (malware deps, key exfiltration patterns). We build from scratch using only trusted packages.
- **Pure TypeScript** — No Python dependency. Tweet scraping via HTTP fetch of tweet URL.
- **Modular pipeline** — Each stage (input → extract → launch → buy → sell) is independent and testable.
- **Stealth mode** — Wallet funding uses randomized amounts (±12%), staggered timing (3-12s delays), shuffled order to avoid tracker detection (Bubblemap, Arkham).
- **Wallet vault** — All keys backed up to ~/.bundler-vault/ (outside project). Append-only all-keys-ever.json log. Keys are never lost.
- **Helius RPC** — Using Helius free tier for reliable Solana RPC.

## Current Status (2026-03-25)
- **Phase 1 DONE:** Token creation + dev buy + same-block buyer buys via Jito bundle
- **Phase 2 DONE:** Tweet paste → fxtwitter scrape → Claude AI extract → image picker → preview/edit → launch
- **Phase 3 DONE:** Wallet gen, fund (stealth mode), gather, balance check, enable/disable toggles, vault backup
- **Phase 4 MOSTLY DONE:** Sell page, per-wallet sell buttons, consolidate-and-sell, position tracker with real P&L
- **Same-block Jito bundle WORKING:** Correct V2 buy instruction with all 17 accounts. Max 4 buyer wallets in bundle (Jito 5-tx limit). Extra wallets sent after.
- **IPFS pre-upload:** Uploads during configure step, launch skips upload (~4s faster)
- **Collaborated via:** github.com/better-builders added as collaborator for cross-machine work

## Known Issues / Next Steps
1. **Auto-dump on profit** — Not built yet. Future.
2. **Auto Twitter monitoring** — Not built yet. Future.
3. **Manual image upload** — Only tweet images supported. File upload TODO.
4. **OneDrive .next cache** — `.next` build dir gets corrupted by OneDrive sync. Need to `rm -rf .next` before each dev server start.
5. **Helius rate limits** — Position page polling at 3s can trigger 429s. May need paid RPC tier for heavy use.

## Build Phases
1. ~~**Phase 1 — Core Bundler:**~~ DONE — official pump-fun SDK, wallet gen, create + dev buy + buyer buys
2. ~~**Phase 2 — Tweet-to-Launch:**~~ DONE — fxtwitter + Claude AI extraction
3. ~~**Phase 3 — Wallet Management:**~~ DONE — fund/gather/balances/toggles/stealth/vault
4. ~~**Phase 4 — Sell + Position:**~~ MOSTLY DONE — sell page, per-wallet sell, consolidate+sell, position tracker with bonding curve math, auto-refresh
5. **Phase 5 (future) — Same-Block Bundling:** Jito bundles with correct V2 buy instructions
6. **Phase 6 (future) — Auto-Monitor:** Automated Twitter polling for watched accounts
7. **Phase 7 (future) — Auto-Dump:** Sell automatically at profit target

## Research Notes

### Bundler Landscape (March 2026)
- **Every open-source bundler has issues:** outdated IDL, malware deps, or both
- **Feb 2026 PumpFun SDK breaking change:** migrated to Token Extensions (TOKEN_2022_PROGRAM_ID). Most repos are broken.
- **cicere/pumpfun-bundler** (413 stars) — origin repo, but old IDL + suspicious deps (@octokit/rest, javascript-obfuscator)
- **enlomy/pumpfun-bundler** (26 stars) — best architecture but CONFIRMED MALWARE in npm deps (@hash-validator/v2)
- **alexisssol/Pump.fun-Solana-bundler-2** (7 stars) — cleanest deps, independent codebase, our primary reference
- **emmarktech/pump-bundle-launcher** (3 stars) — only repo with new 18-instruction IDL (TOKEN_2022), but suspicious jsconvict dep
- **pio-ne-er/stealth-bundler** (132 stars) — best anti-detection reference (holder distribution, fake bot patterns)

### Auto-Launch / Tweet Monitoring
- **No existing repo combines Twitter monitoring with pump.fun token CREATION** — this is our opportunity
- **conorwd/Pump.fun-Twitter-Bot** (38 stars) — archived, buy-side only, backend repo deleted
- **solanabots/Solana-Twitter-Bot** (32 stars, Python) — best reference for Twitter → Solana action pipeline
- **Humancyyborg/Pumpfun-Automated-token-launcher** (2 stars) — detects trending tokens, launches clones (closest to auto-launch concept)
- **tweetfun.app** — closed-source commercial product doing exactly what we want (tweet → AI extract → deploy)
- **Slerf.tools** — does NOT have AI auto-launch despite claims; it's manual bundling only
- **Boop.fun** — semi-automated tweet-to-token, partially curated, not fully automated

### Twitter/X Monitoring Options
- **Twitter API v2 Pro** ($5,000/mo) — filtered streams, real-time, reliable
- **twikit** (4,179 stars, Python) — free, no API key, but breaks every 2-4 weeks when X changes
- **twscrape** (2,301 stars, Python) — auth-based scraping, less maintained
- **Nitter** — increasingly unreliable, instances shutting down
- **Puppeteer/Playwright** — full browser automation, slowest but hardest to detect

### AI Metadata Extraction
- Use Claude or GPT-4o with structured JSON output
- Extract: name, ticker ($SYMBOL pattern), description, image_url, should_launch confidence
- Cost: ~$0.001-0.005 per tweet analysis
- Latency: 200-500ms for structured extraction
- Regex pre-processing for $TICKER patterns can supplement LLM

### Official @pump-fun/pump-sdk (npm)
- v1.31.0 — actively maintained, multiple releases per month
- `createV2AndBuyInstructions()` — atomic create + dev buy in one tx
- `buyInstructions()` — buy on bonding curve with proper state
- `sellInstructions()` — sell with TOKEN_2022 support
- `getBuyTokenAmountFromSolAmount()` / `getSellSolAmountFromTokenAmount()` — price math
- `bondingCurveMarketCap()` — market cap calculation
- PumpPortal was tried first but their API was broken (400 on all creates with non-zero amounts). Dropped in favor of official SDK.

## Security Rules
- NEVER commit private keys or seed phrases
- All keys stored in .env (gitignored)
- Audit every npm dependency before installing
- No @octokit/rest, javascript-obfuscator, or unknown SDK packages
- Test with tiny SOL amounts first (0.001 SOL)
- Run everything locally, never on shared infrastructure

## File Structure
```
bundler/
├── CLAUDE.md                      # Project notes and context
├── package.json                   # Dependencies (Next.js, Solana, Claude SDK)
├── next.config.js                 # Next.js configuration
├── tailwind.config.js             # Tailwind CSS config
├── tsconfig.json                  # TypeScript config
├── .env.example                   # Environment variable template
├── .gitignore                     # Git ignore rules
├── app/                           # Next.js App Router (web UI)
│   ├── layout.tsx                 # Root layout with navbar
│   ├── page.tsx                   # Dashboard — stats, wallet overview, recent launches
│   ├── launch/page.tsx            # Launch flow — paste tweet → AI extract → approve → launch → redirect to position
│   ├── position/page.tsx          # Position tracker — real-time P&L, bonding curve math, per-wallet sell buttons
│   ├── wallets/page.tsx           # Wallet management — generate, fund, gather, enable/disable toggles
│   ├── sell/page.tsx              # Manual sell page — sell by mint address, configurable %
│   ├── globals.css                # Global styles (dark theme)
│   └── api/
│       ├── launch/route.ts        # POST — create token + dev buy + buyer buys
│       ├── wallets/route.ts       # GET/POST — load/generate/toggle wallets
│       ├── balances/route.ts      # GET — refresh all wallet balances
│       ├── extract/route.ts       # POST — scrape tweet + AI metadata extraction
│       ├── fund/route.ts          # POST — fund buyer wallets (stealth mode)
│       ├── gather/route.ts        # POST — gather SOL back to main wallet
│       ├── sell/route.ts          # POST — sell from all wallets individually
│       ├── sell-all/route.ts      # POST — consolidate all tokens → main wallet → sell
│       ├── sell-wallet/route.ts   # POST — sell from a specific wallet
│       └── position/route.ts     # POST — position data (balances, bonding curve, P&L)
├── lib/                           # Core backend logic
│   ├── config.ts                  # Env var loader
│   ├── types/index.ts             # Shared TypeScript types
│   ├── bundler/
│   │   ├── launcher.ts            # Official pump-fun SDK — create + dev buy + buyer buys
│   │   ├── seller.ts              # Sell logic — individual, consolidate+sell
│   │   ├── funder.ts              # Fund/gather wallets (stealth mode)
│   │   └── wallets.ts             # Wallet generation, storage, vault backup, enable/disable
│   └── monitor/
│       └── extractor.ts           # fxtwitter scraping + Claude AI metadata extraction
├── components/
│   └── Navbar.tsx                 # Navigation bar (Dashboard, Launch, Position, Wallets, Sell)
└── HANDOFF-NOTES.md               # Cross-machine development notes
```
