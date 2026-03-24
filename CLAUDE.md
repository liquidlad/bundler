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
- **Token Creation:** PumpPortal API (pumpportal.fun) — create + buy in single atomic Jito bundle
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

## Build Phases
1. **Phase 1 — Core Bundler:** PumpPortal API integration, wallet gen, create + bundled buy working
2. **Phase 2 — Tweet-to-Launch:** Paste tweet URL → scrape → AI extract → approve → launch
3. **Phase 3 — Wallet Management:** Fund/gather/balance scripts, encrypted keypair storage
4. **Phase 4 — Sell + Anti-Detection:** Manual sell, then auto-dump. Holder distribution, staggered buys.
5. **Phase 5 (future) — Auto-Monitor:** Automated Twitter polling for watched accounts
6. **Phase 6 (future) — Web Dashboard:** React UI for visual management

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

### PumpPortal API (pumpportal.fun)
- Create + buy in single atomic Jito bundle
- Up to 5 transactions per bundle (create + 4 wallet buys)
- Lightning API (server-signed) or Local API (client-signed)
- 0.5% trading fee on buys, NO additional creation fee
- Token metadata: name, symbol, image (IPFS), description, socials

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
│   ├── launch/page.tsx            # Launch flow — paste tweet → AI extract → approve → launch
│   ├── wallets/page.tsx           # Wallet management — generate, view balances
│   ├── globals.css                # Global styles (dark theme)
│   └── api/
│       ├── launch/route.ts        # POST — create token + bundled buy via PumpPortal
│       ├── wallets/route.ts       # GET/POST — load/generate wallets
│       ├── balances/route.ts      # GET — refresh all wallet balances
│       └── extract/route.ts       # POST — scrape tweet + AI metadata extraction
├── lib/                           # Core backend logic
│   ├── config.ts                  # Env var loader
│   ├── types/index.ts             # Shared TypeScript types
│   ├── bundler/
│   │   ├── launcher.ts            # PumpPortal API — create + bundled buy
│   │   └── wallets.ts             # Wallet generation, storage, balance checking
│   └── monitor/
│       └── extractor.ts           # Tweet scraping + Claude AI metadata extraction
└── components/
    └── Navbar.tsx                 # Navigation bar component
```
