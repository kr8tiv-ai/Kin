# Backup & Restore

KIN stores all persistent data in two Docker volumes. This guide covers WAL-safe SQLite backup, model volume backup, scheduled cron jobs, and the restore procedure.

## Data Locations

| Volume          | Container Path    | Contents                              |
|-----------------|-------------------|---------------------------------------|
| `kin-data`      | `/app/data/`      | SQLite DB (`kin.db`), training JSONL   |
| `ollama-models` | `/root/.ollama`   | Ollama model weights                   |

## 1. SQLite Backup — WAL-Safe

**Never use `cp` or `rsync` to copy a live SQLite database.** SQLite in WAL mode maintains separate `-wal` and `-shm` files. Copying just the `.db` file produces a corrupt backup.

Use SQLite's built-in `.backup` command, which safely checkpoints WAL data:

```bash
# Backup the live database from inside the API container
docker exec kin-api sqlite3 /app/data/kin.db ".backup /app/data/kin-backup-$(date +%Y%m%d-%H%M%S).db"

# Copy the backup file to the host
docker cp kin-api:/app/data/kin-backup-*.db /backups/
```

Or from the host, if you have the `kin-data` volume mounted:

```bash
# Find the volume mount path
docker volume inspect kin-data --format '{{ .Mountpoint }}'

# Backup using sqlite3 on the host (install: apt install sqlite3)
sqlite3 /var/lib/docker/volumes/kin-data/_data/kin.db ".backup /backups/kin-$(date +%Y%m%d).db"
```

### Training Data

Training JSONL files live in `/app/data/training/{companionId}/training.jsonl`. These are append-only and safe to copy directly:

```bash
docker cp kin-api:/app/data/training/ /backups/training/
```

## 2. Ollama Model Volume Backup

Model weights are large (several GB per model) and change only when you pull or create new models. Back them up periodically, not on every run.

```bash
# Stop inference container to ensure clean copy
docker compose stop inference

# Create a tarball of the volume
docker run --rm \
  -v ollama-models:/data \
  -v /backups:/backup \
  alpine tar czf /backup/ollama-models-$(date +%Y%m%d).tar.gz -C /data .

# Restart inference
docker compose start inference
```

## 3. Automated Backup Schedule

Create a backup script at `/opt/kin/scripts/backup.sh`:

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/backups/kin"
DATE=$(date +%Y%m%d-%H%M%S)
RETAIN_DAYS=14

mkdir -p "${BACKUP_DIR}"

# 1. WAL-safe SQLite backup
echo "[$(date)] Starting SQLite backup..."
docker exec kin-api sqlite3 /app/data/kin.db ".backup /app/data/kin-backup.db"
docker cp kin-api:/app/data/kin-backup.db "${BACKUP_DIR}/kin-${DATE}.db"
docker exec kin-api rm /app/data/kin-backup.db

# 2. Training data backup
echo "[$(date)] Backing up training data..."
docker cp kin-api:/app/data/training/ "${BACKUP_DIR}/training-${DATE}/"

# 3. Cleanup old backups
echo "[$(date)] Cleaning up backups older than ${RETAIN_DAYS} days..."
find "${BACKUP_DIR}" -name "kin-*.db" -mtime +${RETAIN_DAYS} -delete
find "${BACKUP_DIR}" -name "training-*" -type d -mtime +${RETAIN_DAYS} -exec rm -rf {} +

echo "[$(date)] Backup complete: ${BACKUP_DIR}/kin-${DATE}.db"
```

```bash
chmod +x /opt/kin/scripts/backup.sh
```

Add a cron job (runs daily at 3 AM):

```bash
sudo crontab -e
```

```cron
# KIN daily backup — WAL-safe SQLite + training data
0 3 * * * /opt/kin/scripts/backup.sh >> /var/log/kin-backup.log 2>&1

# KIN weekly model backup — Ollama weights (Sunday 4 AM)
0 4 * * 0 docker run --rm -v ollama-models:/data -v /backups/kin:/backup alpine tar czf /backup/ollama-models-$(date +\%Y\%m\%d).tar.gz -C /data . >> /var/log/kin-backup.log 2>&1
```

## 4. Off-Site Copy

After local backup, push to a remote destination:

```bash
# rsync to a remote server
rsync -avz /backups/kin/ user@backup-server:/backups/kin/

# rclone to S3-compatible storage
rclone sync /backups/kin/ remote:kin-backups/ --transfers=4
```

Add the off-site copy to the cron job, after the backup script runs:

```cron
# Off-site copy (runs 30 min after backup)
30 3 * * * rclone sync /backups/kin/ remote:kin-backups/ >> /var/log/kin-backup.log 2>&1
```

## 5. Restore Procedure

### Restore SQLite Database

```bash
# Stop the API container
docker compose stop api

# Copy backup into the volume
docker cp /backups/kin/kin-20250401.db kin-api:/app/data/kin.db

# Start the API container
docker compose start api

# Verify health
curl -s http://localhost:3002/health
```

### Restore Ollama Models

```bash
# Stop inference container
docker compose stop inference

# Restore from tarball
docker run --rm \
  -v ollama-models:/data \
  -v /backups/kin:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/ollama-models-20250401.tar.gz -C /data"

# Start inference
docker compose start inference
```

### Application-Level Recovery

KIN includes a `RecoveryManager` in `runtime/recovery.ts` for application-level state recovery. This handles edge cases like corrupted conversation metadata or stuck error counters — it resets metadata without deleting user data (messages, memories, conversations are never deleted).

The recovery module is used programmatically by the API server. For manual recovery scenarios beyond simple backup restoration, inspect the RecoveryManager's snapshot/restore capabilities:

```typescript
import { RecoveryManager } from './runtime/recovery.js';

const recovery = new RecoveryManager(db);
const snapshot = recovery.createSnapshot('kin-cipher-001', 'user-123');
recovery.restoreFromSnapshot(snapshot.id);
```

## 6. Verification Checklist

```bash
# Verify backup file exists and is non-empty
ls -lh /backups/kin/kin-*.db

# Verify backup integrity (open with sqlite3)
sqlite3 /backups/kin/kin-latest.db "PRAGMA integrity_check;"

# Verify training data backup
ls /backups/kin/training-*/

# Check cron job is scheduled
sudo crontab -l | grep kin

# Test restore in a temporary container (non-destructive)
docker run --rm -v /backups/kin:/data alpine sqlite3 /data/kin-latest.db "SELECT count(*) FROM users;"
```
