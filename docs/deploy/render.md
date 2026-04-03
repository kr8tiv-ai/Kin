# Render One-Click Deploy Contract

This guide defines the deterministic Render Blueprint path using GHCR runtime images.

## Required Inputs

- `render.yaml` from this repository
- GHCR images:
  - `ghcr.io/<owner>/kin-api:<tag>`
  - `ghcr.io/<owner>/kin-web:<tag>`
  - `ghcr.io/<owner>/kin-inference:<tag>`
- Required Render env vars/secrets:
  - API: `JWT_SECRET`, `OLLAMA_HOST`, `OLLAMA_PORT=11434`
  - Web: `NEXT_PUBLIC_API_URL` (must point to Render API URL)
- Optional bot env vars:
  - `TELEGRAM_BOT_TOKEN`
  - `OWNER_TELEGRAM_ID`

> Never commit literal secret values. Use Render environment secret controls.

## One-Click Path

1. In Render, choose **New + → Blueprint**.
2. Select repository and confirm `render.yaml` import.
3. Confirm all three services resolve as image-based runtime services.
4. Set required secrets/env vars in each service settings pane.
5. Deploy blueprint.

## Expected URL Shape

- API URL: `https://kin-api.onrender.com` (or service-specific equivalent)
- Web URL: `https://kin-web.onrender.com` (or service-specific equivalent)
- Private service (inference) is internal.

## Health Proof (Required)

```bash
curl -i https://<render-api-url>/health
```

Pass condition: `/health` returns HTTP `200`.

Add proof entry to `docs/deploy/cloud-proof-matrix.md` with timestamp and evidence link.

## Failure, Timeout, and Malformed Handling

- **Deploy error:**
  - Confirm Render service image URL matches `ghcr.io/<owner>/kin-<service>:<tag>`.
  - If latest is stale, redeploy using an immutable `sha-<7hex>` tag.
- **Health timeout:**
  - Poll `/health` every 20-30s.
  - Treat timeout as failed proof until first `200`.
- **Malformed URL/domain:**
  - If URL is missing or malformed, copy canonical service URL from Render dashboard and mark proof row failed until corrected.

## D010 External-Action Boundary

Human approval is required for these external actions in Render:

- Confirming Blueprint import/deploy
- Setting or rotating secrets
- Triggering production redeploys or rollbacks
- Assigning custom domains and DNS
