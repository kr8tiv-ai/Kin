# KIN Stabilization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the highest-impact contract drift and broken user paths so Kin has one coherent local runtime story and a materially greener verification baseline.

**Architecture:** Fix the system in vertical slices instead of sweeping refactors. Start with the broken frontend/API paths and port contract, then unify Stripe and documentation truth, then address smaller runtime-quality issues that block smooth local development.

**Tech Stack:** Fastify, Next.js 15, Vitest, better-sqlite3, Stripe HTTP API, TypeScript

---

### Task 1: Capture Current Failure Baseline

**Files:**
- Modify: `docs/plans/2026-04-09-kin-stabilization-plan.md`
- Test: `tests/frontier-proxy.test.ts`
- Test: `tests/validate-cloud-deploy-contract.test.ts`

**Step 1: Re-run the known failing verification commands**

Run:

```bash
npx vitest run tests/frontier-proxy.test.ts
npx vitest run tests/validate-cloud-deploy-contract.test.ts
```

Expected: `frontier-proxy` fails because `better-sqlite3` is built for the wrong Node ABI; deploy-contract tests fail due README/validator drift.

**Step 2: Record the root causes before editing**

Root causes:
- Voice UI calls a missing route and bypasses the shared auth/base-url pattern.
- Port defaults disagree across AGENTS, server, Next config, env example, admin page, and OpenAPI.
- Stripe tiers/env vars disagree across the Fastify app, OpenAPI, and Python runtime.
- Deploy docs no longer satisfy the validator contract.

### Task 2: Fix Frontend/API Contract Drift

**Files:**
- Modify: `web/src/components/dashboard/ChatWindow.tsx`
- Modify: `web/src/components/dashboard/CommandPaletteWrapper.tsx`
- Modify: `web/src/app/dashboard/admin/page.tsx`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/hooks/useChat.ts`
- Modify: `api/server.ts`
- Modify: `.env.example`
- Modify: `web/next.config.ts`

**Step 1: Write or update focused tests if practical**

Prefer extending existing test coverage where lightweight. If no suitable test harness exists for the UI code, keep the change narrow and verify through build + targeted grep.

**Step 2: Make the browser use one API calling convention**

Rules:
- Browser code should default to `/api`.
- Authenticated requests should use bearer tokens, not `credentials: 'include'`.
- Direct absolute localhost URLs should be removed from user-facing dashboard code.

**Step 3: Fix the voice flow**

Rules:
- Point recording upload to a real API route.
- Match the request format the backend actually accepts.
- Reuse the same auth/base-url pattern as the working chat stream code.

**Step 4: Unify local port defaults**

Rules:
- Pick one local API default and use it consistently in server/env/Next/OpenAPI/docs.
- Keep the AGENTS contract aligned with the runtime defaults.

### Task 3: Unify Stripe and API Documentation Truth

**Files:**
- Modify: `api/routes/billing.ts`
- Modify: `api/openapi.json`
- Modify: `runtime_types/stripe_client.py`
- Modify: `packages/node-runtime/src/api/subscription.ts`

**Step 1: Choose one tier vocabulary**

Use the tiers actually stored in the app database and billing routes unless a stronger reason appears during implementation.

**Step 2: Choose one Stripe env-var contract**

Use one canonical secret name across the app/runtime/docs. Update secondary adapters or compatibility shims only if needed.

**Step 3: Remove or clearly quarantine placeholder billing paths**

If `packages/node-runtime` must remain stubbed, label it clearly and prevent it from pretending to be authoritative.

**Step 4: Make OpenAPI match the real runtime**

Update enums, source types, server URLs, and any obviously stale contract values found during the pass.

### Task 4: Repair Deploy Docs and Local Quality Issues

**Files:**
- Modify: `docs/deploy/README.md`
- Modify: `scripts/validate-cloud-deploy-contract.cjs` only if the code proves the validator is wrong
- Modify: `api/lib/completion-status.ts`
- Modify: `api/routes/auth.ts`
- Modify: `package.json`

**Step 1: Make deploy docs satisfy the validator**

Prefer fixing `docs/deploy/README.md` to match the existing validator and tests instead of weakening the validator.

**Step 2: Remove obvious sync/blocking or cross-platform footguns**

Targets:
- Replace synchronous request-path file reads where easy.
- Fix Windows-hostile scripts.
- Align OAuth callback defaults with the documented env example.

### Task 5: Verify and Report Residual Risk

**Files:**
- Test: `package.json`
- Test: `web/package.json`

**Step 1: Run the proving commands**

Run:

```bash
npm run typecheck
npm run build --prefix web
npx vitest run tests/validate-cloud-deploy-contract.test.ts
npx tsx scripts/smoke.ts
```

Also run any newly added targeted tests.

**Step 2: Re-run the blocked test class if environment permits**

Run:

```bash
npx vitest run tests/frontier-proxy.test.ts
```

If `better-sqlite3` is still ABI-blocked, report that honestly as an environment constraint, not a code success.
