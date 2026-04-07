# Systemd Services

Run KIN as a managed systemd service so it starts on boot, auto-restarts on failure, and integrates with standard Linux service management.

## 1. Docker Compose Systemd Unit

Create `/etc/systemd/system/kin.service`:

```ini
[Unit]
Description=KIN AI Companion Platform
Documentation=https://github.com/kr8tiv-ai/kin
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/kin
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose up -d --force-recreate
TimeoutStartSec=120
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
```

> **Adjust `WorkingDirectory`** to the directory containing your `docker-compose.yml` and `.env` files. The example assumes `/opt/kin`.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable kin.service
sudo systemctl start kin.service

# Verify
sudo systemctl status kin.service
docker compose ps
```

Manage the service:

```bash
sudo systemctl stop kin.service      # Stop all containers
sudo systemctl restart kin.service   # Restart all containers
sudo systemctl reload kin.service    # Recreate containers (picks up image updates)
journalctl -u kin.service -f         # Follow service logs
```

## 2. Container Restart Policy

The `docker-compose.yml` already sets `restart: unless-stopped` on all three services (api, web, inference). This means:

- Containers auto-restart if they crash
- Containers auto-start when Docker daemon starts (after reboot)
- Containers stay stopped only if you explicitly `docker compose stop` them

The systemd unit above provides an additional management layer — `systemctl enable kin` ensures Docker Compose runs at boot even if individual container restart policies aren't sufficient.

## 3. Logrotate for Docker Logs

Docker container logs can grow unbounded. Create `/etc/logrotate.d/docker-containers`:

```
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    maxsize 50M
}
```

Alternatively, configure Docker daemon log limits globally in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
```

After editing `daemon.json`, restart Docker:

```bash
sudo systemctl restart docker
```

> **Recommendation:** The `daemon.json` approach is simpler and applies to all containers. The logrotate approach gives you finer control and preserves more history.

## 4. Viewing Logs

```bash
# All container logs (follow mode)
docker compose logs -f

# Specific service logs
docker compose logs -f api
docker compose logs -f web
docker compose logs -f inference

# Last 100 lines from the API
docker compose logs --tail=100 api

# Systemd journal for the kin service
journalctl -u kin.service --since "1 hour ago"
```

## 5. Updating KIN

When new images are available:

```bash
cd /opt/kin

# Pull latest images
docker compose pull

# Recreate containers with new images (zero-downtime per container)
docker compose up -d

# Or via systemd
sudo systemctl reload kin.service

# Verify health after update
curl -s http://localhost:3002/health
```
