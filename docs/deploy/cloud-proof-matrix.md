# Cloud Deploy Health Proof Matrix (UAT Contract)

Use this matrix as the auditable evidence contract for Slice S03 completion.

## Instructions

1. Complete deploy for each provider using its one-click contract docs.
2. Probe canonical health endpoint (`/health`) on the live URL.
3. Record result immediately with UTC timestamp and evidence artifact link.
4. Keep failed rows (do not delete) to preserve audit trail.

Provider guides:
- `docs/deploy/railway.md`
- `docs/deploy/render.md`
- `docs/deploy/fly.md`
- `docs/deploy/coolify.md`

## Pass/Fail Rules

- ✅ **Pass:** live URL is valid and `GET /health` returns HTTP `200`.
- ❌ **Fail:** deploy error, timeout, malformed URL, or non-200 response (including `404`/`503`).
- Timeout is a failure until a later probe returns `200`.

## Proof Matrix Template

| Provider | Deployed URL | Health Endpoint | HTTP Status | UTC Timestamp | Evidence (screenshot/log URL) | Verdict | Notes |
|---|---|---|---|---|---|---|---|
| Railway | `https://` | `/health` | `pending` | `YYYY-MM-DDTHH:mm:ssZ` | `link-or-path` | `pending` | |
| Render | `https://` | `/health` | `pending` | `YYYY-MM-DDTHH:mm:ssZ` | `link-or-path` | `pending` | |
| Fly.io | `https://` | `/health` | `pending` | `YYYY-MM-DDTHH:mm:ssZ` | `link-or-path` | `pending` | |
| Coolify | `https://` | `/health` | `pending` | `YYYY-MM-DDTHH:mm:ssZ` | `link-or-path` | `pending` | |

## Negative-Test Capture Requirements

For each provider, capture at least one negative case when applicable:

- **Malformed input:** missing URL, malformed domain, or blank evidence field.
- **Error path:** deploy failure or `/health` returns `404`/`503`.
- **Boundary condition:** delayed readiness where verdict stays failed until `/health` eventually returns `200`.

Add these outcomes in `Notes` with linked evidence.

## Load/Retry Guidance (10x Stress)

At 10x deployment cadence, provider API limits and cold starts dominate. Use controlled probing:

- Probe interval: 15-30 seconds
- Retry window: up to 10 minutes per provider
- Do not mark pass until a direct `200` response is observed
- If rate-limited, record it and retry after provider backoff window
