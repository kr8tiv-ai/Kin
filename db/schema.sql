-- KIN Platform Database Schema
-- Version: 1.0.0
-- Description: Core database schema for KIN AI companion platform

-- ============================================================================
-- Users
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  stripe_customer_id TEXT,
  metadata TEXT -- JSON blob for additional user data
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

-- ============================================================================
-- Companions (Kin)
-- ============================================================================

CREATE TABLE IF NOT EXISTS companions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'code_kraken', 'glitch_pup', 'teal_dragon', etc.
  specialization TEXT NOT NULL,
  personality_prompt TEXT NOT NULL,
  voice_config TEXT, -- JSON blob for TTS settings
  visual_config TEXT, -- JSON blob for avatar/appearance
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Insert Genesis Six companions
INSERT OR IGNORE INTO companions (id, name, type, specialization, personality_prompt) VALUES
  ('cipher', 'Cipher', 'code_kraken', 'web_design', 'Design-obsessed, playful, sharp frontend architect. Creative technologist who builds exceptional websites while teaching design.'),
  ('mischief', 'Mischief', 'glitch_pup', 'family_companion', 'Playful family companion and personal-brand whisperer. Helps with daily life and personal branding.'),
  ('vortex', 'Vortex', 'teal_dragon', 'marketing', '24/7 CMO for social media and content. Strategic, creative, always-on marketing companion.'),
  ('forge', 'Forge', 'cyber_unicorn', 'development', 'Developer friend for code and debugging. Technical mentor and pair programming partner.'),
  ('aether', 'Aether', 'frost_ape', 'creative', 'Creative muse for writing and storytelling. Inspires artistic expression and narrative craft.'),
  ('catalyst', 'Catalyst', 'cosmic_blob', 'wealth', 'Wealth coach for habits and investments. Financial wisdom and life optimization guide.');

-- ============================================================================
-- User Companion Ownership
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_companions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  claimed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  nft_mint_address TEXT, -- Solana NFT mint address if tokenized
  nft_metadata_uri TEXT,
  UNIQUE(user_id, companion_id)
);

CREATE INDEX IF NOT EXISTS idx_user_companions_user ON user_companions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companions_companion ON user_companions(companion_id);

-- ============================================================================
-- Conversations
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  title TEXT,
  metadata TEXT -- JSON blob for conversation settings
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_companion ON conversations(companion_id);

-- ============================================================================
-- Messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  tokens_used INTEGER,
  model TEXT,
  provider TEXT CHECK (provider IN ('local', 'openai', 'anthropic')),
  metadata TEXT -- JSON blob for additional message data
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

-- ============================================================================
-- Kin Status Records (matches schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kin_status_records (
  id TEXT PRIMARY KEY, -- ksr-{timestamp}-{random}
  kin_id TEXT NOT NULL,
  companion_id TEXT NOT NULL REFERENCES companions(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'idle', 'offline', 'maintenance')),
  last_active_at INTEGER NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  session_duration_seconds INTEGER NOT NULL DEFAULT 0,
  drift_score REAL NOT NULL DEFAULT 0.0,
  health_score REAL NOT NULL DEFAULT 1.0,
  specialization_alignment REAL NOT NULL DEFAULT 1.0,
  current_task TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  metadata TEXT, -- JSON blob for additional status data
  recorded_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  schema_family TEXT NOT NULL DEFAULT 'kin_status_record'
);

CREATE INDEX IF NOT EXISTS idx_kin_status_kin ON kin_status_records(kin_id);
CREATE INDEX IF NOT EXISTS idx_kin_status_companion ON kin_status_records(companion_id);
CREATE INDEX IF NOT EXISTS idx_kin_status_recorded ON kin_status_records(recorded_at);

-- ============================================================================
-- NFT Ownership
-- ============================================================================

CREATE TABLE IF NOT EXISTS nft_ownership (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  mint_address TEXT NOT NULL UNIQUE,
  owner_wallet TEXT NOT NULL,
  token_account TEXT,
  acquired_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  transfer_count INTEGER NOT NULL DEFAULT 0,
  metadata_uri TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_nft_ownership_user ON nft_ownership(user_id);
CREATE INDEX IF NOT EXISTS idx_nft_ownership_wallet ON nft_ownership(owner_wallet);

-- ============================================================================
-- Memory
-- ============================================================================

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('personal', 'preference', 'context', 'event')),
  content TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
  is_transferable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  last_accessed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  access_count INTEGER NOT NULL DEFAULT 0,
  embedding BLOB, -- Vector embedding for semantic search
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_companion ON memories(companion_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);

-- ============================================================================
-- Sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  expires_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  ip_address TEXT,
  user_agent TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

-- ============================================================================
-- Feature Requests (Support Infrastructure)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'planned', 'in_progress', 'completed', 'rejected')),
  votes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_votes ON feature_requests(votes DESC);

CREATE TABLE IF NOT EXISTS feature_votes (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(feature_id, user_id)
);

-- ============================================================================
-- Support Tickets
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT REFERENCES companions(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  resolved_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- ============================================================================
-- Trigger for updated_at
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS update_timestamp
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
END;
