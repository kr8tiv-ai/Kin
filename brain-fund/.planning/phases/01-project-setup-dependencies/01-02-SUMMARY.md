---
phase: 01-project-setup-dependencies
plan: 02
status: complete
---

## Summary

Created the configuration layer and app scaffolding for the War Room dashboard.

### Files created/modified
| File | Action | Purpose |
|------|--------|---------|
| .env.local | Updated | Added HELIUS_API_KEY and BIRDEYE_API_KEY (server-side only) |
| .env.example | Created | Empty placeholder template for documentation |
| src/lib/constants.ts | Created | Centralized wallet addresses, API URLs, chart colors |
| src/lib/investments.config.ts | Created | Treasury holdings metadata with TreasuryHolding type |
| src/providers/query-client.tsx | Created | TanStack Query v5 provider with devtools |
| src/app/layout.tsx | Updated | Wrapped body contents with QueryProvider |
| src/app/war-room/page.tsx | Created | Stub War Room page with metadata |
| src/components/dashboard/.gitkeep | Created | Placeholder directory for future components |

### Key decisions
- No NEXT_PUBLIC_ prefix — all API keys server-side only (full server mode)
- QueryProvider uses useState pattern (required for App Router)
- constants.ts includes all wallet addresses from spec (treasury, burn, dev, marketing, LP)
- investments.config.ts imports mints from constants.ts for single source of truth

### Verification
- `next build` passes with zero errors
- `/war-room` route appears in build output as static page
- QueryProvider wraps existing layout without breaking fonts, SmoothScrolling, or noise overlay
