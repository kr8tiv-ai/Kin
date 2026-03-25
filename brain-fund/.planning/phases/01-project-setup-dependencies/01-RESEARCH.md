# Phase 1: Project Setup & Dependencies - Research

**Researched:** 2026-03-24
**Domain:** Next.js 16 / Solana dependency management / static export architecture
**Confidence:** HIGH (most findings verified against official Next.js 16 docs and npm registry)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| R9 | Install Solana and data-fetching dependencies (@solana/web3.js, @solana/spl-token, @tanstack/react-query, recharts, date-fns) | Stack section documents exact versions, install flags, and React 19 peer dep notes |
| R10 | Remove unused 3D/animation packages (@react-three/fiber, @react-three/drei, three, framer-motion) | Analysis of compiled .next/ artifacts confirms these are NOT referenced in any built component - safe to remove |
| R11 | Configure environment variables, /lib/constants.ts, /lib/investments.config.ts | Architecture patterns section documents exact file structures and env var conventions for static export |
</phase_requirements>

---

## Summary

This is a **Next.js 16.2.1** app with **React 19.2.4**, **Tailwind CSS v4.2.2**, **Turbopack** as the default bundler, and **`output: 'export'`** (static site generation). The source lives in `frontend/` with `src/app/`, `src/components/`, and `src/app/api/` directories. The project deploys to Hostinger shared hosting as a fully static site — there is no Node.js server at runtime.

The static export constraint is the single most important architectural fact for this phase. **All external API calls (Helius, Birdeye, Solscan) must happen client-side from the browser.** Route Handlers in `output: export` mode only produce static JSON files at build time — they cannot proxy API keys at runtime. The existing `/api/treasury` route appears to be a static GET handler compiled at build time. New War Room data must be fetched directly from external APIs in the browser.

The second critical fact is that **Next.js 16 uses Turbopack by default**, which means the traditional `webpack.resolve.fallback` polyfill pattern for `@solana/web3.js` v1 will **fail the build** unless you add `--webpack` flag to scripts or migrate to Turbopack's `turbopack.resolveAlias`. The cleanest path is to avoid importing the SDK in browser code entirely and use plain `fetch()` against the Helius HTTP JSON-RPC endpoint.

**Primary recommendation:** Install all packages with `npm install --legacy-peer-deps`, use `@solana/web3.js@^1.98.4` pinned to v1 (not v2/kit), use `recharts@^3.8.0` (no overrides needed), set up TanStack Query v5 with a `"use client"` provider wrapper, and keep all external API calls client-side since the site is a static export.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @solana/web3.js | ^1.98.4 (v1 branch) | RPC calls, account queries, token data | v1 is stable, maintenance mode; v2/@solana/kit has breaking API changes not needed for read-only data |
| @solana/spl-token | ^0.4.14 | SPL token account parsing, mint info | Standard complement to web3.js v1; same peer dep range |
| @tanstack/react-query | ^5.x | Data fetching, caching, refetch intervals | Industry standard for client-side async state; v5 stable; official Next.js App Router support |
| recharts | ^3.8.0 | Charts for price/treasury data | v3.8.0 is latest; React 19 compatible without overrides (unlike v2.x) |
| date-fns | ^4.1.0 | Date formatting for timestamps | Latest stable with first-class timezone support; tree-shakable ESM |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query-devtools | ^5.x | Dev-time query inspection | Development only, conditionally rendered |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @solana/web3.js v1 | @solana/kit (v2) | v2 has entirely different functional API, no Connection class, migration cost not worth it for read-only dashboard |
| recharts | Victory, tremor, chart.js | Recharts most widely used; v3 fixes React 19 compat issues present in v2 |
| @tanstack/react-query | SWR | React Query v5 has more features, official Next.js App Router guide |
| date-fns v4 | dayjs | date-fns v4 is ESM-first + tree-shakable; dayjs is lighter but less composable |

### Installation

```bash
cd frontend
npm install @solana/web3.js@^1.98.4 @solana/spl-token@^0.4.14 @tanstack/react-query@^5 recharts@^3.8.0 date-fns@^4 --legacy-peer-deps
npm install -D @tanstack/react-query-devtools --legacy-peer-deps
```

**Why `--legacy-peer-deps`:** React 19.2.4 is newer than some package peer dep declarations. This skips strict peer resolution without forcing incompatible installs. recharts v3 does NOT need an `overrides` block (unlike v2.x which required `react-is` override).

### Packages to Remove

```bash
cd frontend
npm uninstall @react-three/fiber @react-three/drei three framer-motion three-mesh-bvh three-stdlib troika-three-text troika-three-utils --legacy-peer-deps
```

**Safety verification (CONFIRMED from build analysis):**
- Zero references to `@react-three`, `framer-motion`, `Canvas`, `useFrame`, `AnimatePresence` in any compiled JS chunk in `.next/static/` or `.next/server/`
- `blueprintscene.tsx` source file exists but compiles to a video-background component with no Three.js canvas
- The packages are installed but NOT imported by any active component
- Removing them is safe and reduces `node_modules` by approximately 200MB+

---

## Architecture Patterns

### Project Structure (existing + additions)

```
frontend/src/
├── app/
│   ├── layout.tsx              # Add QueryClientProvider wrapper here
│   ├── page.tsx                # Existing homepage
│   ├── war-room/
│   │   └── page.tsx            # NEW: War Room dashboard page
│   └── api/
│       └── treasury/
│           └── route.ts        # Existing (static GET handler at build time)
├── components/                 # Existing site components - do not modify
├── lib/
│   ├── constants.ts            # NEW: wallet addresses, mint, config
│   └── investments.config.ts   # NEW: treasury holdings metadata
└── providers/
    └── query-client.tsx        # NEW: "use client" TanStack provider
```

### Pattern 1: TanStack Query Provider Setup (App Router)

**What:** A `"use client"` provider component wrapping the app with QueryClient.

**When to use:** Required — QueryClientProvider must be in client context; cannot use `useState` in Server Components.

```typescript
// src/providers/query-client.tsx
// Source: TanStack Query v5 official docs
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

```typescript
// src/app/layout.tsx — add provider wrap
import { QueryProvider } from '@/providers/query-client'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  )
}
```

### Pattern 2: /lib/constants.ts Structure

**What:** Single source of truth for all wallet addresses, mint addresses, and config values.

**When to use:** Any component needing an address imports from here — never hardcoded inline.

```typescript
// src/lib/constants.ts
export const BRAIN_TOKEN_MINT = 'YOUR_MINT_ADDRESS_HERE'
export const TREASURY_WALLET = 'YOUR_TREASURY_WALLET_HERE'
export const TEAM_WALLET = 'YOUR_TEAM_WALLET_HERE'

export const SOLANA_NETWORK = 'mainnet-beta' as const

// NEXT_PUBLIC_ prefix required for client-side access in static export
export const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`
export const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so'
export const SOLSCAN_API_BASE = 'https://pro-api.solscan.io/v2.0'

export const CHART_COLORS = {
  primary: '#d4f000',
  secondary: '#ff9e9e',
  muted: '#cccccc',
} as const
```

### Pattern 3: /lib/investments.config.ts Structure

**What:** Static TypeScript object describing each treasury holding with human-readable metadata.

**When to use:** War Room reads from this to annotate on-chain token balances with strategy notes.

```typescript
// src/lib/investments.config.ts
export interface TreasuryHolding {
  mint: string
  symbol: string
  name: string
  purpose: string
  targetAllocation?: number  // percentage
  category: 'liquidity' | 'investment' | 'reserve' | 'team'
}

export const TREASURY_HOLDINGS: TreasuryHolding[] = [
  {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    purpose: 'Primary reserve asset for operations and liquidity',
    category: 'reserve',
  },
  // Add other holdings here
]

export const HOLDINGS_BY_MINT = Object.fromEntries(
  TREASURY_HOLDINGS.map(h => [h.mint, h])
)
```

### Pattern 4: .env.local Structure for Static Export

**What:** Next.js env var prefixing — the most critical rule for static export sites.

```bash
# .env.local

# EXISTING
SOLSCAN_API_KEY=eyJhbGci...

# NEW — NEXT_PUBLIC_ prefix REQUIRED for client-side access
# Without this prefix, values are undefined in the browser (stripped at build time)
NEXT_PUBLIC_HELIUS_API_KEY=your_helius_key_here
NEXT_PUBLIC_BIRDEYE_API_KEY=your_birdeye_key_here

# NOTE: In static export, ALL data fetching is client-side
# Therefore ALL keys used at runtime MUST have NEXT_PUBLIC_ prefix
# This means keys are visible in browser source — mitigate with:
#   1. Helius domain allowlist (dashboard.helius.dev)
#   2. Long-term: Cloudflare Worker proxy (keeps keys server-side)
```

### Anti-Patterns to Avoid

- **Using webpack `resolve.fallback` in next.config.ts:** Next.js 16 Turbopack is default. Webpack config causes build failure. Use `turbopack.resolveAlias` or avoid Node.js SDK in browser.

- **Placing API keys without `NEXT_PUBLIC_` prefix:** In static export, all fetch calls are client-side. Non-prefixed vars are `undefined` at runtime. Produces silent 401 failures.

- **Expecting Route Handlers to proxy API keys at runtime:** In `output: 'export'`, Route Handlers produce static files at build time only — not live request proxies.

- **Creating QueryClient outside useState:** Creates a new client on every render. Must use `useState(() => new QueryClient())` pattern.

- **Importing @solana/web3.js in Server Components:** Triggers Node.js polyfill errors with Turbopack. Only import in `"use client"` components.

- **Installing @solana/web3.js without version pin:** `npm install @solana/web3.js` now resolves to v2 (different API). Always pin to `@solana/web3.js@^1.98.4`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side data fetching with loading/error states | Custom useEffect + state machine | @tanstack/react-query useQuery | Handles deduplication, retries, background refetch, stale-while-revalidate |
| Token price charts | Raw SVG / canvas math | recharts LineChart, AreaChart | D3-based rendering, responsive containers, tooltips, legends built-in |
| Date formatting ("3 days ago", "Mar 24") | Custom date math | date-fns format(), formatDistanceToNow() | Edge cases in DST, leap years, locale — not worth hand-rolling |
| Solana account decoding | Manual Buffer/borsh parsing | @solana/spl-token getAccount(), getMint() | Token account struct is versioned and complex |

**Key insight:** The War Room is a read-only display dashboard. Complexity is in data fetching and display, not business logic. Use established libraries for every layer.

---

## Common Pitfalls

### Pitfall 1: Turbopack Build Failure with Solana Polyfills

**What goes wrong:** `next build` throws `Can't resolve 'crypto'` or `Can't resolve 'buffer'` when `@solana/web3.js` is imported in client components.

**Why it happens:** `@solana/web3.js` v1 depends on Node.js core modules that Turbopack does not polyfill. The traditional `webpack.resolve.fallback` fix causes a build failure in Next.js 16 Turbopack.

**How to avoid:**
Option A (recommended): Use Helius RPC via plain `fetch()` to the JSON-RPC endpoint. No SDK import needed for read-only data.
Option B: Add `turbopack.resolveAlias` in `next.config.ts` to stub Node.js modules for browser.
Option C: Add `--webpack` flag to build script, use old `webpack.resolve.fallback` pattern.

**Warning signs:** `Can't resolve 'crypto'`, `Can't resolve 'buffer'`, `Can't resolve 'stream'` during build.

### Pitfall 2: API Keys Missing NEXT_PUBLIC_ Prefix

**What goes wrong:** API fetch calls return 401/403. `console.log(process.env.HELIUS_API_KEY)` shows `undefined` in browser.

**Why it happens:** Next.js strips non-`NEXT_PUBLIC_` vars from client bundles at build time — by design. In static export with no server runtime, all fetches are client-side.

**How to avoid:** Prefix all keys needed at runtime with `NEXT_PUBLIC_`. Add Helius domain restrictions in dashboard for short-term key protection.

**Warning signs:** `undefined` API key in browser console, 401 responses from Helius/Birdeye.

### Pitfall 3: recharts v2.x React 19 Peer Dep Conflict

**What goes wrong:** `npm install recharts` fails with ERESOLVE peer dependency error about `react-is`.

**Why it happens:** recharts v2.x has a fixed `react-is` dependency incompatible with React 19. v3.x resolves this.

**How to avoid:** Use `recharts@^3.8.0`. If forced to use v2.x, add `"overrides": { "react-is": "^19.0.0" }` to `package.json`.

**Warning signs:** ERESOLVE error mentioning `react-is` during npm install.

### Pitfall 4: @solana/web3.js v1 vs v2 Confusion

**What goes wrong:** Code fails with "Connection is not a constructor" or "PublicKey not found" — because v2 was installed.

**Why it happens:** The npm `latest` tag for `@solana/web3.js` now points to v2 which has a completely different functional API with no `Connection` class.

**How to avoid:** Always install `@solana/web3.js@^1.98.4` explicitly. v1 is in maintenance mode but stable and compatible with `@solana/spl-token@0.4.x`.

**Warning signs:** Import errors for `Connection`, `PublicKey`, `clusterApiUrl`.

### Pitfall 5: Next.js 16 Async Request APIs

**What goes wrong:** New route handlers that use `cookies()`, `headers()`, or `params` synchronously throw runtime errors.

**Why it happens:** Next.js 16 fully removes the temporary synchronous compatibility shim from v15. These APIs are always async now.

**How to avoid:** Write all new route handlers and page components using async patterns from the start. Use `await params`, `await cookies()`.

**Warning signs:** "cookies() expects a Promise", "params must be awaited".

---

## Code Examples

### useQuery pattern for War Room data (plain fetch, no SDK)

```typescript
// Recommended: no @solana/web3.js import needed, no polyfill issues
'use client'

import { useQuery } from '@tanstack/react-query'
import { HELIUS_RPC_URL, TREASURY_WALLET } from '@/lib/constants'

async function getTreasuryBalance(walletAddress: string): Promise<number> {
  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [walletAddress],
    }),
  })
  const { result } = await response.json()
  return result.value / 1e9  // lamports to SOL
}

export function useTreasuryBalance() {
  return useQuery({
    queryKey: ['treasury', 'balance', TREASURY_WALLET],
    queryFn: () => getTreasuryBalance(TREASURY_WALLET),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}
```

### recharts Line Chart for price data

```typescript
// Source: recharts.org official docs
'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'

interface PriceDataPoint {
  timestamp: number
  price: number
}

export function PriceChart({ data }: { data: PriceDataPoint[] }) {
  const formatted = data.map(d => ({
    ...d,
    date: format(new Date(d.timestamp * 1000), 'MMM d'),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formatted}>
        <XAxis dataKey="date" stroke="#cccccc" />
        <YAxis stroke="#cccccc" />
        <Tooltip
          contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }}
        />
        <Line
          type="monotone"
          dataKey="price"
          stroke="#d4f000"
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

### Turbopack resolveAlias (only if @solana SDK needed in browser)

```typescript
// next.config.ts — add only if SDK import required
// Source: Next.js 16 docs - nextjs.org/docs/app/guides/upgrading/version-16
import type { NextConfig } from 'next'

// Create frontend/src/lib/empty.ts with: export default {}
const nextConfig: NextConfig = {
  output: 'export',
  turbopack: {
    resolveAlias: {
      crypto: { browser: './src/lib/empty.ts' },
      stream: { browser: './src/lib/empty.ts' },
      buffer: { browser: './src/lib/empty.ts' },
    },
  },
}

export default nextConfig
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| webpack `resolve.fallback` for Solana polyfills | `turbopack.resolveAlias` or use fetch-only | Next.js 16 (2025) | Must update build config or avoid Node.js SDK in browser |
| `experimental.turbopack` config key | `turbopack` top-level config | Next.js 16 | Config structure changed; old key will warn/error |
| `recharts` v2 with `react-is` override | `recharts` v3.x (no override needed) | recharts v3.0 (2024) | Clean install without overrides |
| Synchronous `params`, `cookies()` in handlers | `await params`, `await cookies()` | Next.js 16 (full removal) | New route handlers must be async; no backward compat shim |
| `@solana/web3.js` v1 (active development) | `@solana/web3.js` v1 (maintenance) / `@solana/kit` (v2, active) | Nov 2024 | v1 still works for read-only; v2 has incompatible API |
| `next lint` CLI command | Direct ESLint CLI | Next.js 16 | `next lint` is removed from Next.js CLI |
| `serverRuntimeConfig` / `publicRuntimeConfig` | `process.env` directly | Next.js 16 | Removed; use NEXT_PUBLIC_ prefix for client values |

**Deprecated/outdated:**
- `experimental.turbopack` config key: use top-level `turbopack` in Next.js 16
- `images.domains`: use `images.remotePatterns`
- `serverRuntimeConfig` / `publicRuntimeConfig`: removed entirely

---

## Critical Architecture Note: Static Export Constraints

The `output: 'export'` config (confirmed from build artifacts) means:

| Constraint | Impact on War Room |
|------------|-------------------|
| NO server-side API key proxying at runtime | API keys must be NEXT_PUBLIC_ or use Cloudflare Worker |
| NO cookies(), headers(), request-time Route Handlers | All data fetching is client-side fetch() |
| NO Incremental Static Regeneration | Charts must poll via refetchInterval |
| NO Server Actions | No form submissions or mutations (War Room is read-only anyway) |
| YES to client-side fetch with useQuery | Primary data fetching pattern |
| YES to static GET Route Handlers (build-time JSON) | Can use for hardcoded data, not live data |

---

## Open Questions

1. **API Key Security in Static Export**
   - What we know: `NEXT_PUBLIC_` keys are visible in browser source code
   - What's unclear: Whether production security requires a Cloudflare Worker proxy
   - Recommendation: Use `NEXT_PUBLIC_` for development. Add Helius domain allowlist as minimum production mitigation. Document Cloudflare Worker proxy (https://github.com/helius-labs/helius-rpc-proxy) as Phase 2+ improvement.

2. **Solana SDK vs Raw Fetch**
   - What we know: `@solana/web3.js` v1 in browser requires polyfills that conflict with Turbopack
   - What's unclear: Whether SPL token account decoding is needed (requires SDK) or all data comes from Helius/Birdeye APIs
   - Recommendation: Start with plain fetch() to Helius JSON-RPC. Add SDK only if needed for raw account decoding, with turbopack.resolveAlias config.

3. **Existing /api/treasury Route**
   - What we know: The route exists in build artifacts as a static GET handler
   - What's unclear: Whether it calls Solscan at build time (likely) or if the key works for that
   - Recommendation: Do not modify the existing treasury route in Phase 1. It may need updating in Phase 2.

---

## Sources

### Primary (HIGH confidence)

- Next.js 16.2.1 official docs (nextjs.org/docs/app/guides/static-exports) — confirmed `output: 'export'` constraints, Route Handler behavior, unsupported features
- Next.js 16 Upgrade Guide (nextjs.org/docs/app/guides/upgrading/version-16) — Turbopack default, webpack config failure, `turbopack.resolveAlias`, async Request API removal
- Project `.next/required-server-files.json` — confirmed `output: 'export'` config and Next.js 16.2.1 version
- Project `frontend/node_modules/.package-lock.json` — confirmed React 19.2.4, @react-three/fiber 9.5.0, framer-motion 12.38.0, three 0.183.2 installed
- Compiled `.next/server/chunks/ssr/` and `.next/static/chunks/` — confirmed @react-three and framer-motion have ZERO references in compiled output
- `frontend/.next/types/routes.d.ts` + `tsconfig.tsbuildinfo` analysis — confirmed source files: blueprintscene.tsx, warroom.tsx, no war-room/ route yet
- TanStack Query v5 official docs — provider pattern, React 19 compatibility confirmed

### Secondary (MEDIUM confidence)

- recharts GitHub issue #4558 — v2.x needs `react-is` override; v3.x resolves this natively
- npm registry: recharts 3.8.0 latest (published ~2 weeks before research date)
- npm registry: @solana/web3.js latest v1 is 1.98.4 (maintenance mode)
- npm registry: @solana/spl-token latest is 0.4.14
- npm registry: date-fns latest is 4.1.0
- Helius docs (helius.dev/docs/rpc/protect-your-keys) — API key security, domain restrictions, Cloudflare proxy option

### Tertiary (LOW confidence)

- Community reports of Turbopack `resolveAlias` issues with transitive deps (GitHub issue #88540) — may affect @solana/web3.js indirect deps; recommend plain fetch approach to avoid entirely

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions from project's own package-lock and npm registry
- Architecture: HIGH — static export constraints from official Next.js docs; source paths from build artifacts
- Pitfalls: HIGH (polyfill/turbopack - official docs confirm), HIGH (env var prefix - Next.js behavior), MEDIUM (recharts override - confirmed v2 only), HIGH (async params - official docs)

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable ecosystem; Turbopack improvements ship frequently)
