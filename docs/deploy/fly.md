# Fly.io One-Click Deploy Contract

This guide describes the deterministic Fly.io deployment path for KIN API runtime plus companion image references.

## Required Inputs

- `fly.toml` from this repository
- GHCR images:
  - `ghcr.io/<owner>/kin-api:<tag>`
  - `ghcr.io/<owner>/kin-web:<tag>`
  - `ghcr.io/<owner>/kin-inference:<tag>`
- Required Fly secrets/config:
  - `JWT_SECRET` (set via `fly secrets set`)
  - `OLLAMA_HOST` (internal inference host)
  - `OLLAMA_PORT=11434`

> Keep secrets in Fly secrets manager only. Never paste them into git-tracked files.

## One-Click Path

1. Create Fly app and import `fly.toml`.
2. Deploy API image using:
   - `fly deploy --image ghcr.io/<owner>/kin-api:<tag>`
3. Confirm `KIN_WEB_IMAGE` and `KIN_INFERENCE_IMAGE` refs match GHCR contract.
4. Set `JWT_SECRET` using Fly secrets.
5. Complete deploy.

## Expected URL Shape

- API URL: `https://<app-name>.fly.dev`

(If web/inference are split to separate apps, each gets its own `<name>.fly.dev` URL.)

## Health Proof (Required)

```bash
curl -i https://<fly-app>.fly.dev/health
```

Pass condition: `/health` returns HTTP `200`.

Record proof in `docs/deploy/cloud-proof-matrix.md` with timestamp and evidence reference.

## Failure, Timeout, and Malformed Handling

- **Deploy error / image pull failure:**
  - Confirm GHCR package/tag visibility and existence.
  - Retry with known published immutable tag (`sha-<7hex>`).
- **Health timeout:**
  - Cold starts can delay readiness; probe every 15-30s up to 10 minutes.
  - Timeout remains failed proof until `200` is observed.
- **Malformed domain/URL:**
  - Validate `<app-name>.fly.dev` format from `fly status` output.
  - If malformed/missing, mark failed row and attach diagnostics output.

## D010 External-Action Boundary

The following actions require explicit operator approval:

- Executing `fly deploy` against production app
- Setting/updating secrets (`fly secrets set`)
- DNS/custom domain changes and certificate issuance
- Rollback or machine restart actions
