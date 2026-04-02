# S02: Test Suite & TypeScript Health

**Goal:** Fix all failing tests and TypeScript errors so the codebase is provably healthy
**Demo:** After this: After this, npm test and npm run typecheck both pass cleanly

## Tasks
- [ ] **T01: Fix TypeScript compilation errors** — Run `npm run typecheck` and fix all TypeScript errors across the entire backend codebase (api/, bot/, inference/, runtime/, voice/, scripts/).
  - Estimate: 30-60min
  - Files: api/**/*.ts, bot/**/*.ts, inference/**/*.ts, runtime/**/*.ts, voice/**/*.ts, tsconfig.json
  - Verify: cd /mnt/c/Users/lucid/Desktop/kr8tiv-runtime-truth-contracts && npx tsc --noEmit
- [ ] **T02: Fix failing Vitest tests** — Run `npm test` and fix all failing Vitest tests. Update test expectations where the implementation has intentionally changed. Keep test coverage at current level or better.
  - Estimate: 30-60min
  - Files: tests/*.test.ts, vitest.config.ts
  - Verify: cd /mnt/c/Users/lucid/Desktop/kr8tiv-runtime-truth-contracts && npx vitest run
