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
- **Language:** TypeScript (Node.js)
- **Bundling:** Jito bundles for atomic same-block execution
- **Token Creation:** PumpPortal API (pumpportal.fun) — create + buy in single atomic bundle
- **PumpFun SDK:** New 18-instruction IDL with TOKEN_2022 (Token Extensions) support
- **Twitter Monitor:** twikit (Python) or custom scraper — poll specific accounts every 5-10s
- **AI Extraction:** Claude API (structured JSON output) — extract name/ticker/description/image from tweets
- **Image Pipeline:** Download tweet image → upload to IPFS via pump.fun/api/ipfs
- **Notifications:** Discord/Telegram webhook for launch confirmations

## Architecture
```
[Twitter Monitor] → [AI Metadata Extractor] → [Token Launcher] → [Bundled Buy] → [Sell Strategy]
      |                       |                       |                  |               |
   twikit/scraper      Claude/GPT-4o           PumpPortal API      Jito Bundle     Time/MC triggers
   (poll 5-10s)        structured JSON         create + buy        20+ wallets     auto or manual
                       name/ticker/img
```

## Key Design Decisions
- **No forked bundler code** — all existing open-source bundlers have security issues (malware deps, key exfiltration patterns). We build from scratch using only trusted packages.
- **PumpPortal API over raw SDK** — PumpPortal handles IPFS upload, token creation, and Jito bundling in a clean API. Avoids needing to maintain our own IDL integration.
- **Hybrid Python/TS** — Twitter scraping ecosystem is strongest in Python (twikit). Core bundler logic in TypeScript for Solana ecosystem compatibility.
- **Modular pipeline** — Each stage (monitor → extract → launch → buy → sell) is independent and testable.

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
├── CLAUDE.md              # This file — project notes and context
├── README.md              # Public-facing documentation
├── package.json           # Node.js dependencies
├── tsconfig.json          # TypeScript configuration
├── .env.example           # Environment variable template
├── .gitignore             # Git ignore rules
├── src/
│   ├── index.ts           # Main entry point / CLI
│   ├── config.ts          # Configuration loader
│   ├── bundler/
│   │   ├── launcher.ts    # Token creation via PumpPortal API
│   │   ├── buyer.ts       # Multi-wallet Jito bundle buy
│   │   ├── seller.ts      # Sell strategies (timed, MC-based, manual)
│   │   ├── wallets.ts     # Wallet generation and management
│   │   └── jito.ts        # Jito bundle construction and submission
│   ├── monitor/
│   │   ├── twitter.ts     # Twitter/X account monitoring
│   │   ├── extractor.ts   # AI metadata extraction from tweets
│   │   └── pipeline.ts    # Monitor → Extract → Launch pipeline
│   ├── utils/
│   │   ├── ipfs.ts        # Image upload to IPFS via pump.fun API
│   │   ├── notify.ts      # Discord/Telegram notifications
│   │   └── logger.ts      # Logging utility
│   └── types/
│       └── index.ts       # Shared TypeScript types
└── scripts/
    ├── generate-wallets.ts    # Generate buyer wallets
    ├── fund-wallets.ts        # Fund wallets from main wallet
    ├── gather-funds.ts        # Gather SOL back to main wallet
    └── check-balances.ts      # Check all wallet balances
```
