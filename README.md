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

### Internationalization (i18n)

11 languages supported via `next-intl` with cookie-based locale detection:
`en` `es` `fr` `de` `pt` `ja` `ko` `zh` `it` `ar` `hi`

Companion prompts are language-aware — the system prompt adapts to the user's locale. Translation files live in `web/src/messages/`.

### Canvas Studio

AI-assisted code generation environment at `/dashboard/canvas/[projectId]`:
- Split-pane editor with live preview
- Sandboxed iframe rendering with device toggles (desktop/tablet/mobile)
- SSE streaming from `POST /canvas/generate`
- Project persistence and sharing

### Soul Garden

Three.js 3D visualization of companion personality traits at `/dashboard/soul`:
- 7 trait-to-visual mappings via `@react-three/postprocessing`
- Dynamic import for performance
- Real-time trait evolution display

### Family System

Multi-user household support with COPPA-safe child accounts:
- Family groups with invite codes
- Child accounts with age-bracket safety prompts
- Shared memories and activity feeds
- Parent/guardian controls

### Proactive Companion

Companions can initiate contact based on context:
- Toggle on/off per companion
- Quiet hours configuration
- Max daily message limits
- Calendar OAuth integration for contextual triggers

### PWA + Desktop

- **PWA**: Service worker with Serwist precaching, offline support, install prompt
- **Desktop**: Tauri v2 with system tray toggle, frameless window, native feel

### Fetch Resilience

All 22 raw `fetch()` calls wrapped with retry logic, timeout enforcement, and structured error handling across 14 production files.

### Zero-Knowledge Memory Encryption

All companion memories are encrypted client-side before touching the API. The server never sees plaintext memory content.

- **AES-256-GCM** symmetric encryption with per-memory initialization vectors
- **PBKDF2** key derivation (100K iterations, SHA-512) from user passphrase
- Encrypted payloads stored as opaque blobs -- decryption happens exclusively in the client
- Key rotation support with re-encryption migration path
- Zero-knowledge architecture: API compromise cannot leak memory contents

### Dream Mode

Companions autonomously initiate conversations during user idle periods, simulating ambient awareness and emotional continuity.

- Activity detection via heartbeat tracking -- idle threshold triggers dream state
- Ambient awareness pulls recent memories, calendar context, and time-of-day signals
- Dream message generation uses personality-weighted prompts with reduced temperature
- Quiet hours and per-companion toggle enforcement
- Dream logs persisted for continuity across sessions

### Predictive Companion Engine

The companion learns behavioral patterns over time and pre-fetches data before the user asks.

- Behavioral pattern extraction from conversation history and interaction timing
- Prediction model generates ranked next-action candidates with confidence scores
- Pre-fetch pipeline hydrates context (weather, calendar, portfolio, news) based on predictions above threshold
- Confidence scoring with exponential decay for stale patterns
- User feedback loop refines prediction accuracy per companion

### Gmail & Calendar OAuth2 Integration

Full OAuth2 lifecycle for Google services with encrypted token storage and proactive companion triggers.

- OAuth2 authorization code flow with PKCE for Gmail and Calendar scopes
- **AES-256-GCM** token encryption at rest -- refresh tokens never stored in plaintext
- Gmail API wrappers: inbox search, thread reading, draft creation, label management
- Calendar event fetching with time-range queries and recurrence expansion
- Proactive triggers: upcoming meetings surface briefing context, email digests during idle windows
- Token refresh handled transparently with circuit breaker on auth failures

### Browser Automation

Headless Puppeteer integration for structured web content extraction with security-first URL validation.

- **SSRF-safe URL validation** -- private IP ranges, localhost, and internal hostnames blocked before navigation
- Concurrent page pooling with configurable max-pages limit to bound resource usage
- Structured content extraction: title, meta, headings, body text, Open Graph, JSON-LD
- Screenshot capture for visual context injection into companion conversations
- Request interception for ad/tracker blocking and bandwidth optimization
- Timeout enforcement per page with graceful cleanup on failure

### Scheduler & Pipeline System

Persistent job scheduling and multi-step workflow orchestration with cron-based triggers.

- **Croner-based scheduler** with persistent job definitions in SQLite
- Full CRUD for scheduled jobs via API routes (`POST /scheduler`, `PATCH /scheduler/:id`, `DELETE /scheduler/:id`)
- Boot-time hydration: all active jobs reloaded and re-registered on server restart
- **Multi-step pipelines** with sequential stage execution and context threading between steps
- Pipeline stages can invoke inference, skills, browser automation, or external APIs
- Cron-triggered pipelines for recurring workflows (daily digest, weekly report, portfolio rebalance)
- Execution history with per-run logs, duration tracking, and failure retry policies

### Knowledge Distillation Pipeline

Model compression framework for creating smaller, faster companion models from frontier teachers.

- **Converter** -- exports teacher model outputs into distillation-ready training format
- **Runner** -- orchestrates student model training with configurable hyperparameters
- **Selector** -- picks optimal student checkpoint based on evaluation metrics
- **Store** -- versioned model artifact storage with metadata and lineage tracking
- Evaluation framework with automated benchmarks, scoring rubrics, and teacher-vs-student comparison
- Integration with QLoRA fine-tuning pipeline for companion personality preservation

### Media Generation

AI-powered video and music generation via Replicate API with per-user rate limiting.

- **Video generation** -- Wan 2.x model for text-to-video and image-to-video pipelines
- **Music generation** -- Lyria 3 and MusicGen models for text-to-music with style control
- Per-user rate limiting with sliding window counters (configurable daily/hourly caps)
- Async generation with webhook callbacks and progress polling
- Generated media stored with companion context for memory integration
- Cost tracking per generation for billing attribution

### Community Marketplace

Shared companion ecosystem where users publish, discover, and rate companion configurations.

- Companion template publishing with metadata, preview, and version history
- Star ratings and written reviews with abuse detection
- Activity feed showing trending companions, new uploads, and community highlights
- Leaderboards ranked by downloads, ratings, and active usage
- One-click companion import with soul config merge and conflict resolution

### Approval Gates

User confirmation gates for external skill mutations with fine-grained policy controls.

- Mutations to external services (email send, calendar create, transaction sign) require explicit user approval
- **Policy engine** with per-skill, per-channel, and per-severity rules
- Auto-approve policies for trusted skill + context combinations below risk threshold
- Approval timeout with configurable expiry and fallback behavior
- Audit log of all approval decisions for governance review

### Soul Drift Detection

Continuous monitoring of companion personality evolution with warm/cold phrase markers.

- Personality trait vector computed from recent conversations and compared against baseline soul config
- **Warm markers** -- phrases and behaviors indicating positive trait alignment
- **Cold markers** -- phrases indicating personality deviation or regression
- Drift score quantified as cosine distance from baseline with configurable alert thresholds
- Drift alerts surfaced in Mission Control with trait-level breakdown
- Auto-correction suggestions generated when drift exceeds tolerance

### Child Safety System

Age-bracket safety prompt injection ensuring COPPA compliance and age-appropriate interactions.

- **Three safety tiers**: `under_13` (COPPA-safe), `teen` (13-17), `adult` (18+)
- System prompt injection layer applies age-bracket guardrails before every inference call
- `under_13` mode: no data collection, no external API calls, content filtering enforced
- `teen` mode: reduced content scope, parental notification hooks, limited skill access
- Content classification gate rejects unsafe outputs before delivery
- Family group integration ensures child accounts inherit parent-configured safety policies

### Multi-Channel Delivery

Unified delivery registry with channel-specific message routing and format adaptation.

- **Delivery registry** supporting Telegram, WhatsApp, Discord, and raw API channels
- Channel-specific message formatting: Markdown (Telegram), rich embeds (Discord), plain text (WhatsApp)
- Per-user channel preference with fallback chain (primary > secondary > API inbox)
- Delivery receipts and retry logic with exponential backoff per channel
- Rate limiting applied per-channel to respect platform-specific API quotas
- Broadcast support for system-wide announcements across all registered channels

### DM Security

Allowlist and pairing code management for secure direct message channels.

- **Allowlist model** -- only pre-approved user IDs can interact with companions via DM
- Pairing codes: time-limited, single-use codes for linking new channels to user accounts
- Channel-specific approval: a user can be approved for Telegram but not Discord
- Pairing flow: generate code in dashboard > enter code in DM > channel linked to account
- Revocation support with immediate channel disconnection
- Audit trail of all pairing and revocation events

### Fleet Management

Container lifecycle orchestration for multi-companion deployments with resource governance.

- **Container lifecycle** -- spin up, pause, resume, and destroy companion containers on demand
- Idle management: containers with no active conversations auto-pause after configurable timeout
- **Tunnel management** -- Tailscale or Cloudflare tunnel provisioning per container for secure access
- Credit and token system: per-user resource budgets with usage metering and overage alerts
- **Traefik load balancing** -- dynamic route registration for companion containers with health-aware routing
- Fleet dashboard in Mission Control showing container status, resource usage, and cost attribution

### Referral System

User referral tracking with reward distribution for organic growth.

- Unique referral codes generated per user with deep-link support
- Referral chain tracking: referrer > referee with conversion event logging
- Reward distribution: credit grants, tier upgrades, or badge unlocks on successful referral
- Anti-abuse: duplicate detection, self-referral blocking, minimum activity thresholds
- Referral leaderboard and stats visible in user dashboard

### Billing & Revenue

Stripe-powered subscription management with webhook-driven lifecycle and revenue tracking.

- **Stripe Checkout** integration for subscription creation with plan selection
- Webhook ingestion for `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted` events
- Subscription tier enforcement at the API middleware layer -- feature gating based on active plan
- Revenue tracking with per-user LTV, MRR, and churn metrics
- Grace period handling for failed payments with automated dunning notifications
- Usage-based billing support for metered features (media generation, inference tokens)

### Dockerized Infrastructure

Production-grade containerized deployment with Traefik reverse proxy and comprehensive health monitoring.

- **Traefik reverse proxy** with automatic HTTPS via Let's Encrypt, rate limiting, and IP allowlisting
- Docker Compose orchestration for API, bot, database, Traefik, and worker services
- Healthchecks on all services with restart policies and dependency ordering
- Secured compose files: secrets mounted via Docker secrets, no env vars for sensitive values
- Multi-stage Dockerfile: build stage compiles TypeScript, production stage runs minimal Node.js image
- Volume mounts for persistent data (SQLite, media, logs) with backup-friendly paths

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
| **i18n** | next-intl (11 locales) |
| **Desktop** | Tauri v2 |
| **PWA** | Serwist (service worker + precaching) |
| **Containers** | Docker + Compose + Traefik reverse proxy |
| **Scheduling** | Croner (persistent jobs, pipeline cron triggers) |
| **Browser** | Puppeteer (SSRF-safe, pooled) |
| **Encryption** | AES-256-GCM, PBKDF2 (zero-knowledge memory, token storage) |
| **Payments** | Stripe (subscriptions, webhooks, usage metering) |
| **Media AI** | Replicate API (Wan 2.x video, Lyria 3/MusicGen audio) |
| **OAuth** | Google OAuth2 (Gmail, Calendar) with PKCE |
| **Compression** | @fastify/compress |

---

## Repository Structure

```
kr8tiv-runtime-truth-contracts/
|
+-- api/
|   +-- routes/           25+ route modules (kin, conversations, progress, projects, support, webhook,
|   |                      first-message, voice, skills, memories, family, canvas, soul, preferences,
|   |                      billing, referral, export, import, community, eval, distill, retrain, admin)
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
+-- desktop/              Tauri v2 desktop app (system tray, frameless window)
+-- training/             QLoRA fine-tuning pipeline
+-- db/                   SQLite connection singleton + 6 composite indexes
+-- scripts/              Startup, deployment, health monitoring, doctor diagnostics
+-- assets/               Creature images, egg images, companion metadata
+-- web/                  Next.js dashboard frontend
|   +-- app/              25+ pages (chat, onboard, memories, family, canvas, soul garden)
|   +-- components/       68+ components (onboarding wizard, chat window, canvas studio)
|   +-- hooks/            Custom hooks (useOnboarding, useVoiceIntro, usePWAInstall)
|   +-- lib/              Chat launch, types, i18n utilities
|   +-- messages/         11 translation files (en, es, fr, de, pt, ja, ko, zh, it, ar, hi)
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
| `GOOGLE_CLIENT_ID` | Gmail/Calendar OAuth2 client |
| `GOOGLE_CLIENT_SECRET` | Gmail/Calendar OAuth2 secret |
| `REPLICATE_API_TOKEN` | Video/music generation via Replicate |
| `STRIPE_SECRET_KEY` | Stripe billing integration |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `MEMORY_ENCRYPTION_SALT` | PBKDF2 salt for zero-knowledge memory encryption |
| `TRAEFIK_DASHBOARD_AUTH` | Traefik admin dashboard credentials |

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

## Container Images

The publish workflow pushes three runtime images to GHCR on every `main` push:

| Service | Image |
|---------|-------|
| **API** | `ghcr.io/kr8tiv-ai/kin-api:latest` |
| **Web** | `ghcr.io/kr8tiv-ai/kin-web:latest` |
| **Inference** | `ghcr.io/kr8tiv-ai/kin-inference:latest` |

All images support commit-pinned tags: `sha-<7 hex chars>`

### One-Click Cloud Deploy Paths

- **Railway** — one-click via `railway.toml`; guide: [`docs/deploy/railway.md`](docs/deploy/railway.md)
- **Render** — one-click via `render.yaml`; guide: [`docs/deploy/render.md`](docs/deploy/render.md)
- **Fly.io** — one-click via `fly.toml`; guide: [`docs/deploy/fly.md`](docs/deploy/fly.md)
- **Coolify** — one-click via `docker-compose.coolify.yml`; guide: [`docs/deploy/coolify.md`](docs/deploy/coolify.md)

All providers consume GHCR runtime refs and must prove readiness via `GET /health`.

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
