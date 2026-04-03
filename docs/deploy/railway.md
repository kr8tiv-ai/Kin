# Railway One-Click Deploy Contract

This guide documents the deterministic Railway deploy path for KIN using GHCR runtime images.

## Required Inputs

- `railway.toml` from this repository (deploy policy only)
- GHCR images:
  - `ghcr.io/<owner>/kin-api:<tag>`
  - `ghcr.io/<owner>/kin-web:<tag>`
  - `ghcr.io/<owner>/kin-inference:<tag>`
- Required Railway variables (set in each Railway service Variables UI):
  - `JWT_SECRET` (api)
  - `NEXT_PUBLIC_API_URL` (web, must point at the Railway API URL)
  - `OLLAMA_HOST` (api, usually Railway private hostname for inference)
  - `OLLAMA_PORT=11434` (api)
- Optional bot variables:
  - `TELEGRAM_BOT_TOKEN`
  - `OWNER_TELEGRAM_ID`

> Do not paste secrets into repo files or screenshots. Set them only in Railway Variables.

## One-Click Path

1. Create/import three Railway services (api, web, inference).
2. For each service, choose **Source → Image**.
3. Enter image references:
   - api: `ghcr.io/<owner>/kin-api:<tag>`
   - web: `ghcr.io/<owner>/kin-web:<tag>`
   - inference: `ghcr.io/<owner>/kin-inference:<tag>`
4. Apply deploy policy from `railway.toml` (healthcheck path must remain `/health`).
5. Add required variables in Railway Variables UI.
6. Deploy.

## Expected URL Shape

- API URL: `https://<api-service>.up.railway.app`
- Web URL: `https://<web-service>.up.railway.app`
- Inference is usually private/internal.

## Health Proof (Required)

Run these checks after deploy (replace `<api-url>`):

```bash
curl -i https://<api-url>/health
```

Pass condition: HTTP `200` from `/health`.

Record the evidence in `docs/deploy/cloud-proof-matrix.md` with timestamp + screenshot/log link.

## Failure, Timeout, and Malformed Handling

- **Deploy error (image pull / startup fail):**
  - Verify the GHCR image exists for the tag.
  - Retry with a known published immutable tag: `sha-<7hex>`.
- **Health timeout (cold start / pending):**
  - Retry probe every 15-30s for up to 10 minutes.
  - Treat timeout as failed proof until `/health` returns `200`.
- **Malformed URL pattern:**
  - If Railway URL doesn’t match `*.up.railway.app`, open service Settings and copy the canonical public domain.
  - Mark stale or malformed URL in the proof matrix row as failed.

## D010 External-Action Boundary

The following actions require explicit human approval in Railway UI and must not be automated silently:

- Choosing service image sources
- Applying/rotating secrets (`JWT_SECRET`, bot tokens)
- Triggering production deploy/redeploy
- Assigning public domains
