# KIN by KR8TIV — We Build You A Friend

> AI companions powered by frontier models. Each KIN has its own brain, persistent memory, voice, and personality — owned as an NFT on Solana. 57 unique 3D characters across 6 bloodlines.

[![Bags Hackathon 2026](https://img.shields.io/badge/Bags_Hackathon-2026-FF00AA?style=for-the-badge)](https://bags.fm/hackathon)
[![Built on Bags](https://img.shields.io/badge/Built%20on-Bags.fm-FF00AA?style=for-the-badge)](https://bags.fm)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![Solana](https://img.shields.io/badge/Solana-NFTs-9945FF?style=for-the-badge&logo=solana)](https://solana.com)
[![License](https://img.shields.io/badge/License-MIT-00F0FF?style=for-the-badge)](LICENSE)

**Website:** [meetyourkin.com](https://meetyourkin.com) | **Hackathon:** [Bags Global Hackathon](https://bags.fm/hackathon) — $4M Developer Fund
**Organization:** [kr8tiv-ai](https://github.com/kr8tiv-ai) | **Builder:** [Matt Haynes](https://github.com/Matt-Aurora-Ventures)

---

## What is KIN?

KIN is a consumer AI companion platform where users adopt, chat with, and grow alongside personalized AI friends. Each companion is a **unique NFT** with its own **frontier AI brain**, persistent intelligent memory, voice capabilities, and skills that transfer with NFT ownership. No crypto knowledge needed — just pick a friend and start talking.

The collection spans **6 bloodlines** with **57 individually crafted 3D characters**, each generated from original 2D artwork using AI-powered 3D synthesis. Every character ships as a production-ready GLB model rendered in real-time via Three.js/WebGL in the dashboard.

### Why KIN Wins

| Differentiator | Detail |
|---------------|--------|
| **Multi-Brain Architecture** | Each companion runs on a different frontier AI model (GPT-5.4, Claude Opus 4.6, Gemini 3.1 Pro, Grok 4.20, Kimi K2.5, GLM-4.6) |
| **Soul Authoring** | Users shape personality via trait sliders — warmth, humor, formality, curiosity — with drift detection that keeps the AI on-character |
| **Skill Portability** | Skills accrue to companions and transfer with NFT sales — the new owner inherits everything the companion learned |
| **Local-First Privacy** | Ollama integration means conversations can stay on-device. Cloud is opt-in, not required |
| **57 Unique 3D Characters** | AI-generated from original artwork, rendered in real-time WebGL with interactive rotation |
| **Companion Abilities** | 6 domain-specific skills (code gen, social content, data analysis, architecture review, creative writing, habit coaching) powered by local models |
| **Privacy-First Training** | Opt-in conversation curation → QLoRA fine-tuning pipeline → custom Ollama models per companion |
| **Multi-Platform** | Web dashboard, Telegram bot, Discord bot, WhatsApp — same AI, same memory, everywhere |

---

## The Six Bloodlines

| Bloodline | Species | AI Brain | Specialization | Variations |
|-----------|---------|----------|----------------|------------|
| **Cipher** | Code Kraken | OpenAI GPT-5.4 | Web design, frontend, creative technology | 10 |
| **Mischief** | Glitch Pup | Google Gemini 3.1 Pro | Family, personal branding, social media | 10 |
| **Vortex** | Teal Dragon | Anthropic Claude Opus 4.6 | Content strategy, brand voice, analytics | 10 |
| **Forge** | Cyber Unicorn | xAI Grok 4.20 | Code review, debugging, architecture (2M context) | 10 |
| **Aether** | Frost Ape | Moonshot Kimi K2.5 | Creative writing, storytelling, prose editing | 10 |
| **Catalyst** | Cosmic Blob | Z.ai GLM-4.6 | Financial literacy, habit formation, life optimization | 7 |

Free tier uses **Groq Qwen 3 32B** for all companions (500K tokens/day, $0 cost).

---

## Live Demo Flow

```
1. Visit meetyourkin.com
2. Sign up (Google, Email, Solana wallet, X, or Telegram)
3. Onboarding: choose your companion -> author their soul -> done
4. Chat with your KIN — personality matches your soul editor settings
5. Soul Editor: adjust traits -> watch the AI's tone shift in real-time
6. Skills Marketplace: install calculator, weather, web search, more
7. Collection: view all 6 companions in 3D WebGL with interactive rotation
8. Mint: pay SOL -> companion NFT appears in your wallet
9. Progress: earn XP, unlock badges, maintain streaks
10. Share: tweet your KIN's stats for viral growth
```

---

## Architecture

```
                    +-------------------+
                    |   Next.js 15 Web  |  React 19, Three.js, Tailwind 4
                    |   25+ pages, 68+  |  Framer Motion animations
                    |   components       |
                    +--------+----------+
                             |
                    +--------v----------+
                    |   Fastify 5 API   |  26+ routes, JWT auth
                    |   50+ endpoints   |  Rate limiting, CORS
                    +--------+----------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v------+  +----v--------+
     | SQLite DB   |  |  Inference  |  | Solana/NFT  |
     | 20+ tables  |  |  Engine     |  | Metaplex    |
     | Seeds, FTS  |  |             |  | Candy Mach. |
     +-------------+  +------+------+  +-------------+
                             |
           +-----------------+-----------------+
           |        |        |        |        |
        +--v--+  +--v--+  +--v--+  +--v--+  +--v--+
        |Groq |  |Open |  |Anth |  |Goog |  |xAI  |  + Moonshot, Z.ai
        |FREE |  |AI   |  |ropic|  |le   |  |     |
        +-----+  +-----+  +-----+  +-----+  +-----+
           |
     +-----v------+
     | Ollama     |  Local-first, on-device
     | (optional) |  Privacy mode
     +------------+
```

### Two-Brain Inference

Every conversation runs through a **two-brain architecture**:

1. **Primary Brain** — Fast, cost-efficient model (Groq free tier or local Ollama) handles most messages
2. **Supervisor Brain** — Frontier model (GPT-5.4, Claude, Gemini, etc.) activates for complex queries via keyword-triggered escalation
3. **Privacy Contract** — PII is redacted before any cloud call. Local mode keeps everything on-device.

### Soul Drift Detection

The Soul Editor lets users set personality traits. A SHA-256 hash of the soul config creates a "soul fingerprint" — if the AI's behavior drifts from the configured personality, the system detects it and recalibrates.

### Training Pipeline (Fine-Tuning)

Each companion can be fine-tuned on its own conversation history to become more personalized over time:

1. **Curation Dashboard** — Admin UI at `/dashboard/training` to review, approve, and filter conversation data with privacy controls
2. **Privacy-Gated Collection** — Only conversations from users who opted in are eligible. PII is stripped before export.
3. **JSONL Export** — Curated data exports to instruction-following format compatible with any fine-tuning framework
4. **QLoRA Fine-Tuning** — Unsloth-powered 4-bit quantized training script (`training/fine-tune.py`) runs on consumer GPUs (16GB VRAM)
5. **Ollama Deployment** — Auto-generates Modelfiles and deploys fine-tuned models to Ollama for immediate local inference

### Companion Abilities

Each companion has domain-specific abilities powered by their local Ollama model:

| Companion | Ability | Triggers |
|-----------|---------|----------|
| **Cipher** | Code Generation | `generate code`, `write function`, `review code` |
| **Mischief** | Social Content | `create post`, `social media`, `brand content` |
| **Vortex** | Data Analysis | `analyze data`, `market research`, `trend` |
| **Forge** | Architecture Review | `architecture`, `system design`, `code review` |
| **Aether** | Creative Writing | `write story`, `creative writing`, `worldbuild` |
| **Catalyst** | Habit Coaching | `habit`, `goal setting`, `routine`, `accountability` |

Abilities auto-resolve the correct model — branded fine-tuned model (`kin-{companionId}`) if available, otherwise the default local model.

### Privacy Controls

Users control their data with a two-option privacy toggle during onboarding and in settings:
- **Standard Mode** — Conversations may be used for companion improvement (opt-in training data)
- **Maximum Privacy** — All inference stays local via Ollama. No data leaves the device. Training data collection disabled.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js | 15.5.14 |
| **UI** | React | 19.0.0 |
| **Styling** | Tailwind CSS | 4.0.15 |
| **3D Rendering** | Three.js + React Three Fiber + Drei | 0.183.2 |
| **Animations** | Framer Motion | 11.18.0 |
| **Backend** | Fastify | 5.1.0 |
| **Database** | better-sqlite3 | 11.7.0 |
| **Telegram Bot** | grammy | 1.33.0 |
| **Local LLM** | Ollama SDK | 0.5.12 |
| **Cloud LLM** | OpenAI SDK | 4.77.0 |
| **Auth** | @fastify/jwt | 9.0.1 |
| **Blockchain** | Solana Web3.js + Metaplex Umi | latest |
| **Runtime** | Node.js | >= 20.0.0 |
| **Language** | TypeScript | 5.7.2+ |
| **Testing** | Vitest | 2.1.8 |
| **Container** | Docker + Docker Compose | 3.8 |

---

## Repository Structure

```
Kin/
├── api/                          # Fastify API server
│   ├── server.ts                 # Main server, DB init, 28 route files
│   ├── lib/solana-mint.ts        # Candy Machine NFT minting
│   ├── middleware/               # Rate limiting, auth, token gating
│   └── routes/                   # Auth, chat, soul, skills, NFT, training, support, etc.
│
├── web/                          # Next.js 15 frontend
│   └── src/
│       ├── app/                  # 25+ pages (dashboard, chat, collection, soul editor...)
│       ├── components/           # 68+ components (3D viewer, chat, auth, dashboard...)
│       ├── hooks/                # useAuth, useChat, useCompanions, useSoul...
│       └── lib/                  # API client, types, utilities
│
├── inference/                    # Multi-provider AI engine
│   ├── providers/                # 7 LLM providers (OpenAI, Anthropic, Google, xAI, Moonshot, Z.ai, Groq)
│   ├── supervisor.ts             # Two-brain escalation architecture
│   ├── soul-drift.ts             # Personality drift detection
│   ├── companion-prompts.ts      # 6 distinct system prompts
│   ├── fallback-handler.ts       # Local -> Cloud fallback chain
│   ├── training-curation.ts      # Privacy-aware conversation curation for fine-tuning
│   ├── trajectory.ts             # Inference trajectory logging
│   ├── observation-extractor.ts  # Memory extraction from conversations
│   └── memory/supermemory.ts     # Semantic memory client
│
├── training/                     # Model fine-tuning pipeline
│   ├── train-companion.ts        # Full training orchestration (curate → export → fine-tune → deploy)
│   ├── fine-tune.py              # Unsloth QLoRA fine-tuning script (4-bit quantization)
│   ├── modelfile-generator.ts    # Ollama Modelfile generation per companion
│   └── requirements.txt          # Python dependencies (unsloth, transformers, peft)
│
├── scripts/                      # Setup & deployment utilities
│   ├── setup-companion.ts        # Companion setup wizard (model pull + config)
│   └── publish-model.ts          # Publish fine-tuned models to Ollama registry
│
├── companions/config.ts          # 6 companion configs with frontier model assignments
│
├── bot/                          # Multi-platform bots
│   ├── telegram-bot.ts           # Telegram (grammy) — 16 command handlers
│   ├── discord-bot.ts            # Discord bot
│   ├── whatsapp-bot.ts           # WhatsApp bot (Baileys)
│   └── skills/                   # Companion ability system
│       ├── companion-abilities.ts # 6 domain abilities wired to Ollama inference
│       ├── ability-prompts.ts    # Domain-specific system prompts per companion
│       ├── index.ts              # Skill registration + router
│       └── types.ts              # SkillContext, SkillResult types
│
├── voice/                        # Voice pipeline
│   ├── local-stt.ts              # Speech-to-text (Whisper)
│   ├── local-tts.ts              # Text-to-speech (Piper)
│   └── pipeline.ts               # Full voice conversation pipeline
│
├── solana/                       # Blockchain integration
│   ├── index.ts                  # Solana utilities
│   └── nft.ts                    # NFT operations
│
├── db/
│   ├── connection.ts             # SQLite singleton
│   └── schema.sql                # 20+ tables, seeds, indexes, FTS
│
├── runtime/                      # Health monitoring, watchdog, recovery
├── packages/mission-control/     # React component library (Storybook-ready)
├── packages/node-runtime/        # Node.js runtime package
│
├── assets/                       # NFT metadata + creature images
│   ├── creatures/                # 27 creature portrait JPGs
│   ├── eggs/                     # 5 Genesis egg JPGs
│   └── kin-metadata/             # 6 companion JSON metadata files
│
├── 3d-assets/                    # Full 3D character collection
│   ├── Aether - Frost Ape/       # 10 variations (GLB + OBJ + JPG each)
│   ├── Catalyst - Cosmic Blob/   # 7 variations
│   ├── Cipher - Code Kraken/     # 10 variations
│   ├── Forge - Cyber Unicorn/    # 10 variations
│   ├── Mischief - Glitch Pup/    # 10 variations
│   └── Vortex - Teal Dragon/     # 10 variations
│
├── docker-compose.yml            # App + Ollama containers
├── Dockerfile                    # Production build
├── AGENTS.md                     # AI agent contribution guidelines
├── package.json                  # Root dependencies
├── tsconfig.json                 # TypeScript config
└── vitest.config.ts              # Test config (190+ tests passing)
```

---

## 3D Asset Pipeline

Every KIN character follows the same production pipeline:

1. **Original Artwork** — Hand-designed 2D character concepts as high-resolution JPGs
2. **AI 3D Generation** — Source artwork processed through [Tripo3D](https://studio.tripo3d.ai) for fully textured, production-ready 3D meshes
3. **Multi-Format Export** — Each model ships in GLB (real-time rendering), OBJ (3D editing), and source JPG

| Format | Use Case |
|--------|----------|
| **GLB** | Web rendering (Three.js), game engines (Unity/Unreal/Godot), AR/VR (WebXR) |
| **OBJ** | 3D editing in Blender, Maya, ZBrush, Cinema 4D |
| **JPG** | Source artwork / canonical visual reference |

**Total 3D Assets:** 171 files (57 characters x 3 formats)

---

## Database Schema

20+ tables powering the full platform:

| Table | Purpose |
|-------|---------|
| `users` | Multi-auth accounts (email, Google, Solana wallet, X, Telegram) |
| `companions` | 6 Genesis companions with metadata |
| `user_companions` | Ownership mapping + NFT mint addresses |
| `conversations` / `messages` | Chat history with token tracking |
| `memories` | Per-user per-companion memories with embeddings |
| `companion_souls` | Soul editor configs + drift scores |
| `companion_skills` | Skill accrual, leveling, portability |
| `companion_snapshots` | IPFS-ready personality snapshots for NFT transfer |
| `nft_ownership` / `nft_transfers` | NFT tracking + skill transfer log |
| `skills` / `user_skills` | 10 seeded skills, install/toggle tracking |
| `subscriptions` | Billing tiers (Free / Hatchling / Elder / Hero) |
| `referrals` | Referral codes + reward tracking |
| `progress` | XP, streaks, badges, levels |
| `support_tickets` / `support_chats` | AI-powered support system |

---

## API Endpoints (50+)

| Route Group | Key Endpoints |
|------------|---------------|
| **Auth** | `POST /auth/email/register`, `/email/login`, `/google`, `/solana`, `/telegram`, `/x/authorize`, `/x/callback` |
| **Chat** | `POST /kin/chat`, `GET /kin/status` |
| **Conversations** | `GET /conversations`, `POST /conversations`, `GET /conversations/:id/messages` |
| **Soul** | `GET /soul/:companionId`, `PUT /soul/:companionId`, `POST /soul/:companionId/calibrate` |
| **Skills** | `GET /skills`, `POST /skills/install`, `PUT /skills/toggle`, `POST /skills/request` |
| **NFT** | `GET /nft/owned`, `POST /nft/verify` |
| **Progress** | `GET /progress`, `POST /progress/streak` |
| **Support** | `POST /support/chat`, `GET /support/tickets` |
| **Training** | `GET /training/conversations`, `POST /training/curate`, `GET /training/stats`, `POST /training/export` |
| **Health** | `GET /health`, `GET /live`, `POST /heartbeat` |

---

## Bags Hackathon Integration

### Categories
- **AI Agents** — 6 AI companions with distinct frontier model brains
- **Fee Sharing** — Revenue from NFT mints + skill marketplace shared with **$KR8TIV** holders
- **Bags API** — Token-gated features, price feeds, holder verification

### $KR8TIV Token

KIN is powered by the **$KR8TIV** token on Solana via Bags.fm. The token drives the entire kr8tiv-ai ecosystem — 75% of platform profit goes to stakers, 5% to charitable causes, 20% to ongoing development. Hold $KR8TIV to unlock premium companions, access frontier AI models, and earn fee-sharing revenue from the platform.

### Fee-Sharing Revenue Model

Platform revenue (NFT mints, skill marketplace, subscriptions) flows back to **$KR8TIV** holders through Bags.fm's fee-sharing infrastructure.

### 60 Genesis NFTs

| Tier | Count | Mint Price | Perks |
|------|-------|------------|-------|
| Egg | 20 | 2.5 SOL | Base companion access |
| Hatchling | 20 | 5.3 SOL | + Frontier model access |
| Elder | 20 | 8.3 SOL | + All companions + priority skills |

---

## Quick Start

### Prerequisites
- Node.js >= 20.0.0
- npm or pnpm
- (Optional) Ollama for local LLM
- (Optional) Docker for containerized deployment

### 1. Clone & Install

```bash
git clone https://github.com/kr8tiv-ai/Kin.git
cd Kin
npm install
npm install --prefix web
```

### 2. Run the Adaptive Installer (recommended)

Unix/macOS/WSL:
```bash
./deploy-easy.sh --dry-run
./deploy-easy.sh
```

Windows:
```bat
deploy-easy.bat --dry-run
deploy-easy.bat
```

The installer is deterministic and resumable. Safe local fixes can run automatically, while external actions require explicit confirmation.

### 3. Start Development Servers

```bash
# API + Telegram bot
npm run dev

# Web frontend
npm run dev --prefix web
```

> Legacy `setup.sh` / `setup.bat` remain as compatibility wrappers and now delegate to `deploy-easy`.

### 4. Docker Deployment (GHCR Pull-Based)

```bash
docker compose pull
docker compose up -d
```

Pin to a specific published build:
```bash
GHCR_OWNER=kr8tiv-ai KIN_IMAGE_TAG=sha-<short_sha> docker compose up -d
```

---

## Testing

```bash
npm test          # 190+ tests passing (Vitest)
npm run typecheck # Zero TypeScript errors
npm run build     # Production build verification
```

---

## The kr8tiv-ai Ecosystem

| Project | Description | Repo |
|---------|-------------|------|
| **KIN** | AI companion platform — this repo | [kr8tiv-ai/Kin](https://github.com/kr8tiv-ai/Kin) |
| **PinkBrain Router** | Bags.fm fee-funded OpenRouter API credits for 300+ AI models | [kr8tiv-ai/PinkBrain-Router](https://github.com/kr8tiv-ai/PinkBrain-Router) |
| **PinkBrain LP** | Auto-compounding Meteora DAMM v2 liquidity from Bags.fm fees | [kr8tiv-ai/PinkBrain-lp](https://github.com/kr8tiv-ai/PinkBrain-lp) |
| **Runtime Truth Contracts** | Schema-first runtime contracts for multi-agent governance | [kr8tiv-ai/kr8tiv-runtime-truth-contracts](https://github.com/kr8tiv-ai/kr8tiv-runtime-truth-contracts) |
| **Mission Control** | AI agent governance and evaluation dashboard | [kr8tiv-ai/kr8tiv-mission-control](https://github.com/kr8tiv-ai/kr8tiv-mission-control) |
| **Jarvis** | Persistent context engine — 81+ active Solana trading strategies | [Matt-Aurora-Ventures/Jarvis](https://github.com/Matt-Aurora-Ventures/Jarvis) |

### The $KR8TIV Token
The ecosystem is anchored by **$KR8TIV** on Solana — the single token powering all kr8tiv-ai products including KIN, PinkBrain Router, and PinkBrain LP through Bags.fm fee-sharing infrastructure.

---

## Deployment

### Recommended Stack (MVP — ~$5/month)

| Component | Solution | Cost |
|-----------|----------|------|
| API + Web | Hetzner CX22 (2 vCPU, 4GB) | $5/mo |
| LLM | Groq free tier (500K tokens/day) | $0 |
| RPC | Helius free tier (100K credits/day) | $0 |
| Domain | meetyourkin.com (already owned) | $0 |
| SSL | Let's Encrypt | $0 |
| Web hosting | Vercel free tier (optional) | $0 |

### GHCR Runtime Image Contract

The publish workflow (`.github/workflows/publish-ghcr.yml`) pushes three runtime images to GHCR on every `main` push:

| Service | Latest Tag | Commit-Pinned Tag |
|---------|------------|-------------------|
| API | `ghcr.io/<owner>/kin-api:latest` | `ghcr.io/<owner>/kin-api:sha-<short_sha>` |
| Web | `ghcr.io/<owner>/kin-web:latest` | `ghcr.io/<owner>/kin-web:sha-<short_sha>` |
| Inference | `ghcr.io/<owner>/kin-inference:latest` | `ghcr.io/<owner>/kin-inference:sha-<short_sha>` |

Tag contract is shared with `scripts/ghcr-contract.ts`:
- Floating runtime channel: `latest`
- Immutable rollout tag: `sha-<7 hex chars>`

### Pull-Based Docker Compose (No Local Build)

`docker-compose.yml` is now a pull-only deploy surface that consumes the GHCR runtime contract:

```bash
# Optional overrides (defaults shown)
export GHCR_OWNER=kr8tiv-ai
export KIN_IMAGE_TAG=latest

# Pull and run prebuilt runtime images
docker compose pull
docker compose up -d
```

Pin a deployment to a published workflow build:

```bash
export GHCR_OWNER=kr8tiv-ai
export KIN_IMAGE_TAG=sha-1a2b3c4

docker compose pull
docker compose up -d
```

Sanity check:

```bash
curl http://localhost:3002/health
```

### One-Click Cloud Deploy Paths

Use these deterministic one-click import paths. All providers consume GHCR runtime refs (`ghcr.io/<owner>/kin-<service>:<tag>`) and must prove live readiness via `GET /health` before claiming success.

- **Railway** — `railway.toml` + guide: `docs/deploy/railway.md`
- **Render** — `render.yaml` + guide: `docs/deploy/render.md`
- **Fly.io** — `fly.toml` + guide: `docs/deploy/fly.md`
- **Coolify** — `docker-compose.coolify.yml` + guide: `docs/deploy/coolify.md`

Post-deploy proof command (per provider API URL):

```bash
curl -i https://<provider-api-url>/health
```

Pass condition: HTTP `200` from `/health`, then record evidence in `docs/deploy/cloud-proof-matrix.md`.

#### External-Action Boundary (D010)

Deploy triggers, secret entry/rotation (`JWT_SECRET`, bot tokens), domain cutovers, and production rollbacks are explicit human approvals inside each provider dashboard/CLI, not silent automation steps.

---

## Metrics & Scoring (Hackathon)

KIN is evaluated across these Bags Hackathon dimensions:

| Metric | Target | Current |
|--------|--------|---------|
| **DAU** | 100+ | Pre-launch |
| **MRR** | $500+ | Pre-launch |
| **GitHub Stars** | 50+ | Growing |
| **NFT Mints** | 60 Genesis | Ready to deploy |
| **Token Volume** | Active trading | $KIN on Bags.fm |
| **Multi-Platform** | Web + Telegram + Discord | Web + Telegram coded |
| **Test Coverage** | 190+ tests | Passing |
| **API Endpoints** | 55+ | Live |
| **Fine-Tuning** | QLoRA pipeline | Ready |

---

## Links

- **Website:** [meetyourkin.com](https://meetyourkin.com)
- **Hackathon:** [bags.fm/hackathon](https://bags.fm/hackathon)
- **Apply:** [bags.fm/apply](https://bags.fm/apply)
- **Bags API:** [dev.bags.fm](https://dev.bags.fm)
- **Organization:** [github.com/kr8tiv-ai](https://github.com/kr8tiv-ai)
- **Builder:** [github.com/Matt-Aurora-Ventures](https://github.com/Matt-Aurora-Ventures)

---

## License

MIT License. See [LICENSE](LICENSE) for details.

3D character assets are proprietary to the KIN project. All rights reserved.

---

*"We Build You A Friend."* Built by [Matt Haynes](https://github.com/Matt-Aurora-Ventures) / [kr8tiv-ai](https://github.com/kr8tiv-ai)
