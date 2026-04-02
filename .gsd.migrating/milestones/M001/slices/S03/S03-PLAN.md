# S03: End-to-End Chat Validation

**Goal:** Validate the full chat flow from web UI through API to inference and back
**Demo:** After this: After this, a user can open the web app and have a real conversation with a KIN companion

## Tasks
- [ ] **T01: E2E chat flow validation** — Start the API server and web dev server. Open the web app in browser. Navigate to chat, send a test message, verify the companion responds with streaming tokens. Confirm the conversation is saved to SQLite.
  - Estimate: 20min
  - Files: api/routes/chat.ts, web/src/app/dashboard/
  - Verify: Manual: open http://localhost:3001, navigate to chat, send message, verify streaming response
