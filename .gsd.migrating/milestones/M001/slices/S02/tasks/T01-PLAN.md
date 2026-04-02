---
estimated_steps: 1
estimated_files: 6
skills_used: []
---

# T01: Fix TypeScript compilation errors

Run `npm run typecheck` and fix all TypeScript errors across the entire backend codebase (api/, bot/, inference/, runtime/, voice/, scripts/).

## Inputs

- `tsconfig.json`

## Expected Output

- `Clean tsc output with 0 errors`

## Verification

cd /mnt/c/Users/lucid/Desktop/kr8tiv-runtime-truth-contracts && npx tsc --noEmit
