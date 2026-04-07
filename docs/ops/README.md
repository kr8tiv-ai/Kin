# Operational Templates — Self-Hosted VPS

These templates cover production operations for running KIN on a self-hosted VPS (Ubuntu/Debian). They assume you've already deployed KIN using Docker Compose via the [deploy guide](../deploy/README.md).

**When to use these:** If you're running KIN on your own VPS (DigitalOcean, Hetzner, Linode, bare metal, etc.) and want production-grade hardening, monitoring, and backup. If you're using a managed platform (Railway, Render, Fly, Coolify), see [docs/deploy/](../deploy/) instead — those platforms handle most of this for you.

## Architecture Overview

KIN runs as 3 Docker Compose services:

| Service     | Container        | Port  | Description                         |
|-------------|------------------|-------|-------------------------------------|
| `api`       | `kin-api`        | 3002  | Fastify REST API + WebSocket chat   |
| `web`       | `kin-web`        | 3001  | Next.js 15 dashboard                |
| `inference` | `kin-inference`  | 11434 | Ollama local LLM (internal only)    |

Persistent data lives in two Docker volumes:
- **`kin-data`** → `/app/data/` inside the `api` container (SQLite DB, training JSONL)
- **`ollama-models`** → `/root/.ollama` inside the `inference` container (model weights)

The canonical health endpoint is `GET /health` on port 3002.

## Templates

| Doc | What It Covers |
|-----|----------------|
| [VPS Hardening](vps-hardening.md) | UFW firewall, fail2ban, SSH hardening, unattended upgrades |
| [Systemd Services](systemd-services.md) | Docker Compose as a systemd service, logrotate, restart policy |
| [Monitoring Setup](monitoring-setup.md) | Health daemon, on-demand diagnostics, alerting channels |
| [Backup & Restore](backup-restore.md) | WAL-safe SQLite backup, volume backup, cron schedule, restore procedure |

## Prerequisites

- Ubuntu 22.04+ or Debian 12+ (other distros need adapted commands)
- Docker Engine + Docker Compose v2 installed
- KIN deployed via `docker-compose.yml` in your project root
- SSH access with a non-root sudo user
