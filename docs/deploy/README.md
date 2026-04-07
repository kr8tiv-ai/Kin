# Cloud Deploy Docs

- `railway.md` — Railway one-click path, required variables, health proof + fallback handling.
- `render.md` — Render Blueprint one-click path, URL expectations, and diagnostics flow.
- `fly.md` — Fly deploy path, secrets boundary, and `/health` readiness proof.
- `coolify.md` — Coolify compose import path, env contract, and recovery flow.
- `cloud-proof-matrix.md` — auditable UAT evidence matrix for provider live health proof.

## Self-Hosted VPS

The cloud guides above cover managed platforms that handle infrastructure for you. If you're deploying KIN via `docker-compose` on your own VPS (DigitalOcean, Hetzner, Linode, bare metal, etc.), you'll need additional operational setup for security, process management, monitoring, and backups.

See **[docs/ops/README.md](../ops/README.md)** for the full operations index, or jump directly to:

- **[VPS Hardening](../ops/vps-hardening.md)** — SSH lockdown, UFW firewall, fail2ban, unattended upgrades, Docker network isolation
- **[Systemd Services](../ops/systemd-services.md)** — systemd units for docker-compose, Ollama, auto-restart, and boot ordering
- **[Monitoring Setup](../ops/monitoring-setup.md)** — health_daemon.py, disk/memory alerts, container log rotation, Prometheus/Grafana (optional)
- **[Backup & Restore](../ops/backup-restore.md)** — SQLite .backup, training data snapshots, encrypted offsite sync, restore verification
