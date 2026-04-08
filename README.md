```
 _  ______  ___  _____ _____  ___  __
| |/ / __ \( _ )_   _|_   _||_ _| \ \    Runtime Truth Contracts
| ' / |__) / _ \ | |   | |   | |   \ \   Schema-first verified state
|  <|  _  / ___ \| |   | |   | |   / /   for KIN multi-agent governance
|_|\_\_| \_\/ \_/|_|   |_|  |___| /_/
```

---

`v1.0.0` | `TypeScript` | `Fastify 5` | `SQLite/WAL` | `Vitest` | `MIT`

**Runtime Truth Contracts** are the verified state layer for the KIN multi-agent ecosystem. Every agent action -- chat inference, credential access, soul mutation, media generation, NFT mint -- flows through a typed contract that enforces schema correctness, audit trails, and governance rules at runtime.

This is not a smart contract repo. It is the **source of truth** for what KIN agents are allowed to do, what state they hold, and how they prove it.

[Organization](https://github.com/kr8tiv-ai) | [KIN Platform](https://github.com/kr8tiv-ai/Kin) | [Mission Control](https://github.com/kr8tiv-ai/kr8tiv-mission-control)

---

## Architecture

```
                          +---------------------------+
                          |     Mission Control UI    |
                          |  React hooks, GLB viewer  |
                          |  drift alerts, health     |
                          +------------+--------------+
                                       |
                          +------------v--------------+
                          |   Node Runtime API        |
                          |   Express + 7 route       |
                          |   modules (health, drift, |
                          |   NFT, tailscale, support)|
                          +------------+--------------+
                                       |
            +-------------+------------+-------------+-------------+
            |             |            |             |             |
   +--------v---+ +-------v----+ +----v-------+ +---v--------+ +-v-----------+
   | Inference   | | Bot Layer  | | Runtime    | | Voice      | | Solana      |
   | Engine      | | Telegram   | | Watchdog   | | Pipeline   | | NFT Mint    |
   | 7 providers | | Discord    | | Health     | | Whisper    | | Metaplex    |
   | Circuit     | | WhatsApp   | | Probe      | | TTS        | | Ownership   |
   | Breaker     | | Skills     | | Recovery   | | ElevenLabs | | Transfer    |
   +------+------+ +------+-----+ +-----+------+ +------------+ +-------------+
          |               |              |
   +------v------+ +------v-----+ +-----v------+
   | Groq (free) | | Skill      | | Sandbox    |
   | OpenAI      | | Router     | | Exec guard |
   | Anthropic   | | Calculator | | Timeout    |
   | Google      | | Weather    | | Output cap |
   | xAI (Grok)  | | Web Search | | Blocklist  |
   | Moonshot    | | Reminder   | +------------+
   | Z.ai        | +------------+
   +------+------+
          |
   +------v------+
   | Ollama      |  Local-first, on-device
   | (optional)  |  Privacy mode
   +-------------+
```

---

## What "Runtime Truth" Means

A runtime truth contract is a TypeScript module that:

1. **Defines the schema** for a piece of agent state (soul config, credential, conversation, approval)
2. **Validates mutations** before they reach the database
3. **Logs every state change** for auditability
4. **Enforces governance rules** (rate limits, approval gates, trust ladders, drift detection)

The contracts are the single authority that KIN agents reference when deciding what actions are permitted. No agent bypasses the contract layer.

---

## Module Breakdown

### `api/` -- Fastify API Server

| File | Purpose |
|------|---------|
| `routes/kin.ts` | Core chat endpoint, companion status |
| `routes/conversations.ts` | Conversation CRUD, message history |
| `routes/progress.ts` | XP, streaks, badges, leveling |
| `routes/projects.ts` | Project management for agent tasks |
| `routes/support.ts` | AI-powered support ticket system |
| `routes/telegram-webhook.ts` | Telegram webhook ingestion |
| `middleware/rate-limit.ts` | Configurable rate limiting |
| `middleware/auth-rate-limit.ts` | Auth-specific rate controls |
| `lib/solana-mint.ts` | On-chain NFT minting via Metaplex |

### `inference/` -- Multi-Provider AI Engine

| File | Purpose |
|------|---------|
| `index.ts` | Unified export surface for all inference modules |
| `providers/openai.ts` | OpenAI GPT integration |
| `providers/google.ts` | Google Gemini integration |
| `providers/groq.ts` | Groq free-tier inference (500K tokens/day) |
| `providers/xai.ts` | xAI Grok integration |
| `providers/moonshot.ts` | Moonshot Kimi integration |
| `providers/zai.ts` | Z.ai GLM integration |
| `providers/circuit-breaker.ts` | CLOSED/OPEN/HALF_OPEN state machine per provider |
| `companion-prompts.ts` | 6 archetype system prompts (Cipher, Mischief, Vortex, Forge, Aether, Catalyst) |
| `supervisor.ts` | Two-brain escalation -- fast model handles most, frontier activates for complex queries |
| `observation-extractor.ts` | Extract structured observations from conversations |
| `trajectory.ts` | Trajectory logging for agent decision audit |
| `memory/supermemory.ts` | Semantic memory client with embeddings |

### `bot/` -- Multi-Platform Bot Layer

| Directory | Purpose |
|-----------|---------|
| `handlers/` | 18 command handlers: start, help, build, companions, customize, document, export, health, image, onboarding, progress, projects, refer, reset, status, support, switch, voice |
| `skills/builtins/` | Calculator, weather, web search, reminder |
| `skills/loader.ts` | Skill router with regex trigger matching and database-loaded custom skills |
| `memory/conversation-store.ts` | Per-user conversation persistence |
| `utils/` | Language detection, personality checks, rate limiting, input sanitization |

### `packages/mission-control/` -- Dashboard Components

| Export | Purpose |
|--------|---------|
| `DriftStatusWidget` | Real-time soul drift monitoring |
| `DriftAlertPanel` | Alert feed for personality deviations |
| `GLBViewer` | Three.js 3D companion renderer |
| `KinStatusCard` | Per-companion health status |
| `useDriftStatus` | Hook for drift score polling |
| `useVpsHealth` | Hook for VPS health monitoring |
| `useTailscaleStatus` | Hook for remote access status |

### `packages/node-runtime/` -- Mission Control Backend

Express API server providing:
- `/api/kin` -- Companion status
- `/api/health` -- System health
- `/api/drift` -- Drift detection endpoints
- `/api/nft` -- NFT ownership verification
- `/api/tailscale` -- Remote access management
- `/api/support` -- Support ticket system
- `/api/subscription` -- Billing tier management

### `runtime/` -- Health and Recovery

| File | Purpose |
|------|---------|
| `watchdog.ts` | State machine monitor: HEALTHY > DEGRADED > RECOVERING > FAILED with auto-restart |
| `health-probe.ts` | Liveness and readiness probes |
| `health-watcher.ts` | Continuous health observation |
| `heartbeat-client.ts` | Heartbeat emission for watchdog |
| `recovery.ts` | Automated recovery procedures |
| `sandbox.ts` | Sandboxed command execution with timeout, output caps, and blocklists |

### `voice/` -- Voice Pipeline

| File | Purpose |
|------|---------|
| `pipeline.ts` | End-to-end voice conversation (Whisper STT + ElevenLabs/OpenAI TTS) |
| `local-stt.ts` | Local speech-to-text via Whisper |
| `local-tts.ts` | Local text-to-speech via Piper |
| `index.ts` | Unified voice module exports |

### `solana/` -- NFT Integration

Metaplex-powered NFT minting, ownership verification, transfer mechanics, and companion metadata management on Solana.

### `tailscale/` -- Secure Remote Access

Tailscale API client with trust ladder enforcement, device management, remote session control, and device pairing flows.

### `admin/` -- Operations Dashboard

HTML-based admin dashboard for system monitoring and management.

### `db/` -- Database Layer

SQLite via `better-sqlite3` with WAL mode. Singleton connection with lazy initialization and auto-schema application on first run.

---

## Key Systems

### Circuit Breaker (Inference Resilience)

Every AI provider runs behind a circuit breaker with three states:

```
CLOSED ----[N failures]----> OPEN ----[cooldown]----> HALF_OPEN
  ^                                                      |
  +----------[probe succeeds]-----------------------------+
```

Failed providers are automatically skipped. After a cooldown period, a single probe request is allowed. If it succeeds, the circuit closes. If it fails, the circuit reopens.

### Watchdog (Service Recovery)

Bot processes (Telegram, Discord, WhatsApp) are monitored by a watchdog state machine:

```
HEALTHY --[5 min idle]--> DEGRADED --[restart]--> RECOVERING
                                                      |
                          FAILED <--[3 failures]------+
                             |
                     [admin alert via Slack/Telegram]
```

### Two-Brain Inference

Every conversation runs through a dual-model architecture:
1. **Primary Brain** -- Fast, cost-efficient model (Groq free tier or local Ollama)
2. **Supervisor Brain** -- Frontier model activates for complex queries via keyword escalation
3. **Privacy Gate** -- PII redacted before any cloud call; local mode keeps everything on-device

### Skill Router

Skills are loaded from builtins and the database, compiled into RegExp trigger patterns, and matched against incoming messages. The router supports registration, unregistration, database-loaded custom skills, and multi-match disambiguation.

### Security Sandbox

Agent-executed commands run in a sandboxed environment with:
- Timeout enforcement (default 30s)
- Output size limits (default 1MB)
- Blocked command list
- Working directory restriction
- Concurrency caps

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Language** | TypeScript 5.7 (strict mode) |
| **API** | Fastify 5 (JWT, CORS, rate limiting, helmet) |
| **Mission Control API** | Express |
| **Database** | better-sqlite3 with WAL mode |
| **Bots** | grammy (Telegram), discord.js (Discord), Baileys (WhatsApp) |
| **Inference** | 7 providers + Ollama local-first |
| **Voice** | Whisper STT, ElevenLabs/OpenAI/Piper TTS |
| **Blockchain** | Solana Web3.js, Metaplex Umi |
| **3D** | Three.js GLB rendering |
| **Remote Access** | Tailscale API |
| **Testing** | Vitest |
| **Runtime** | tsx (dev), tsc (build) |
| **Containers** | Docker + Compose |
| **Scheduling** | Croner |
| **Browser** | Puppeteer |

---

## Repository Structure

```
kr8tiv-runtime-truth-contracts/
|
+-- api/
|   +-- routes/           6 route modules (kin, conversations, progress, projects, support, webhook)
|   +-- middleware/        Rate limiting, auth guards
|   +-- lib/              Solana mint, archive builder
|   +-- openapi.json      API specification
|
+-- inference/
|   +-- providers/        7 LLM providers + circuit breaker
|   +-- supervisor.ts     Two-brain escalation
|   +-- trajectory.ts     Decision audit trail
|   +-- memory/           Semantic memory (supermemory)
|   +-- companion-prompts.ts   6 archetype system prompts
|   +-- observation-extractor.ts
|   +-- fallback-handler.ts
|
+-- bot/
|   +-- handlers/         18 command handlers
|   +-- skills/           Skill router + 4 builtins
|   +-- memory/           Conversation store
|   +-- utils/            Language, personality, sanitization
|
+-- packages/
|   +-- mission-control/  React components + hooks for dashboard
|   +-- node-runtime/     Express API for mission control backend
|
+-- runtime/
|   +-- watchdog.ts       Service state machine monitor
|   +-- health-probe.ts   Liveness/readiness probes
|   +-- recovery.ts       Auto-recovery procedures
|   +-- sandbox.ts        Sandboxed command execution
|
+-- voice/                Whisper STT + TTS pipeline
+-- solana/               NFT minting + ownership
+-- tailscale/            Secure remote access
+-- admin/                Operations dashboard
+-- db/                   SQLite connection singleton
+-- scripts/              Startup, deployment, health monitoring
+-- assets/               Creature images, egg images, companion metadata
+-- web/                  Dashboard frontend (hooks, sitemap)
+-- tests/                Integration + unit tests (Vitest)
|
+-- Dockerfile            Production container
+-- vitest.config.ts      Test configuration
+-- tsconfig.json         TypeScript strict mode
+-- package.json          Dependencies and scripts
```

---

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm
- (Optional) Ollama for local LLM inference
- (Optional) Docker for containerized deployment

### Install

```bash
git clone https://github.com/kr8tiv-ai/kr8tiv-runtime-truth-contracts.git
cd kr8tiv-runtime-truth-contracts
npm install
```

### Development

```bash
# API + Bot (concurrent)
npm run dev

# API only
npm run dev:api

# Bot only
npm run dev:bot

# Start all services
npm run start:all
```

### Testing

```bash
npm test              # Run all tests (Vitest)
npm run test:watch    # Watch mode
npm run typecheck     # TypeScript strict verification
npm run smoke         # Smoke tests
npm run doctor        # System diagnostics
```

### Docker

```bash
docker compose up -d
```

### Health Monitoring

```bash
npm run health:check    # One-shot health check
npm run health:daemon   # Continuous monitoring daemon
```

---

## Environment

Create a `.env` file at the project root. Required variables depend on which providers you enable:

| Variable | Purpose |
|----------|---------|
| `DATABASE_PATH` | SQLite database path (default: `data/kin.db`) |
| `OPENAI_API_KEY` | OpenAI GPT access |
| `ANTHROPIC_API_KEY` | Anthropic Claude access |
| `GOOGLE_AI_KEY` | Google Gemini access |
| `XAI_API_KEY` | xAI Grok access |
| `GROQ_API_KEY` | Groq free-tier inference |
| `MOONSHOT_API_KEY` | Moonshot Kimi access |
| `ZAI_API_KEY` | Z.ai GLM access |
| `TELEGRAM_BOT_TOKEN` | Telegram bot |
| `DISCORD_BOT_TOKEN` | Discord bot |
| `SLACK_WEBHOOK_URL` | Watchdog alerts |
| `TAILSCALE_API_KEY` | Remote access |
| `ELEVENLABS_API_KEY` | Voice synthesis |

---

## Testing Coverage

| Test Suite | Scope |
|------------|-------|
| `api.test.ts` | Server creation, auth flow, protected routes, validation, skills, heartbeat, support, GDPR export, rate limiting |
| `bot-handlers.test.ts` | All 18 bot command handlers |
| `conversation-store.test.ts` | Conversation persistence and retrieval |
| `integration.test.ts` | End-to-end flows across modules |
| `website-pipeline.test.ts` | Website generation pipeline |

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + bot in watch mode |
| `npm run dev:api` | API server only (tsx watch) |
| `npm run dev:bot` | Telegram bot only (tsx watch) |
| `npm run build` | TypeScript compilation |
| `npm start` | Production API server |
| `npm test` | Vitest test suite |
| `npm run typecheck` | tsc --noEmit |
| `npm run smoke` | Smoke test suite |
| `npm run doctor` | System diagnostics |
| `npm run health:check` | One-shot health probe |
| `npm run health:daemon` | Continuous health monitor |
| `npm run db:migrate` | Apply schema to SQLite |
| `npm run db:reset` | Drop and recreate database |
| `npm run deploy:easy` | Guided deployment script |

---

## The kr8tiv-ai Ecosystem

| Project | Role |
|---------|------|
| **[KIN](https://github.com/kr8tiv-ai/Kin)** | AI companion platform -- 57 characters, 6 bloodlines |
| **[Runtime Truth Contracts](https://github.com/kr8tiv-ai/kr8tiv-runtime-truth-contracts)** | This repo -- verified state layer for multi-agent governance |
| **[Mission Control](https://github.com/kr8tiv-ai/kr8tiv-mission-control)** | Agent governance and evaluation dashboard |
| **[PinkBrain Router](https://github.com/kr8tiv-ai/PinkBrain-Router)** | Bags.fm fee-funded OpenRouter API credits |
| **[PinkBrain LP](https://github.com/kr8tiv-ai/PinkBrain-lp)** | Auto-compounding Meteora DAMM v2 liquidity |
| **[Jarvis](https://github.com/Matt-Aurora-Ventures/Jarvis)** | Persistent context engine -- 81+ Solana trading strategies |

All projects are powered by **$KR8TIV** on Solana through Bags.fm.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

Built by [Matt Haynes](https://github.com/Matt-Aurora-Ventures) / [kr8tiv-ai](https://github.com/kr8tiv-ai)
