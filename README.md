# KIN Platform - Runtime Truth Contracts

> A managed family of AI companions with persistent memory, local-first inference, and blockchain identity.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What is KIN?

KIN is a platform of persistent AI companions that feel like real friends. Each companion has:

- **Persistent Identity** - Remembers you across sessions
- **Local-First Processing** - Runs on your hardware when possible
- **Cloud Fallback** - Graceful degradation with transparency
- **Blockchain Identity** - NFT-linked ownership and transferability
- **Multi-Surface Presence** - Telegram, Mission Control dashboard, voice

The first companion is **Cipher** (Code Kraken 🐙) - a web design specialist and creative technologist.

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/kr8tiv-ai/kr8tiv-runtime-truth-contracts.git
cd kr8tiv-runtime-truth-contracts

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Initialize database
mkdir -p data && npm run db:migrate

# Start development server
npm run dev
```

### Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | **Yes** | From [@BotFather](https://t.me/botfather) |
| `JWT_SECRET` | **Yes** | Random string for JWT signing |
| `OPENAI_API_KEY` | Recommended | Fallback LLM + Whisper transcription |
| `ELEVENLABS_API_KEY` | Optional | Voice synthesis |
| `TAILSCALE_API_KEY` | Optional | Remote access integration |
| `OLLAMA_HOST` | Optional | Local LLM host (default: 127.0.0.1) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      KIN Platform                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Telegram   │    │   Mission    │    │    Solana    │  │
│  │     Bot      │◄──►│   Control    │◄──►│     NFT      │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────────┘  │
│         │                   │                              │
│         ▼                   ▼                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    API Server                        │  │
│  │         (Fastify + JWT + WebSocket)                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                │
│         ┌─────────────────┼─────────────────┐             │
│         ▼                 ▼                 ▼             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Inference   │  │   Memory     │  │   Health     │     │
│  │  (Ollama)    │  │  (SQLite)    │  │  Monitor     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Modules

| Module | Path | Description |
|--------|------|-------------|
| **Telegram Bot** | `bot/` | Grammy-based bot with conversation memory |
| **Inference** | `inference/` | Ollama client + cloud fallback |
| **Voice** | `voice/` | Whisper transcription + TTS synthesis |
| **Website** | `website/` | AI code generation + deployment |
| **API** | `api/` | Fastify REST + WebSocket server |
| **Tailscale** | `tailscale/` | Remote access with trust ladder |
| **Solana** | `solana/` | NFT minting + transfer |
| **Companions** | `companions/` | Personality definitions |

---

## The Genesis Six

Six companion bloodlines, each with unique personality and specialization:

| Name | Type | Specialization | Personality |
|------|------|----------------|-------------|
| **Cipher** | Code Kraken 🐙 | Web design, frontend | Analytical, warm, playful |
| **Mischief** | Glitch Pup 🐕 | Family companion, branding | Curious, energetic, loyal |
| **Vortex** | Teal Dragon 🐉 | Marketing, social media | Wise, strategic, calm |
| **Forge** | Cyber Unicorn 🦄 | Development, debugging | Confident, inspiring, precise |
| **Aether** | Frost Ape 🦍 | Creative writing, art | Patient, methodical, deep |
| **Catalyst** | Cosmic Blob 🫧 | Wealth coaching, habits | Enthusiastic, adaptive, supportive |

---

## API Endpoints

### Health
```
GET  /health/live    # Liveness probe
GET  /health/ready   # Readiness probe
GET  /health/status  # Full system status
```

### Authentication
```
POST /auth/telegram  # Telegram login widget auth
```

### Kin Management
```
GET  /kin            # List user's Kin
POST /kin/claim      # Claim a companion
GET  /kin/:id        # Get specific Kin status
```

### Conversations
```
GET  /conversations  # Conversation history
POST /conversations  # Add message
```

### NFT
```
GET  /nft            # User's NFTs
POST /nft/mint       # Mint companion NFT
POST /nft/transfer   # Transfer NFT
```

### Support
```
GET  /features       # Feature requests
POST /features       # Submit feature request
POST /tickets        # Create support ticket
```

---

## Development

### Scripts

```bash
npm run dev          # Start API + bot in development
npm run dev:api      # Start API server only
npm run dev:bot      # Start Telegram bot only
npm run build        # Build for production
npm run test         # Run tests
npm run typecheck    # TypeScript check
npm run db:migrate   # Initialize database
npm run health:check # Single health check
```

### Project Structure

```
├── api/                 # Fastify API server
│   ├── server.ts        # Main server entry
│   └── routes/          # API route handlers
├── bot/                 # Telegram bot
│   ├── telegram-bot.ts  # Bot entry point
│   ├── handlers/        # Command handlers
│   └── memory/          # Conversation store
├── companions/          # Personality definitions
├── db/                  # Database schema
├── inference/           # LLM integration
├── solana/              # NFT integration
├── tailscale/           # Remote access
├── voice/               # Voice processing
├── website/             # Website building
├── config/              # Configuration files
├── scripts/             # Utility scripts
└── tests/               # Test files
```

---

## Features

### ✅ Implemented

- **Telegram Bot Core** - Full conversation loop with Cipher personality
- **Local LLM Integration** - Ollama client with streaming + cloud fallback
- **Voice Processing** - Whisper transcription + TTS synthesis
- **Website Building** - AI code generation with quality validation
- **Production API** - Fastify with JWT auth, WebSocket, rate limiting
- **Database** - SQLite with complete schema
- **Tailscale Integration** - Remote access with 5-level trust ladder
- **Solana NFT Scaffold** - Metadata, minting, transfer structures
- **Health Monitoring** - Python daemon with auto-restart
- **All 6 Companions** - Full personality definitions

### 🔄 Ready for Integration

- Solana mainnet deployment (Anchor program)
- ElevenLabs voice synthesis
- Production hosting (Docker)

---

## Trust Ladder (Remote Access)

5-level permission system for remote computer access:

| Level | Name | Permissions | Duration |
|-------|------|-------------|----------|
| 0 | Guest | View status only | 5 min |
| 1 | Visitor | View logs | 15 min |
| 2 | Member | Readonly commands, SSH view | 1 hour |
| 3 | Admin | Full access, device management | 8 hours |
| 4 | Owner | Unlimited | No limit |

---

## Requirements Coverage

| Category | Requirements | Status |
|----------|--------------|--------|
| Core Loop | R001, R002, R003 | ✅ Complete |
| Local-First | R008, R009, R031, R032, R045 | ✅ Complete |
| Voice | R038, R043 | ✅ Complete |
| Website | R005, R006, R040 | ✅ Complete |
| Remote Access | R004, R011 | ✅ Complete |
| Memory | R013, R019 | ✅ Complete |
| API/DB | R015, R016 | ✅ Complete |
| NFT | R048, R049 | 🔄 Scaffold ready |
| Production | R034, R035, R036 | ✅ Complete |

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+, TypeScript 5.7 |
| Bot Framework | Grammy |
| API Framework | Fastify |
| Database | SQLite (better-sqlite3) |
| Local LLM | Ollama |
| Cloud LLM | OpenAI, Anthropic |
| Voice | Whisper, ElevenLabs |
| Blockchain | Solana (Anchor) |
| VPN | Tailscale |
| Monitoring | Python daemon |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Support

- **Documentation:** `.gsd/` directory
- **Issues:** [GitHub Issues](https://github.com/kr8tiv-ai/kr8tiv-runtime-truth-contracts/issues)
- **Telegram:** Talk to @your_kin_bot

---

*KIN - AI companions that feel like friends.*
