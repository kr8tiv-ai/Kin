# KIN — We Build You A Friend

> AI companions that grow with you. Persistent memory, unique personalities, voice chat, NFT ownership — powered by Bags.fm.

[![Built on Bags](https://img.shields.io/badge/Built%20on-Bags.fm-FF00AA?style=for-the-badge)](https://bags.fm)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![Solana](https://img.shields.io/badge/Solana-NFTs-9945FF?style=for-the-badge&logo=solana)](https://solana.com)
[![License](https://img.shields.io/badge/License-MIT-00F0FF?style=for-the-badge)](LICENSE)

---

## What is KIN?

KIN is a consumer AI companion platform where users adopt, chat with, and grow alongside personalized AI friends. Each companion is a **unique NFT** with distinct personality, persistent memory across sessions, voice capabilities, and special abilities. No crypto knowledge needed — just pick a friend and start talking.

**Bags Hackathon Entry** — KIN integrates with Bags.fm for companion ownership, token-gated features, and the Bags ecosystem.

## Live Demo

- **Web App**: [meetyourkin.com](https://meetyourkin.com)
- **Telegram Bot**: [@KinCompanionBot](https://t.me/KinCompanionBot)
- **NFT Mint**: [KIN by KR8TIV](https://github.com/kr8tiv-io/Kinbykr8tiv-website)

## Features

### Consumer Experience
- **6 unique AI companions** — Cipher (code), Mischief (creative), Vortex (strategy), Forge (builder), Aether (philosophy), Catalyst (motivator)
- **Persistent memory** — companions remember your conversations, preferences, and context across sessions
- **Voice chat** — microphone input in web dashboard + voice notes in Telegram, per-companion ElevenLabs voices
- **5-step onboarding wizard** — choose companion, set preferences, teach your AI, start chatting
- **Gamification** — XP, levels, badges, streaks (persisted to SQLite), and a referral leaderboard
- **NFT companion ownership** — each Genesis KIN is a Solana NFT with special abilities

### Technical
- **Two-brain AI architecture** — local Ollama (private, fast) + frontier supervisor (Groq Qwen 3 32B, free) with PII redaction
- **3D model viewer** — Three.js/React Three Fiber with GLB + Arweave/Irys resolution and 2D fallback
- **Telegram-native chat** — talk to your companion directly in Telegram with voice, images, and documents
- **Full web dashboard** — 23 pages, 60+ components, glass-morphism dark UI with real-time chat
- **Candy Machine NFT minting** — Stripe checkout + server-side mint via Metaplex CM v3
- **Auto-wallet generation** — Ed25519 keypair via Web Crypto API, AES-GCM encryption, no crypto knowledge needed
- **Phantom wallet support** — optional connection for crypto-native users
- **Multi-tier pricing** — Free, Pro ($9.99/mo), Enterprise ($29.99/mo) with live usage meters
- **Real-time analytics** — PostHog event tracking + identity on login/logout
- **Security** — jailbreak detection, PII redaction, input sanitization, rate limiting, personality validation

### Bags.fm Integration
- Companion ownership verified on-chain via DAS queries
- NFT minting through Candy Machine v3 (Stripe payment + auto-mint)
- Token-gated premium features
- Built on the Bags ecosystem
- Fee-sharing revenue model

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript 5.7, Tailwind CSS 4 |
| 3D | Three.js, React Three Fiber, Drei |
| Animation | Framer Motion |
| Backend | Fastify, Node.js 20+ |
| Bot | Grammy (Telegram Bot Framework) |
| AI | Groq (Qwen 3 32B free), Ollama (local), OpenAI/Anthropic (paid fallback) |
| Voice | ElevenLabs TTS (6 voices), OpenAI Whisper STT, whisper.cpp (local), XTTS v2 / Piper (local TTS) |
| Database | SQLite (better-sqlite3) — conversations, memories, progress, NFT ownership |
| Auth | Telegram Login Widget + JWT |
| NFT Minting | Metaplex Candy Machine v3, Umi, Arweave/Irys, [3D Anvil (CC0)](https://github.com/ToxSam/3d-anvil) |
| Blockchain | Solana (devnet/mainnet), Phantom Wallet, DAS (Digital Asset Standard) |
| Payments | Stripe (subscriptions + one-time NFT mint payments, no SDK — raw fetch) |
| Analytics | PostHog, Vercel Analytics |
| Hosting | Vercel (free tier) |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    KIN Platform                      │
├──────────┬──────────┬──────────┬───────────────────┤
│  Web App │ Telegram │  Voice   │   Bags.fm / NFT   │
│ (Next.js)│  (Grammy)│(6 voices)│  (Candy Machine)  │
├──────────┴──────────┴──────────┴───────────────────┤
│               Fastify API Server                    │
├──────────┬──────────┬──────────┬───────────────────┤
│   Auth   │  Chat    │ Memory   │  Companions (6)   │
│  (JWT)   │(2-brain) │(SQLite)  │  (NFT ownership)  │
├──────────┼──────────┼──────────┼───────────────────┤
│  Ollama  │  Groq    │ Stripe   │  Solana RPC       │
│ (local)  │ (free)   │(payments)│  (Metaplex/DAS)   │
├──────────┴──────────┴──────────┴───────────────────┤
│           SQLite + Solana + Arweave/Irys            │
└─────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Clone the repository
git clone https://github.com/kr8tiv-ai/kr8tiv-runtime-truth-contracts.git
cd kr8tiv-runtime-truth-contracts

# Install web app dependencies
cd web && npm install

# Configure environment
cp ../.env.example .env.local
# Edit .env.local with your API keys (see below)

# Start development server
npm run dev
# → http://localhost:3001
```

### Minimum Environment Variables

```env
# Required
TELEGRAM_BOT_TOKEN=your_bot_token       # From @BotFather
JWT_SECRET=your_random_secret           # Any secure string

# Free AI (pick one)
GROQ_API_KEY=                           # Free at console.groq.com (500K tokens/day)

# Optional
NEXT_PUBLIC_API_URL=http://localhost:3000
ELEVENLABS_API_KEY=                     # For voice features
STRIPE_SECRET_KEY=                      # For payments (graceful without it)
SOLANA_ADMIN_KEYPAIR=                   # For NFT minting (falls back to mock)
```

## Project Structure

```
├── web/                 # Next.js 15 web app (23 pages, 60+ components)
│   ├── src/app/         # App Router pages (dashboard, chat, onboard, billing)
│   ├── src/components/  # UI, landing, dashboard, onboard, 3D, auth
│   ├── src/hooks/       # 12 custom React hooks (useChat, useBilling, etc.)
│   ├── src/lib/         # API client, types, constants, wallet, analytics, Solana
│   └── src/providers/   # Auth, Toast providers
├── api/                 # Fastify API server (40+ endpoints)
│   ├── routes/          # chat, billing, nft, preferences, memories, etc.
│   └── lib/             # solana-mint, middleware
├── bot/                 # Telegram bot (Grammy)
│   ├── handlers/        # start, help, companions, voice, image, document, progress
│   ├── memory/          # SQLite conversation store with memories
│   ├── skills/          # Extensible skill router (web search, reminders)
│   └── utils/           # sanitize, rate-limit, language detection, jailbreak detection
├── inference/           # Two-brain AI architecture
│   ├── supervisor.ts    # Local ↔ supervisor routing with PII redaction
│   ├── fallback-handler.ts  # Groq → Anthropic → OpenAI waterfall
│   └── companion-prompts.ts # Per-companion prompt builder
├── voice/               # Voice processing pipeline
│   ├── pipeline.ts      # Whisper STT + ElevenLabs/OpenAI/local TTS
│   └── local-tts.ts     # XTTS v2 + Piper local synthesis
├── companions/          # Companion personality definitions + config
├── packages/            # Shared packages (mission-control, node-runtime)
└── schemas/             # Data schemas
```

## Companion Archetypes

Each companion is a unique NFT with special abilities:

| Companion | Species | Specialization | Ability | Voice |
|-----------|---------|---------------|---------|-------|
| **Cipher** | Code Kraken | Code & Web Design | Frontend generation | Adam (deep, analytical) |
| **Mischief** | Glitch Pup | Creative & Social | Brand building | Bella (playful, energetic) |
| **Vortex** | Teal Dragon | Strategy & Analytics | Data analysis | Arnold (authoritative) |
| **Forge** | Cyber Unicorn | Building & Making | Architecture review | Antoni (confident) |
| **Aether** | Frost Ape | Philosophy & Writing | Creative writing | Elli (contemplative) |
| **Catalyst** | Cosmic Blob | Motivation & Growth | Habit coaching | Rachel (warm, motivational) |

## Roadmap

### Now (MVP — $0 cost)
- [x] 23-page Next.js web app with glass-morphism UI
- [x] 6 companion archetypes with unique personalities and prompts
- [x] 5-step onboarding wizard with memory seeding
- [x] 3D model viewer infrastructure (Arweave/Irys pipeline ready)
- [x] Telegram bot with voice, image, and document support
- [x] Dashboard with gamification (XP, badges, levels — SQLite persisted)
- [x] Web chat with markdown, typewriter, reactions, voice input
- [x] Referral system with leaderboard
- [x] PostHog analytics with identity tracking
- [x] Bags.fm ecosystem integration
- [x] Groq-powered free AI chat (Qwen 3 32B, 500K tokens/day)
- [x] Two-brain supervisor with PII redaction and graceful fallback
- [x] Candy Machine v3 NFT minting (Stripe + server-side mint)
- [x] Auto-wallet generation (no crypto knowledge needed)
- [x] Phantom wallet optional connection
- [x] Per-companion ElevenLabs voice IDs
- [x] Persistent memory injection into chat context
- [x] Jailbreak detection, rate limiting, input sanitization
- [ ] Vercel deployment

### Post-Grant (with Bags Hackathon funding)
- [x] ElevenLabs voice companions (6 unique voices mapped)
- [x] Stripe billing integration (subscriptions + NFT mint checkout)
- [ ] GLB 3D model creation via Tripo3D.ai
- [ ] Helius RPC paid tier for production DAS queries
- [ ] Custom companion fine-tuning (DPO training)
- [ ] Custom domain + SSL

### Future
- [ ] Multi-language support
- [ ] Companion marketplace (trade NFTs)
- [ ] Team/enterprise companion sharing
- [ ] Mobile app (React Native)
- [ ] Voice-first interaction mode
- [ ] Plugin system for companion abilities

## KR8TIV Ecosystem

KIN is part of the [KR8TIV-AI](https://github.com/kr8tiv-ai) ecosystem:

| Project | Purpose |
|---------|---------|
| **kr8tiv-runtime-truth-contracts** | KIN core platform (this repo) |
| **PinkBrain-lp** | Auto-compounding liquidity engine for Bags.fm |
| **PinkBrain-Router** | Bags.fm App Store — DeFi fees → OpenRouter AI credits |
| **kr8tiv-mission-control** | Multi-agent orchestration |
| **team-setup-and-organization** | DevOps infrastructure |
| **kr8tiv-team-execution-resilience** | Agent recovery framework |

## Team

**Matt Haynes** — Builder, [@lucidbloks](https://twitter.com/lucidbloks)

Built with KR8TIV — *We Build You A Friend*

## Credits

- **NFT minting infrastructure** adapted from [3D Anvil](https://github.com/ToxSam/3d-anvil) (CC0 Public Domain) — Candy Machine mint, Arweave/Irys upload, and DAS query utilities. Credit to [ToxSam](https://github.com/ToxSam) for the open-source Solana NFT launchpad.

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built on <a href="https://bags.fm">Bags.fm</a></strong> | <a href="https://bags.fm/hackathon">Bags Hackathon 2026</a>
</p>
