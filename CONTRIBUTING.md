# Contributing to KIN

Thank you for your interest in contributing to KIN! This guide covers everything you need to get started.

---

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** (ships with Node.js)
- **Git**
- (Optional) **Ollama** — for local LLM inference
- (Optional) **Docker** — for containerized deployment

---

## Getting Started

### 1. Fork & Clone

```bash
# Fork via GitHub, then:
git clone https://github.com/<your-username>/Kin.git
cd Kin
```

### 2. Install Dependencies

```bash
npm install
npm install --prefix web
```

### 3. Start Development Servers

```bash
# API server (Fastify + SQLite) — port 3002
npx tsx api/server.ts

# Web frontend (Next.js 15) — port 3001 (in a separate terminal)
npm run dev --prefix web
```

The API runs on **port 3002** and the web dashboard on **port 3001**. The web app proxies API requests via Next.js rewrites configured in `web/next.config.ts`.

### 4. Run Tests

```bash
# Run all tests (Vitest)
npx vitest run

# Run a specific test file
npx vitest run tests/<file>.test.ts

# TypeScript type checking
npx tsc --noEmit

# Production build verification
npm run build --prefix web

# Smoke tests (7 critical API endpoints, in-memory SQLite)
npx tsx scripts/smoke.ts
```

---

## Code Conventions

### API Responses

- **API response keys are always camelCase** — e.g., `companionId`, `createdAt`
- **Database columns use snake_case** — e.g., `companion_id`, `created_at`
- The API layer maps between the two; tests should expect camelCase

### Fastify Routes

Route plugins follow the `FastifyPluginAsync` pattern. See `api/routes/preferences.ts` for a clean example:

```typescript
const myRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/my-endpoint', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    // handler
  });
};
export default myRoute;
```

### Frontend

- Pages use the `'use client'` directive and `framer-motion` for animations
- Data fetching uses the `useApi<T>(path)` hook from `web/src/hooks/useApi.ts`
- API calls go through the `kinApi` singleton from `web/src/lib/api.ts` — never use raw `fetch()`
- UI components use the GlassCard / Button / Badge / Skeleton library in `web/src/components/ui/`
- TypeScript interfaces for API responses live in `web/src/lib/types.ts`

### Auth

- JWT via `@fastify/jwt`
- Dev/test tokens: `POST /auth/dev-login`
- Do NOT add middleware that auto-injects users on protected routes

### Design System

Dark-premium theme with cyan/magenta/gold accents. Design tokens are in `web/src/lib/design-tokens.ts`.

---

## Project Structure

```
api/              → Fastify REST API server (port 3002)
  routes/         → Route plugins (JWT-protected, camelCase responses)
  server.ts       → Server factory, plugin registration, WebSocket chat
web/              → Next.js 15 dashboard (port 3001)
  src/app/        → App Router pages
  src/components/ → React components
  src/hooks/      → Data-fetching hooks (useApi pattern)
  src/lib/        → API client, types, utils
inference/        → Two-brain routing, companion prompts, training data
companions/       → Companion configs and personality markdown
db/schema.sql     → SQLite schema (single file, WAL mode)
bot/              → Telegram/Discord/WhatsApp bot handlers
tests/            → Vitest test files
scripts/          → Utility scripts
```

For the full architecture overview, see the [README](README.md).

---

## Pull Request Guidelines

1. **Branch from `main`** — use descriptive branch names: `feat/soul-editor-v2`, `fix/chat-scroll`, `docs/api-endpoints`
2. **Keep PRs focused** — one feature or fix per PR
3. **Tests required** — add or update tests for any behavior change. Run `npx vitest run` before submitting.
4. **Type-check** — run `npx tsc --noEmit` and ensure zero errors
5. **Build verification** — run `npm run build --prefix web` and confirm it passes
6. **Describe your changes** — explain what changed and why in the PR description

### Commit Messages

Use conventional-style messages:

```
feat: add soul drift notification
fix: correct token count in chat response
docs: update deployment guide
test: add supervisor routing tests
```

---

## Companion IDs

The six KIN companions: `cipher`, `mischief`, `vortex`, `forge`, `aether`, `catalyst`

---

## Known Gotchas

- `better-sqlite3` has no prebuilt binaries for Windows + Node v24 — use Node v20 or WSL
- Next.js 15 requires `useSearchParams` inside a `<Suspense>` boundary for static generation
- Use `--prefix web` for npm commands targeting the `web/` directory

---

## Full Conventions

For the complete architectural guide, testing patterns, privacy model, and AI agent conventions, see [AGENTS.md](AGENTS.md).

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

3D character assets are proprietary to the KIN project and are not covered by the MIT license.
