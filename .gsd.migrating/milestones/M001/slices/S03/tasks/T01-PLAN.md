---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: E2E chat flow validation

Start the API server and web dev server. Open the web app in browser. Navigate to chat, send a test message, verify the companion responds with streaming tokens. Confirm the conversation is saved to SQLite.

## Inputs

- `api/server.ts`
- `web/src/app/dashboard/`

## Expected Output

- `Screenshot/log of successful chat exchange`
- `SQLite query showing persisted conversation`

## Verification

Manual: open http://localhost:3001, navigate to chat, send message, verify streaming response
