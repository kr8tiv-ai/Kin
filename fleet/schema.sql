-- Fleet Control Plane — SQLite Schema
-- Stores fleet instance state for provisioning, lifecycle, and health monitoring.
-- Each row represents a user's KIN deployment (1 instance = 2 containers).

CREATE TABLE IF NOT EXISTS fleet_instances (
  id                TEXT    PRIMARY KEY,
  user_id           TEXT    NOT NULL UNIQUE,
  subdomain         TEXT    NOT NULL UNIQUE,
  status            TEXT    NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'running', 'stopped', 'error', 'removing')),
  api_container_id  TEXT,
  web_container_id  TEXT,
  api_port          INTEGER,
  web_port          INTEGER,
  cpu_shares        INTEGER NOT NULL DEFAULT 256,
  memory_limit_mb   INTEGER NOT NULL DEFAULT 256,
  last_health_check INTEGER,
  last_health_status TEXT   NOT NULL DEFAULT 'unknown'
    CHECK (last_health_status IN ('healthy', 'unhealthy', 'unknown')),
  last_error        TEXT,
  last_activity_at  INTEGER,
  created_at        INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at        INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_fleet_user_id   ON fleet_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_fleet_subdomain ON fleet_instances(subdomain);
CREATE INDEX IF NOT EXISTS idx_fleet_status    ON fleet_instances(status);

-- ---------------------------------------------------------------------------
-- Credit Metering — Balances, usage logs, and internal proxy tokens
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS credit_balances (
  user_id     TEXT    PRIMARY KEY,
  balance_usd REAL    NOT NULL DEFAULT 0.0,
  tier        TEXT    NOT NULL DEFAULT 'free',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_usage_logs (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL,
  instance_id   TEXT,
  companion_id  TEXT    NOT NULL,
  provider_id   TEXT    NOT NULL,
  model_id      TEXT    NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      REAL    NOT NULL,
  balance_after REAL    NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_user_id    ON credit_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON credit_usage_logs(created_at);

CREATE TABLE IF NOT EXISTS proxy_tokens (
  token       TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  instance_id TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proxy_tokens_user     ON proxy_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_proxy_tokens_instance ON proxy_tokens(instance_id);
