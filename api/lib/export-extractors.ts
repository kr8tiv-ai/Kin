/**
 * Export Data Extractors — Pure functions for all archive categories
 *
 * Each extractor takes a better-sqlite3 Database instance and userId,
 * returns typed JSON-serializable data. Reads snake_case DB columns,
 * outputs camelCase keys (K005). Named exports for testability (K010).
 *
 * @module api/lib/export-extractors
 */

import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type {
  ExportUserProfile,
  ExportCompanion,
  ExportPreferences,
  ExportMemory,
  ExportConversation,
  ExportMessage,
  ExportCustomization,
  ExportSoulConfig,
  ExportCompanionSkill,
  ExportUserSkill,
  ExportProgress,
  ExportTrainingCuration,
  ExportCompanionSnapshot,
  FileArtifactRef,
} from './export-types.js';

// ============================================================================
// Helpers
// ============================================================================

/** Convert epoch-millis integer to ISO string, or null if falsy. */
function toISO(epochMs: number | null | undefined): string {
  if (epochMs == null || epochMs === 0) return new Date(0).toISOString();
  return new Date(epochMs).toISOString();
}

/** Convert epoch-millis to ISO string, returning null if input is null/undefined. */
function toISOOrNull(epochMs: number | null | undefined): string | null {
  if (epochMs == null) return null;
  return new Date(epochMs).toISOString();
}

/** Safely parse a JSON string, returning fallback on failure. */
function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ============================================================================
// Extractors
// ============================================================================

/**
 * Extract user profile. Returns null if user not found.
 */
export function extractUserProfile(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportUserProfile | null {
  const row = db.prepare(`
    SELECT id, telegram_id, email, google_id, wallet_address, x_id,
           auth_provider, username, first_name, last_name, tier,
           stripe_customer_id, free_until, genesis_tier, genesis_discount,
           metadata, created_at, updated_at
    FROM users WHERE id = ?
  `).get(userId) as any;

  if (!row) return null;

  return {
    id: row.id,
    telegramId: row.telegram_id ?? null,
    email: row.email ?? null,
    googleId: row.google_id ?? null,
    walletAddress: row.wallet_address ?? null,
    xId: row.x_id ?? null,
    authProvider: row.auth_provider,
    username: row.username ?? null,
    firstName: row.first_name,
    lastName: row.last_name ?? null,
    tier: row.tier,
    stripeCustomerId: row.stripe_customer_id ?? null,
    freeUntil: row.free_until ?? null,
    genesisTier: row.genesis_tier ?? null,
    genesisDiscount: row.genesis_discount ?? 0,
    metadata: safeJsonParse(row.metadata, null),
    createdAt: toISO(row.created_at),
    updatedAt: toISO(row.updated_at),
  };
}

/**
 * Extract user's companions with companion metadata joined in.
 */
export function extractCompanions(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportCompanion[] {
  const rows = db.prepare(`
    SELECT uc.companion_id, c.name AS companion_name, c.type AS companion_type,
           c.specialization, uc.claimed_at, uc.is_active,
           uc.nft_mint_address, uc.nft_metadata_uri
    FROM user_companions uc
    JOIN companions c ON c.id = uc.companion_id
    WHERE uc.user_id = ?
    ORDER BY uc.claimed_at ASC
  `).all(userId) as any[];

  return rows.map((r) => ({
    companionId: r.companion_id,
    companionName: r.companion_name,
    companionType: r.companion_type,
    specialization: r.specialization,
    claimedAt: toISO(r.claimed_at),
    isActive: Boolean(r.is_active),
    nftMintAddress: r.nft_mint_address ?? null,
    nftMetadataUri: r.nft_metadata_uri ?? null,
  }));
}

/**
 * Extract user preferences. Returns null if none set.
 */
export function extractPreferences(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportPreferences | null {
  const row = db.prepare(`
    SELECT display_name, experience_level, goals, language, tone, privacy_mode,
           onboarding_complete, setup_wizard_complete, deployment_complete,
           created_at, updated_at
    FROM user_preferences WHERE user_id = ?
  `).get(userId) as any;

  if (!row) return null;

  return {
    displayName: row.display_name ?? null,
    experienceLevel: row.experience_level ?? 'beginner',
    goals: safeJsonParse(row.goals, []),
    language: row.language ?? 'en',
    tone: row.tone ?? 'friendly',
    privacyMode: row.privacy_mode ?? 'private',
    onboardingComplete: Boolean(row.onboarding_complete),
    setupWizardComplete: Boolean(row.setup_wizard_complete),
    deploymentComplete: Boolean(row.deployment_complete),
    createdAt: toISO(row.created_at),
    updatedAt: toISO(row.updated_at),
  };
}

/**
 * Extract ALL memories — no cap (fixes 1000-limit bug in current export).
 */
export function extractMemories(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportMemory[] {
  const rows = db.prepare(`
    SELECT id, companion_id, memory_type, content, importance,
           is_transferable, access_count, last_accessed_at, created_at
    FROM memories WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId) as any[];

  return rows.map((r) => ({
    id: r.id,
    companionId: r.companion_id,
    memoryType: r.memory_type,
    content: r.content,
    importance: r.importance,
    isTransferable: Boolean(r.is_transferable),
    accessCount: r.access_count ?? 0,
    lastAccessedAt: toISO(r.last_accessed_at),
    createdAt: toISO(r.created_at),
  }));
}

/**
 * Extract all conversations with their messages nested inside.
 * Fixes the current export which omits messages entirely.
 */
export function extractConversationsWithMessages(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportConversation[] {
  const convRows = db.prepare(`
    SELECT id, companion_id, title, created_at, updated_at
    FROM conversations WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId) as any[];

  // Prepare message query once, execute per conversation
  const msgStmt = db.prepare(`
    SELECT id, role, content, timestamp, tokens_used, model, provider
    FROM messages WHERE conversation_id = ?
    ORDER BY timestamp ASC
  `);

  return convRows.map((c) => {
    const msgRows = msgStmt.all(c.id) as any[];
    const messages: ExportMessage[] = msgRows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: toISO(m.timestamp),
      tokensUsed: m.tokens_used ?? null,
      model: m.model ?? null,
      provider: m.provider ?? null,
    }));

    return {
      id: c.id,
      companionId: c.companion_id,
      title: c.title ?? null,
      createdAt: toISO(c.created_at),
      updatedAt: toISO(c.updated_at),
      messages,
    };
  });
}

/**
 * Extract companion customizations.
 */
export function extractCustomizations(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportCustomization[] {
  const rows = db.prepare(`
    SELECT companion_id, custom_name, tone_override, personality_notes,
           created_at, updated_at
    FROM companion_customizations WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId) as any[];

  return rows.map((r) => ({
    companionId: r.companion_id,
    customName: r.custom_name ?? null,
    toneOverride: r.tone_override ?? null,
    personalityNotes: r.personality_notes ?? null,
    createdAt: toISO(r.created_at),
    updatedAt: toISO(r.updated_at),
  }));
}

/**
 * Extract companion soul configurations.
 */
export function extractSoulConfigs(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportSoulConfig[] {
  const rows = db.prepare(`
    SELECT companion_id, custom_name, traits, soul_values, style,
           custom_instructions, boundaries, anti_patterns, soul_hash,
           drift_score, last_calibrated_at, created_at, updated_at
    FROM companion_souls WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId) as any[];

  return rows.map((r) => ({
    companionId: r.companion_id,
    customName: r.custom_name ?? null,
    traits: safeJsonParse(r.traits, {}),
    soulValues: safeJsonParse(r.soul_values, []),
    style: safeJsonParse(r.style, {}),
    customInstructions: r.custom_instructions ?? '',
    boundaries: safeJsonParse(r.boundaries, []),
    antiPatterns: safeJsonParse(r.anti_patterns, []),
    soulHash: r.soul_hash ?? null,
    driftScore: r.drift_score ?? 1.0,
    lastCalibratedAt: toISOOrNull(r.last_calibrated_at),
    createdAt: toISO(r.created_at),
    updatedAt: toISO(r.updated_at),
  }));
}

/**
 * Extract companion skill accrual (XP, levels, portability).
 */
export function extractCompanionSkills(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportCompanionSkill[] {
  const rows = db.prepare(`
    SELECT companion_id, skill_id, skill_level, xp, xp_to_next_level,
           is_portable, accrued_at, last_used_at, usage_count
    FROM companion_skills WHERE user_id = ?
    ORDER BY accrued_at ASC
  `).all(userId) as any[];

  return rows.map((r) => ({
    companionId: r.companion_id,
    skillId: r.skill_id,
    skillLevel: r.skill_level,
    xp: r.xp,
    xpToNextLevel: r.xp_to_next_level,
    isPortable: Boolean(r.is_portable),
    accruedAt: toISO(r.accrued_at),
    lastUsedAt: toISOOrNull(r.last_used_at),
    usageCount: r.usage_count ?? 0,
  }));
}

/**
 * Extract user-installed skills.
 */
export function extractUserSkills(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportUserSkill[] {
  const rows = db.prepare(`
    SELECT skill_id, companion_id, is_active, installed_at
    FROM user_skills WHERE user_id = ?
    ORDER BY installed_at ASC
  `).all(userId) as any[];

  return rows.map((r) => ({
    skillId: r.skill_id,
    companionId: r.companion_id ?? null,
    isActive: Boolean(r.is_active),
    installedAt: toISO(r.installed_at),
  }));
}

/**
 * Extract user progress (streaks, XP, badges). Returns null if not set.
 */
export function extractProgress(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportProgress | null {
  const row = db.prepare(`
    SELECT current_streak, longest_streak, total_messages, total_projects,
           total_voice_notes, last_active_date, level, xp, badges,
           created_at, updated_at
    FROM progress WHERE user_id = ?
  `).get(userId) as any;

  if (!row) return null;

  return {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    totalMessages: row.total_messages,
    totalProjects: row.total_projects,
    totalVoiceNotes: row.total_voice_notes,
    lastActiveDate: row.last_active_date ?? null,
    level: row.level,
    xp: row.xp,
    badges: safeJsonParse(row.badges, []),
    createdAt: toISO(row.created_at),
    updatedAt: toISO(row.updated_at),
  };
}

/**
 * Extract training curation verdicts.
 */
export function extractTrainingCuration(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportTrainingCuration[] {
  // training_curation doesn't have user_id — it's companion-scoped.
  // We filter by companion IDs that belong to this user.
  const rows = db.prepare(`
    SELECT tc.entry_hash, tc.companion_id, tc.verdict, tc.created_at, tc.updated_at
    FROM training_curation tc
    WHERE tc.companion_id IN (
      SELECT uc.companion_id FROM user_companions uc WHERE uc.user_id = ?
    )
    ORDER BY tc.created_at ASC
  `).all(userId) as any[];

  return rows.map((r) => ({
    entryHash: r.entry_hash,
    companionId: r.companion_id,
    verdict: r.verdict,
    createdAt: toISO(r.created_at),
    updatedAt: toISO(r.updated_at),
  }));
}

/**
 * Extract companion personality snapshots.
 */
export function extractCompanionSnapshots(
  db: InstanceType<typeof Database>,
  userId: string,
): ExportCompanionSnapshot[] {
  const rows = db.prepare(`
    SELECT id, companion_id, nft_mint_address, snapshot_type, content_hash,
           ipfs_cid, solana_tx_sig, is_on_chain, created_at
    FROM companion_snapshots WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId) as any[];

  return rows.map((r) => ({
    id: r.id,
    companionId: r.companion_id,
    nftMintAddress: r.nft_mint_address ?? null,
    snapshotType: r.snapshot_type,
    contentHash: r.content_hash,
    ipfsCid: r.ipfs_cid ?? null,
    solanaTxSig: r.solana_tx_sig ?? null,
    isOnChain: Boolean(r.is_on_chain),
    createdAt: toISO(r.created_at),
  }));
}

// ============================================================================
// File Artifact Discovery
// ============================================================================

export interface FileDiscoveryOptions {
  /** Base directory for training JSONL (default: 'data/training') */
  trainingBasePath?: string;
  /** Base directory for distill JSONL (default: 'data/distill') */
  distillBasePath?: string;
  /** Base directory for Modelfile outputs (default: 'training/output') */
  modelfileBasePath?: string;
}

/**
 * Discover file-based artifacts (training JSONL, distill JSONL, Modelfiles)
 * for all companions owned by the user.
 *
 * Returns FileArtifactRef[] with source paths and archive-relative paths.
 * Only includes files that actually exist on disk.
 */
export function discoverFileArtifacts(
  db: InstanceType<typeof Database>,
  userId: string,
  options: FileDiscoveryOptions = {},
): FileArtifactRef[] {
  const trainingBase = options.trainingBasePath ?? path.join('data', 'training');
  const distillBase = options.distillBasePath ?? path.join('data', 'distill');
  const modelfileBase = options.modelfileBasePath ?? path.join('training', 'output');

  // Get all companion IDs for this user
  const companions = db.prepare(`
    SELECT companion_id FROM user_companions WHERE user_id = ?
  `).all(userId) as Array<{ companion_id: string }>;

  const refs: FileArtifactRef[] = [];

  for (const { companion_id: cid } of companions) {
    // Training JSONL: data/training/{companionId}/training.jsonl
    const trainingPath = path.join(trainingBase, cid, 'training.jsonl');
    addRefIfExists(refs, 'training', cid, `training/${cid}/training.jsonl`, trainingPath);

    // Distill JSONL: data/distill/{companionId}/distill.jsonl
    const distillPath = path.join(distillBase, cid, 'distill.jsonl');
    addRefIfExists(refs, 'distill', cid, `distill/${cid}/distill.jsonl`, distillPath);

    // Modelfile: training/output/{companionId}/Modelfile
    const modelfilePath = path.join(modelfileBase, cid, 'Modelfile');
    addRefIfExists(refs, 'modelfile', cid, `models/${cid}/Modelfile`, modelfilePath);
  }

  return refs;
}

function addRefIfExists(
  refs: FileArtifactRef[],
  category: string,
  companionId: string,
  archivePath: string,
  sourcePath: string,
): void {
  try {
    const stat = fs.statSync(sourcePath);
    refs.push({
      category,
      companionId,
      archivePath,
      sourcePath,
      sizeBytes: stat.size,
    });
  } catch {
    // File doesn't exist — skip silently
  }
}
