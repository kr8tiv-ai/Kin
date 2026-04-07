-- KIN Platform Database Schema
-- Version: 1.0.0
-- Description: Core database schema for KIN AI companion platform

-- ============================================================================
-- Users
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_id BIGINT UNIQUE,            -- nullable: only set for Telegram users
  email TEXT UNIQUE,                     -- nullable: set for email/Google users
  google_id TEXT UNIQUE,                 -- nullable: set for Google OAuth users
  wallet_address TEXT UNIQUE,            -- nullable: set for Solana wallet users
  x_id TEXT UNIQUE,                      -- nullable: set for X (Twitter) OAuth users
  password_hash TEXT,                    -- nullable: set for email/password users (scrypt)
  auth_provider TEXT NOT NULL DEFAULT 'telegram', -- 'telegram', 'google', 'solana', 'email', 'x' or comma-separated
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'hatchling', 'elder', 'hero')),
  stripe_customer_id TEXT,
  free_until TEXT, -- ISO date: user has free access until this date (referral rewards, Genesis mint)
  genesis_tier TEXT, -- 'egg', 'hatchling', 'elder' — set if user holds a Genesis NFT
  genesis_discount INTEGER NOT NULL DEFAULT 0, -- lifetime discount percentage (25 for Genesis holders)
  metadata TEXT -- JSON blob for additional user data
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_x_id ON users(x_id);
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
-- User Preferences (persistent across sessions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,               -- What Cipher calls them
  experience_level TEXT DEFAULT 'beginner' CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  goals TEXT,                      -- JSON array of goals
  language TEXT DEFAULT 'en',      -- ISO 639-1 language code
  tone TEXT DEFAULT 'friendly' CHECK (tone IN ('friendly', 'professional', 'casual', 'technical')),
  privacy_mode TEXT DEFAULT 'private' CHECK (privacy_mode IN ('private', 'shared')),
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  setup_wizard_complete BOOLEAN NOT NULL DEFAULT FALSE,
  deployment_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

-- ============================================================================
-- Website Projects
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL REFERENCES companions(id),
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT NOT NULL DEFAULT 'website' CHECK (project_type IN ('website', 'landing_page', 'portfolio', 'blog', 'other')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'preview', 'deployed', 'archived')),
  files TEXT,                      -- JSON blob of generated files
  preview_url TEXT,
  deploy_url TEXT,
  deploy_provider TEXT CHECK (deploy_provider IN ('vercel', 'netlify', 'cloudflare')),
  deploy_config TEXT,              -- JSON blob of deploy settings
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ============================================================================
-- Progress Tracking (streaks, milestones)
-- ============================================================================

CREATE TABLE IF NOT EXISTS progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  total_messages INTEGER NOT NULL DEFAULT 0,
  total_projects INTEGER NOT NULL DEFAULT 0,
  total_voice_notes INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,           -- YYYY-MM-DD format for streak calc
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  badges TEXT,                     -- JSON array of earned badges
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id);

-- ============================================================================
-- Billing / Subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'hatchling', 'elder', 'hero')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  current_period_start INTEGER,
  current_period_end INTEGER,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- ============================================================================
-- Referrals
-- ============================================================================

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);

-- ============================================================================
-- Companion Customizations
-- ============================================================================

CREATE TABLE IF NOT EXISTS companion_customizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  custom_name TEXT,                -- User's nickname for the companion
  tone_override TEXT CHECK (tone_override IN ('friendly', 'professional', 'casual', 'technical')),
  personality_notes TEXT,          -- Freeform personality adjustments
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(user_id, companion_id)
);

CREATE INDEX IF NOT EXISTS idx_companion_custom_user ON companion_customizations(user_id);

-- ============================================================================
-- Trigger for updated_at
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS update_timestamp
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
END;

-- ============================================================================
-- Skills Marketplace
-- ============================================================================

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','productivity','creative','developer',
                        'marketing','analytics','lifestyle','custom')),
  author TEXT NOT NULL DEFAULT 'kin',
  source_type TEXT NOT NULL DEFAULT 'builtin'
    CHECK (source_type IN ('builtin','companion','custom')),
  github_repo_url TEXT,
  triggers TEXT NOT NULL DEFAULT '[]',
  config TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  install_count INTEGER NOT NULL DEFAULT 0,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source_type);

CREATE TABLE IF NOT EXISTS user_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  companion_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  installed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  UNIQUE(user_id, skill_id, companion_id)
);

CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id);

CREATE TABLE IF NOT EXISTS skill_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo_url TEXT NOT NULL,
  repo_owner TEXT,
  repo_name TEXT,
  skill_name TEXT,
  skill_description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','payment_required','paid',
                      'reviewing','approved','installed','rejected')),
  rejection_reason TEXT,
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 499,
  skill_id TEXT REFERENCES skills(id),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

CREATE INDEX IF NOT EXISTS idx_skill_requests_user ON skill_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_requests_status ON skill_requests(status);

-- Seed built-in skills
INSERT OR IGNORE INTO skills (id, name, display_name, description, category, source_type, triggers, is_approved) VALUES
  ('skill-calculator', 'calculator', 'Calculator', 'Safe math evaluation — supports arithmetic, parentheses, and exponents', 'productivity', 'builtin', '["calculate","compute","math","\\d+\\s*[+\\-*/^]\\s*\\d+"]', TRUE),
  ('skill-weather', 'weather', 'Weather', 'Real-time weather and forecasts from any city worldwide', 'lifestyle', 'builtin', '["weather","forecast","temperature"]', TRUE),
  ('skill-reminder', 'reminder', 'Reminders', 'Set timed reminders with natural language — "remind me in 5 minutes to..."', 'productivity', 'builtin', '["remind me","set reminder","reminders"]', TRUE),
  ('skill-web-search', 'web-search', 'Web Search', 'Search the web for current information powered by Tavily', 'general', 'builtin', '["search\\\\s+","look\\\\s*up","google","find\\\\s+info"]', TRUE),
  ('skill-code-gen', 'code-gen', 'Code Generation', 'Generate, review, and debug code — exclusive to Cipher', 'developer', 'companion', '["generate code","write.*function","review.*code"]', TRUE),
  ('skill-social-content', 'social-content', 'Social Content', 'Create social media posts and brand content — exclusive to Mischief', 'marketing', 'companion', '["create.*post","social.*media","brand.*content"]', TRUE),
  ('skill-data-analysis', 'data-analysis', 'Data Analysis', 'Analyze data, market research, and trends — exclusive to Vortex', 'analytics', 'companion', '["analyze.*data","market.*research","trend"]', TRUE),
  ('skill-architecture-review', 'architecture-review', 'Architecture Review', 'System design and code review — exclusive to Forge', 'developer', 'companion', '["architecture","system.*design","code.*review"]', TRUE),
  ('skill-creative-writing', 'creative-writing', 'Creative Writing', 'Stories, worldbuilding, and prose editing — exclusive to Aether', 'creative', 'companion', '["write.*story","creative.*writing","worldbuild"]', TRUE),
  ('skill-habit-coaching', 'habit-coaching', 'Habit Coaching', 'Goal setting, habit tracking, and accountability — exclusive to Catalyst', 'lifestyle', 'companion', '["habit","goal.*setting","routine","accountability"]', TRUE);

-- ============================================================================
-- Heartbeat & Offline Detection
-- ============================================================================

CREATE TABLE IF NOT EXISTS heartbeats (
  id TEXT PRIMARY KEY,
  kin_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at INTEGER NOT NULL,
  ip_address TEXT,
  services TEXT NOT NULL DEFAULT '{}',
  ollama_model TEXT,
  system_info TEXT,
  version TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_user ON heartbeats(user_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_last_seen ON heartbeats(last_seen_at);

CREATE TABLE IF NOT EXISTS recovery_snapshots (
  id TEXT PRIMARY KEY,
  kin_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('auto','manual','pre_recovery')),
  conversation_count INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  memory_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','restoring','restored','corrupt')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_snapshots(user_id);

-- ============================================================================
-- Support Chat (AI-powered customer service)
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','escalated','resolved')),
  escalated_at INTEGER,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','agent')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

CREATE INDEX IF NOT EXISTS idx_support_chats_user ON support_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_chat ON support_messages(chat_id);

-- Seeded FAQ entries for the AI support bot
CREATE TABLE IF NOT EXISTS support_faq (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

-- Seed FAQ entries
INSERT OR IGNORE INTO support_faq (id, question, answer, category) VALUES
  ('faq-1', 'What is KIN?', 'KIN is an AI companion platform. Each KIN is a unique AI personality powered by frontier models that learns and grows with you. Your KIN lives on the Solana blockchain as an NFT, making it truly yours.', 'general'),
  ('faq-2', 'How do I get started?', 'Sign up, complete onboarding, and claim your first companion. Free tier includes 1 companion with 50 messages per day. Upgrade to Pro for unlimited messages and up to 3 companions.', 'getting-started'),
  ('faq-3', 'What companions are available?', 'There are 6 companions: Cipher (code), Mischief (social media), Vortex (data analysis), Forge (architecture), Aether (creative writing), and Catalyst (habit coaching). Each is powered by a different frontier AI model.', 'companions'),
  ('faq-4', 'How does the NFT work?', 'Each companion is minted as a Solana NFT. Your companion''s skills, personality, and experience are linked to the NFT. When you sell the NFT, the skills transfer with it but your private memories stay with you.', 'nft'),
  ('faq-5', 'What is the free tier?', 'Free tier includes 1 companion, 50 messages per day, basic web builder, and community support. All powered by Groq Qwen 3 32B at zero cost.', 'pricing'),
  ('faq-6', 'How do skills work?', 'Skills are add-on capabilities for your companions. Built-in skills include calculator, weather, reminders, and web search. You can also request custom skills from GitHub repos for a $4.99 review fee.', 'skills'),
  ('faq-7', 'Can I use KIN on Telegram?', 'Yes! KIN works on Telegram, Discord, WhatsApp, and the web dashboard. Your conversations and memories sync across all platforms.', 'platforms'),
  ('faq-8', 'What happens if my local KIN goes offline?', 'The system automatically detects offline status via heartbeat monitoring. Your KIN falls back to cloud providers (Groq free tier → paid frontier models). All your data is preserved and will sync when you come back online.', 'reliability'),
  ('faq-9', 'How do I cancel my subscription?', 'Go to Dashboard → Billing → Manage Subscription. You can cancel anytime and will retain access until the end of your billing period.', 'billing'),
  ('faq-10', 'Is my data private?', 'Yes. Your conversations and memories are encrypted and stored securely. When a companion NFT is transferred, only the companion''s skills and personality transfer — your private memories stay with you.', 'privacy');

-- ============================================================================
-- Companion Skill Accrual (NFT-portable skills)
-- ============================================================================

-- Tracks skills that a specific companion instance has accrued
CREATE TABLE IF NOT EXISTS companion_skills (
  id TEXT PRIMARY KEY,
  companion_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  skill_level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  xp_to_next_level INTEGER NOT NULL DEFAULT 100,
  is_portable BOOLEAN NOT NULL DEFAULT TRUE,
  accrued_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  last_used_at INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(companion_id, user_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_companion_skills_companion ON companion_skills(companion_id);
CREATE INDEX IF NOT EXISTS idx_companion_skills_user ON companion_skills(user_id);

-- Companion personality snapshots (IPFS-ready, encrypted)
-- Stores a hash of the companion's personality/skill state for blockchain anchoring
CREATE TABLE IF NOT EXISTS companion_snapshots (
  id TEXT PRIMARY KEY,
  companion_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nft_mint_address TEXT,
  snapshot_type TEXT NOT NULL DEFAULT 'skill_state'
    CHECK (snapshot_type IN ('skill_state','personality','full','transfer')),
  -- Content hash (SHA-256) for integrity verification
  content_hash TEXT NOT NULL,
  -- Encrypted payload (JSON) — only skills/personality, never private memories
  encrypted_payload TEXT,
  -- IPFS CID if pinned
  ipfs_cid TEXT,
  -- Solana transaction signature if anchored on-chain
  solana_tx_sig TEXT,
  is_on_chain BOOLEAN NOT NULL DEFAULT FALSE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

CREATE INDEX IF NOT EXISTS idx_companion_snapshots_nft ON companion_snapshots(nft_mint_address);

-- Transfer log: tracks skill portability on NFT sale
CREATE TABLE IF NOT EXISTS nft_transfers (
  id TEXT PRIMARY KEY,
  nft_mint_address TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT,
  skills_transferred TEXT NOT NULL DEFAULT '[]', -- JSON array of skill IDs + levels
  snapshot_id TEXT REFERENCES companion_snapshots(id),
  transfer_tx_sig TEXT, -- Solana transfer transaction signature
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

CREATE INDEX IF NOT EXISTS idx_nft_transfers_mint ON nft_transfers(nft_mint_address);

-- ============================================================================
-- NFT Rebindings — secondary-market companion re-onboarding
-- ============================================================================

CREATE TABLE IF NOT EXISTS nft_rebindings (
  id TEXT PRIMARY KEY,
  nft_mint_address TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','processing','pending_onboarding','complete','failed')),
  stripe_session_id TEXT,
  snapshot_id TEXT REFERENCES companion_snapshots(id),
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_nft_rebindings_mint ON nft_rebindings(nft_mint_address);

-- ============================================================================
-- Companion Souls (user-authored personality configs with drift detection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS companion_souls (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL,
  custom_name TEXT,
  traits TEXT NOT NULL DEFAULT '{}',
  soul_values TEXT NOT NULL DEFAULT '[]',
  style TEXT NOT NULL DEFAULT '{}',
  custom_instructions TEXT DEFAULT '',
  boundaries TEXT NOT NULL DEFAULT '[]',
  anti_patterns TEXT NOT NULL DEFAULT '[]',
  soul_hash TEXT,
  drift_score REAL NOT NULL DEFAULT 1.0,
  last_calibrated_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  UNIQUE(user_id, companion_id)
);

CREATE INDEX IF NOT EXISTS idx_companion_souls_user ON companion_souls(user_id);
CREATE INDEX IF NOT EXISTS idx_companion_souls_companion ON companion_souls(companion_id);

-- ============================================================================
-- OAuth Tokens (encrypted, per-user, per-provider)
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                  -- e.g. 'gmail'
  encrypted_refresh_token TEXT NOT NULL,   -- AES-256-GCM ciphertext
  encrypted_access_token TEXT,             -- AES-256-GCM ciphertext (nullable, short-lived)
  token_expiry INTEGER,                    -- epoch ms when access token expires
  scopes TEXT NOT NULL,                    -- space-separated OAuth scopes
  email TEXT,                              -- provider account email
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON oauth_tokens(provider);

-- ============================================================================
-- Safe Migrations — add columns to existing tables without breaking anything.
-- Each ALTER TABLE is wrapped in a sub-statement; SQLite silently ignores
-- "duplicate column name" errors when using CREATE TABLE IF NOT EXISTS but
-- ALTER TABLE doesn't have IF NOT EXISTS. We catch errors at the app level.
-- ============================================================================

-- Users: referral free days, Genesis NFT fields
-- Note: these may already exist from CREATE TABLE; ALTER TABLE will error
-- harmlessly if so. The app wraps schema execution in try/catch.

-- Migration 1: free_until for referral rewards
-- ALTER TABLE users ADD COLUMN free_until TEXT;

-- Migration 2: Genesis NFT tracking
-- ALTER TABLE users ADD COLUMN genesis_tier TEXT;
-- ALTER TABLE users ADD COLUMN genesis_discount INTEGER NOT NULL DEFAULT 0;

-- Migration 3: Privacy mode for training data pipeline
-- ALTER TABLE user_preferences ADD COLUMN privacy_mode TEXT DEFAULT 'private' CHECK (privacy_mode IN ('private', 'shared'));

-- ============================================================================
-- Training Data Curation (builder review of SFT training pairs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS training_curation (
  id TEXT PRIMARY KEY,
  entry_hash TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  verdict TEXT NOT NULL DEFAULT 'pending' CHECK (verdict IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(entry_hash)
);

CREATE INDEX IF NOT EXISTS idx_training_curation_companion ON training_curation(companion_id);
CREATE INDEX IF NOT EXISTS idx_training_curation_hash ON training_curation(entry_hash);

-- ============================================================================
-- DM Security — Pairing Codes & Channel Allowlists
-- ============================================================================

CREATE TABLE IF NOT EXISTS dm_allowlist (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'whatsapp', 'discord')),
  sender_id TEXT NOT NULL,
  display_name TEXT,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(channel, sender_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_allowlist_channel ON dm_allowlist(channel);
CREATE INDEX IF NOT EXISTS idx_dm_allowlist_sender ON dm_allowlist(sender_id);

CREATE TABLE IF NOT EXISTS pairing_codes (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'whatsapp', 'discord')),
  sender_id TEXT NOT NULL,
  display_name TEXT,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pairing_codes_channel ON pairing_codes(channel);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_sender ON pairing_codes(sender_id);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_status ON pairing_codes(status);

-- ---------------------------------------------------------------------------
-- Scheduled Jobs — persistent cron-based job scheduling
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL REFERENCES companions(id),
  skill_name TEXT NOT NULL,
  skill_args TEXT NOT NULL DEFAULT '{}',
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  delivery_channel TEXT NOT NULL CHECK (delivery_channel IN ('telegram', 'whatsapp', 'discord', 'api')),
  delivery_recipient_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
  last_run_at INTEGER,
  next_run_at INTEGER,
  run_count INTEGER NOT NULL DEFAULT 0,
  max_runs INTEGER,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_user ON scheduled_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON scheduled_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at);

-- ---------------------------------------------------------------------------
-- Webhook Triggers — external HTTP triggers for skill execution
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS webhook_triggers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL REFERENCES companions(id),
  skill_name TEXT NOT NULL,
  skill_args TEXT NOT NULL DEFAULT '{}',
  hmac_secret TEXT NOT NULL,
  delivery_channel TEXT NOT NULL CHECK (delivery_channel IN ('telegram', 'whatsapp', 'discord', 'api')),
  delivery_recipient_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at INTEGER,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_webhook_triggers_user ON webhook_triggers(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_active ON webhook_triggers(is_active);

-- ---------------------------------------------------------------------------
-- Workflow Pipelines — multi-step skill composition
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflow_pipelines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL REFERENCES companions(id),
  name TEXT NOT NULL,
  description TEXT,
  steps TEXT NOT NULL DEFAULT '[]',        -- JSON array of { skillName, skillArgs?, label? }
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'cron')),
  cron_expression TEXT,                    -- nullable: only set for cron-triggered pipelines
  timezone TEXT NOT NULL DEFAULT 'UTC',
  delivery_channel TEXT NOT NULL CHECK (delivery_channel IN ('telegram', 'whatsapp', 'discord', 'api')),
  delivery_recipient_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  last_run_at INTEGER,
  run_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_workflow_pipelines_user ON workflow_pipelines(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_pipelines_status ON workflow_pipelines(status);

-- ---------------------------------------------------------------------------
-- Pipeline Runs — execution history for workflow pipelines
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL REFERENCES workflow_pipelines(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  steps_completed INTEGER NOT NULL DEFAULT 0,
  steps_total INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  final_output TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline ON pipeline_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);

-- ---------------------------------------------------------------------------
-- Pipeline Step Results — per-step execution records within a run
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pipeline_step_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  skill_name TEXT NOT NULL,
  input_message TEXT NOT NULL,
  output_content TEXT,
  output_type TEXT,
  output_metadata TEXT,                    -- JSON blob
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  duration_ms INTEGER,
  error TEXT,
  UNIQUE(run_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_step_results_run ON pipeline_step_results(run_id);

-- ---------------------------------------------------------------------------
-- Exec Approvals — user confirmation gate for external mutations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS exec_approvals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  intent TEXT,                             -- nullable: not all skills use intents
  payload TEXT NOT NULL,                   -- JSON: serialized skill context for deferred execution
  delivery_channel TEXT NOT NULL,
  delivery_recipient_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  resolved_at INTEGER,                     -- nullable: set when approved/rejected/expired
  resolved_by TEXT                         -- nullable: 'user' or 'system' (for expiry)
);

CREATE INDEX IF NOT EXISTS idx_exec_approvals_user_status ON exec_approvals(user_id, status);

-- ============================================================================
-- Revenue Reports — periodic revenue aggregation for Genesis surplus sharing
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_reports (
  id TEXT PRIMARY KEY,
  period_start INTEGER NOT NULL,           -- epoch ms
  period_end INTEGER NOT NULL,             -- epoch ms
  subscription_revenue INTEGER NOT NULL DEFAULT 0,  -- cents
  mint_revenue INTEGER NOT NULL DEFAULT 0,          -- cents
  rebinding_revenue INTEGER NOT NULL DEFAULT 0,     -- cents
  total_revenue INTEGER NOT NULL DEFAULT 0,         -- cents
  surplus_allocated INTEGER NOT NULL DEFAULT 0,     -- cents
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'distributed', 'archived')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(period_start, period_end)
);

-- ============================================================================
-- Revenue Distributions — per-holder surplus allocation from a report
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_distributions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES revenue_reports(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  genesis_tier TEXT NOT NULL,
  reward_percent REAL NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,       -- cents
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_revenue_distributions_report ON revenue_distributions(report_id);
CREATE INDEX IF NOT EXISTS idx_revenue_distributions_user ON revenue_distributions(user_id);

-- ============================================================================
-- KIN Credits — provider CLI/API credential storage per user
-- ============================================================================

CREATE TABLE IF NOT EXISTS kin_credits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,               -- FrontierProviderId (e.g. 'openai', 'anthropic', 'openrouter')
  credential_type TEXT NOT NULL CHECK (credential_type IN ('cli', 'api')),
  encrypted_credential TEXT NOT NULL,      -- AES-256-GCM ciphertext (iv:authTag:data)
  plan_tier TEXT,                          -- e.g. 'pro', 'team', 'enterprise'
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  provisioned_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  expires_at INTEGER,
  last_used_at INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, provider_id, credential_type)
);

CREATE INDEX IF NOT EXISTS idx_kin_credits_user ON kin_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_kin_credits_provider ON kin_credits(provider_id);
CREATE INDEX IF NOT EXISTS idx_kin_credits_status ON kin_credits(status);
