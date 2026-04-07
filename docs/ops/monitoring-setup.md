# Monitoring Setup

KIN ships with two monitoring tools: a Python health daemon for continuous automated checks, and a TypeScript diagnostic CLI for on-demand deep inspection.

## 1. Health Daemon — Continuous Monitoring

The health daemon (`scripts/health_daemon.py`) runs as a background service, checking KIN health on a configurable interval and triggering recovery actions when checks fail.

### Configuration

The daemon reads `config/health_monitor.yaml`:

```yaml
# Key settings
check_interval_seconds: 30
timeout_seconds: 10
max_error_count: 3          # Failures before triggering recovery

notification_channels:
  - telegram
  - discord

recovery:
  auto_restart: true
  restart_cooldown_seconds: 60
  max_restart_attempts: 3
  escalation_after_failures: 3
```

> **Important:** The `health_monitor.yaml` uses `localhost:8080` as a placeholder endpoint for per-companion checks. For production Docker deployments, the canonical API health endpoint is `http://localhost:3002/health` — update the `endpoint` field in the `kin_list` entries to match your actual setup.

### Notification Channels

Alerting integrates with Telegram and Discord. Configure these environment variables in your `.env`:

```bash
# Telegram alerts (reuses the bot token from your KIN Telegram bot)
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
ALERT_CHAT_ID=${ALERT_CHAT_ID}

# Discord alerts (webhook URL for a monitoring channel)
DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}

# Slack alerts (optional)
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
```

### Running as a Systemd Service

Create `/etc/systemd/system/kin-health.service`:

```ini
[Unit]
Description=KIN Health Monitoring Daemon
Documentation=https://github.com/kr8tiv-ai/kin
After=kin.service
Wants=kin.service

[Service]
Type=simple
WorkingDirectory=/opt/kin
ExecStart=/usr/bin/python3 scripts/health_daemon.py --config config/health_monitor.yaml
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kin-health

# Run as unprivileged user (optional but recommended)
# User=kin
# Group=kin

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable kin-health.service
sudo systemctl start kin-health.service

# Check status
sudo systemctl status kin-health.service
journalctl -u kin-health.service -f
```

### One-Shot Check

Run a single health check cycle without starting the daemon:

```bash
python3 scripts/health_daemon.py --config config/health_monitor.yaml --once
```

## 2. Doctor CLI — On-Demand Diagnostics

The doctor script (`scripts/doctor.ts`) runs deep checks across all KIN subsystems: environment variables, database, Ollama models, provider circuit breakers, platform health, and skills.

```bash
# Console output with pass/warn/fail indicators
npx tsx scripts/doctor.ts

# Machine-readable JSON output
npx tsx scripts/doctor.ts --json
```

### What It Checks

| Category         | Checks                                                       |
|------------------|--------------------------------------------------------------|
| Environment      | Required vars (TELEGRAM_BOT_TOKEN, JWT_SECRET), recommended, optional |
| Database         | File exists, connection, WAL mode, table count               |
| Ollama / LLM     | Server reachable, companion models (kin-cipher, etc.) registered |
| Providers        | Circuit breaker state (CLOSED/HALF_OPEN/OPEN) per frontier provider |
| Platform Health  | Runtime health probe subsystems                              |
| Skills           | Built-in skills loaded and named                             |

### Exit Codes

| Code | Meaning                       |
|------|-------------------------------|
| 0    | All checks passed             |
| 1    | At least one failure          |
| 2    | Warnings only, no failures    |

### Running in Docker

If your KIN services run in Docker, exec into the API container:

```bash
docker exec -it kin-api npx tsx scripts/doctor.ts
```

## 3. Health Endpoint

The API exposes `GET /health` on port 3002. Docker Compose uses this for its own healthcheck:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3002/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

Quick check from the host:

```bash
curl -s http://localhost:3002/health | python3 -m json.tool
```

## 4. Monitoring Checklist

```bash
# Health daemon running
sudo systemctl status kin-health.service

# Docker container health status
docker compose ps   # Check HEALTH column

# API health endpoint
curl -s http://localhost:3002/health

# Deep diagnostics
npx tsx scripts/doctor.ts

# Check Docker daemon logs for restart events
docker events --filter type=container --filter event=restart --since 1h
```
