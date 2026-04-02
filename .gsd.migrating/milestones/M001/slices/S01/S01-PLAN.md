# S01: Web App Build Fix & Vercel Deployment

**Goal:** Fix any Next.js build errors and deploy the web dashboard to Vercel production
**Demo:** After this: After this, the Next.js web app builds cleanly and deploys to Vercel

## Tasks
- [ ] **T01: Audit & fix Next.js build** — Run `cd web && npm run build` and fix all errors — SSR/client boundary mismatches, missing imports, Three.js dynamic imports, type errors. Goal: clean build with 0 errors.
  - Estimate: 30-60min
  - Files: web/src/**/*.tsx, web/src/**/*.ts, web/next.config.ts, web/tsconfig.json
  - Verify: cd /mnt/c/Users/lucid/Desktop/kr8tiv-runtime-truth-contracts/web && npm run build
- [ ] **T02: Verify Vercel configuration** — Check web/vercel.json, ensure build settings are correct, validate environment variables are listed, confirm the project can be deployed from the web/ directory.
  - Estimate: 15min
  - Files: web/vercel.json, web/package.json, web/next.config.ts
  - Verify: cat /mnt/c/Users/lucid/Desktop/kr8tiv-runtime-truth-contracts/web/vercel.json
- [ ] **T03: Run smoke test against local API** — Start the API server locally and run the smoke test script to verify all health and critical endpoints respond correctly.
  - Estimate: 15min
  - Files: scripts/smoke.ts, api/server.ts
  - Verify: cd /mnt/c/Users/lucid/Desktop/kr8tiv-runtime-truth-contracts && npx tsx scripts/smoke.ts
