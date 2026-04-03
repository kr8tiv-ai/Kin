# Coolify One-Click Deploy Contract

This guide defines the deterministic Coolify path using `docker-compose.coolify.yml` and GHCR pull-based runtime images.

## Required Inputs

- `docker-compose.coolify.yml` from this repository
- GHCR images:
  - `ghcr.io/<owner>/kin-api:<tag>`
  - `ghcr.io/<owner>/kin-web:<tag>`
  - `ghcr.io/<owner>/kin-inference:<tag>`
- Required environment variables:
  - `JWT_SECRET`
  - `NEXT_PUBLIC_API_URL`
  - `OLLAMA_HOST` (usually `inference`)
  - `OLLAMA_PORT=11434`

> Store secrets only in Coolify environment variable controls.

## One-Click Path

1. Create a new Coolify application using **Docker Compose**.
2. Import repository and select `docker-compose.coolify.yml`.
3. Set required env vars before first deploy.
4. Confirm GHCR owner/tag overrides if needed (`GHCR_OWNER`, `KIN_IMAGE_TAG`).
5. Deploy stack.

## Expected URL Shape

- API URL: `https://<api-domain>` (domain configured in Coolify app settings)
- Web URL: `https://<web-domain>`
- Inference usually remains internal.

## Health Proof (Required)

```bash
curl -i https://<api-domain>/health
```

Pass condition: `/health` returns HTTP `200`.

Store result in `docs/deploy/cloud-proof-matrix.md` with timestamp and screenshot/log link.

## Failure, Timeout, and Malformed Handling

- **Deploy error:**
  - Verify GHCR credentials/registry access and image tags.
  - Retry with immutable `sha-<7hex>` tag.
- **Health timeout:**
  - Check Coolify deployment logs and container status.
  - Retry `/health` probe every 20-30s; timeout stays failed until `200`.
- **Malformed URL/domain:**
  - Re-check domain mapping in Coolify and use displayed canonical URL.
  - Mark failed matrix row when URL is blank/malformed/non-resolving.

## D010 External-Action Boundary

The following require explicit human approval in Coolify UI:

- Triggering deploy/redeploy
- Setting/rotating secrets and registry credentials
- Assigning domains/TLS certificates
- Scaling, restarts, or rollback actions
