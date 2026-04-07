/**
 * Archive Importer — Per-category import functions + orchestrator
 *
 * Each importer is a pure function: (db, userId, data) → ImportCategoryResult.
 * The orchestrator wraps all importers in a single SQLite transaction with
 * per-category error isolation. FK dependency order is enforced.
 *
 * Conventions:
 * - Tables with UNIQUE constraints use INSERT OR REPLACE (idempotent)
 * - Tables without natural dedup (conversations, messages, memories, snapshots)
 *   use DELETE existing + INSERT (clean re-import)
 * - All imported records get new UUIDs via crypto.randomUUID()
 * - Timestamps in export data are ISO strings; stored as epoch-ms integers
 *
 * @module api/lib/archive-importer
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type {
  ArchiveCategoryData,
  ExportUserProfile,
  ExportCompanion,
  ExportPreferences,
  ExportConversation,
  ExportMemory,
  ExportCustomization,
  ExportSoulConfig,
  ExportCompanionSkill,
  ExportUserSkill,
  ExportProgress,
  ExportTrainingCuration,
  ExportCompanionSnapshot,
} from './export-types.js';
import type { ImportCategoryResult, ImportResult } from './import-types.js';

// ============================================================================
// Helpers
// ============================================================================

/** Convert ISO string to epoch-ms integer. Returns Date.now() on invalid input. */
function toEpochMs(isoString: string | null | undefined): number {
  if (isoString == null) return Date.now();
  const ms = new Date(isoString).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

/** Convert ISO string to epoch-ms, returning null if input is null/undefined. */
function toEpochMsOrNull(isoString: string | null | undefined): number | null {
  if (isoString == null) return null;
  const ms = new Date(isoString).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Check if a companion_id exists in the companions table. */
function companionExists(
  db: InstanceType<typeof Database>,
  companionId: string,
): boolean {
  const row = db.prepare('SELECT 1 FROM companions WHERE id = ?').get(companionId);
  return row != null;
}

/** Check if a skill_id exists in the skills table. */
function skillExists(
  db: InstanceType<typeof Database>,
  skillId: string,
): boolean {
  const row = db.prepare('SELECT 1 FROM skills WHERE id = ?').get(skillId);
  return row != null;
}

/** Safely serialize a value to JSON string. */
function toJson(val: unknown): string {
  if (val == null) return 'null';
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

// ============================================================================
// Per-Category Importers
// ============================================================================

/**
 * Import user profile — UPDATE existing user row.
 * Does not create users; the target user must already exist.
 */
export function importUserProfile(
  db: InstanceType<typeof Database>,
  userId: string,
  profile: ExportUserProfile | null,
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'userProfile',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (profile == null) return result;

  try {
    if (!profile.firstName) {
      result.skipped++;
      result.errors.push('userProfile: missing required field firstName');
      return result;
    }

    db.prepare(`
      UPDATE users SET
        email = ?, google_id = ?, wallet_address = ?, x_id = ?,
        auth_provider = ?, username = ?, first_name = ?, last_name = ?,
        tier = ?, stripe_customer_id = ?, free_until = ?,
        genesis_tier = ?, genesis_discount = ?, metadata = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      profile.email ?? null,
      profile.googleId ?? null,
      profile.walletAddress ?? null,
      profile.xId ?? null,
      profile.authProvider ?? 'email',
      profile.username ?? null,
      profile.firstName,
      profile.lastName ?? null,
      profile.tier ?? 'free',
      profile.stripeCustomerId ?? null,
      profile.freeUntil ?? null,
      profile.genesisTier ?? null,
      profile.genesisDiscount ?? 0,
      toJson(profile.metadata),
      Date.now(),
      userId,
    );
    result.imported = 1;
  } catch (err: any) {
    result.skipped = 1;
    result.errors.push(`userProfile: ${err.message}`);
  }

  return result;
}

/**
 * Import companions — INSERT OR REPLACE into user_companions.
 * Validates companion_id exists in the companions table (seeded data).
 */
export function importCompanions(
  db: InstanceType<typeof Database>,
  userId: string,
  companions: ExportCompanion[],
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'companions',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (!companions || companions.length === 0) return result;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO user_companions
      (id, user_id, companion_id, claimed_at, is_active, nft_mint_address, nft_metadata_uri)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of companions) {
    try {
      if (!c.companionId) {
        result.skipped++;
        result.errors.push('companions: missing required field companionId');
        continue;
      }
      if (!companionExists(db, c.companionId)) {
        result.skipped++;
        result.errors.push(`companions: companion '${c.companionId}' not found in companions table`);
        continue;
      }

      stmt.run(
        randomUUID(),
        userId,
        c.companionId,
        toEpochMs(c.claimedAt),
        c.isActive ? 1 : 0,
        c.nftMintAddress ?? null,
        c.nftMetadataUri ?? null,
      );
      result.imported++;
    } catch (err: any) {
      result.skipped++;
      result.errors.push(`companions[${c.companionId}]: ${err.message}`);
    }
  }

  return result;
}

/**
 * Import preferences — INSERT OR REPLACE on UNIQUE(user_id).
 */
export function importPreferences(
  db: InstanceType<typeof Database>,
  userId: string,
  prefs: ExportPreferences | null,
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'preferences',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (prefs == null) return result;

  try {
    db.prepare(`
      INSERT OR REPLACE INTO user_preferences
        (id, user_id, display_name, experience_level, goals, language, tone,
         privacy_mode, onboarding_complete, setup_wizard_complete, deployment_complete,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      userId,
      prefs.displayName ?? null,
      prefs.experienceLevel ?? 'beginner',
      toJson(prefs.goals),
      prefs.language ?? 'en',
      prefs.tone ?? 'friendly',
      prefs.privacyMode ?? 'private',
      prefs.onboardingComplete ? 1 : 0,
      prefs.setupWizardComplete ? 1 : 0,
      prefs.deploymentComplete ? 1 : 0,
      toEpochMs(prefs.createdAt),
      toEpochMs(prefs.updatedAt),
    );
    result.imported = 1;
  } catch (err: any) {
    result.skipped = 1;
    result.errors.push(`preferences: ${err.message}`);
  }

  return result;
}

/**
 * Import conversations — DELETE existing user conversations + INSERT with new UUIDs.
 * Returns a map of oldId → newId for message FK remapping.
 */
export function importConversations(
  db: InstanceType<typeof Database>,
  userId: string,
  convos: ExportConversation[],
): { result: ImportCategoryResult; conversationIdMap: Map<string, string> } {
  const result: ImportCategoryResult = {
    category: 'conversations',
    imported: 0,
    skipped: 0,
    errors: [],
  };
  const conversationIdMap = new Map<string, string>();

  // Delete existing conversations (cascades to messages via FK)
  db.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)').run(userId);
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);

  if (!convos || convos.length === 0) return { result, conversationIdMap };

  const convoStmt = db.prepare(`
    INSERT INTO conversations (id, user_id, companion_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const c of convos) {
    try {
      if (!c.companionId) {
        result.skipped++;
        result.errors.push(`conversations[${c.id}]: missing required field companionId`);
        continue;
      }
      if (!companionExists(db, c.companionId)) {
        result.skipped++;
        result.errors.push(`conversations[${c.id}]: companion '${c.companionId}' not found`);
        continue;
      }

      const newId = randomUUID();
      conversationIdMap.set(c.id, newId);

      convoStmt.run(
        newId,
        userId,
        c.companionId,
        c.title ?? null,
        toEpochMs(c.createdAt),
        toEpochMs(c.updatedAt),
      );
      result.imported++;
    } catch (err: any) {
      result.skipped++;
      result.errors.push(`conversations[${c.id}]: ${err.message}`);
    }
  }

  return { result, conversationIdMap };
}

/**
 * Import messages — INSERT with remapped conversation_id from the conversationIdMap.
 */
export function importMessages(
  db: InstanceType<typeof Database>,
  conversationIdMap: Map<string, string>,
  convos: ExportConversation[],
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'messages',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (!convos || convos.length === 0) return result;

  const msgStmt = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, timestamp, tokens_used, model, provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const convo of convos) {
    const newConvoId = conversationIdMap.get(convo.id);
    if (!newConvoId) {
      // Conversation was skipped — skip its messages too
      if (convo.messages) {
        result.skipped += convo.messages.length;
        result.errors.push(`messages: skipped ${convo.messages.length} messages for unmapped conversation '${convo.id}'`);
      }
      continue;
    }

    if (!convo.messages || convo.messages.length === 0) continue;

    for (const m of convo.messages) {
      try {
        if (!m.content || !m.role) {
          result.skipped++;
          result.errors.push(`messages[${m.id}]: missing required field content or role`);
          continue;
        }

        msgStmt.run(
          randomUUID(),
          newConvoId,
          m.role,
          m.content,
          toEpochMs(m.timestamp),
          m.tokensUsed ?? null,
          m.model ?? null,
          m.provider ?? null,
        );
        result.imported++;
      } catch (err: any) {
        result.skipped++;
        result.errors.push(`messages[${m.id}]: ${err.message}`);
      }
    }
  }

  return result;
}

/**
 * Import memories — DELETE existing + INSERT with new UUIDs.
 */
export function importMemories(
  db: InstanceType<typeof Database>,
  userId: string,
  memories: ExportMemory[],
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'memories',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  db.prepare('DELETE FROM memories WHERE user_id = ?').run(userId);

  if (!memories || memories.length === 0) return result;

  const stmt = db.prepare(`
    INSERT INTO memories
      (id, user_id, companion_id, memory_type, content, importance,
       is_transferable, access_count, created_at, last_accessed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const m of memories) {
    try {
      if (!m.content || !m.companionId) {
        result.skipped++;
        result.errors.push(`memories[${m.id}]: missing required field content or companionId`);
        continue;
      }
      if (!companionExists(db, m.companionId)) {
        result.skipped++;
        result.errors.push(`memories[${m.id}]: companion '${m.companionId}' not found`);
        continue;
      }

      stmt.run(
        randomUUID(),
        userId,
        m.companionId,
        m.memoryType ?? 'personal',
        m.content,
        m.importance ?? 0.5,
        m.isTransferable ? 1 : 0,
        m.accessCount ?? 0,
        toEpochMs(m.createdAt),
        toEpochMs(m.lastAccessedAt),
      );
      result.imported++;
    } catch (err: any) {
      result.skipped++;
      result.errors.push(`memories[${m.id}]: ${err.message}`);
    }
  }

  return result;
}

/**
 * Import customizations — INSERT OR REPLACE on UNIQUE(user_id, companion_id).
 */
export function importCustomizations(
  db: InstanceType<typeof Database>,
  userId: string,
  customs: ExportCustomization[],
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'customizations',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (!customs || customs.length === 0) return result;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO companion_customizations
      (id, user_id, companion_id, custom_name, tone_override, personality_notes,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of customs) {
    try {
      if (!c.companionId) {
        result.skipped++;
        result.errors.push('customizations: missing required field companionId');
        continue;
      }
      if (!companionExists(db, c.companionId)) {
        result.skipped++;
        result.errors.push(`customizations[${c.companionId}]: companion not found`);
        continue;
      }

      stmt.run(
        randomUUID(),
        userId,
        c.companionId,
        c.customName ?? null,
        c.toneOverride ?? null,
        c.personalityNotes ?? null,
        toEpochMs(c.createdAt),
        toEpochMs(c.updatedAt),
      );
      result.imported++;
    } catch (err: any) {
      result.skipped++;
      result.errors.push(`customizations[${c.companionId}]: ${err.message}`);
    }
  }

  return result;
}

/**
 * Import soul configs — INSERT OR REPLACE on UNIQUE(user_id, companion_id).
 */
export function importSoulConfigs(
  db: InstanceType<typeof Database>,
  userId: string,
  souls: ExportSoulConfig[],
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'soulConfigs',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (!souls || souls.length === 0) return result;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO companion_souls
      (id, user_id, companion_id, custom_name, traits, soul_values, style,
       custom_instructions, boundaries, anti_patterns, soul_hash, drift_score,
       last_calibrated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of souls) {
    try {
      if (!s.companionId) {
        result.skipped++;
        result.errors.push('soulConfigs: missing required field companionId');
        continue;
      }
      if (!companionExists(db, s.companionId)) {
        result.skipped++;
        result.errors.push(`soulConfigs[${s.companionId}]: companion not found`);
        continue;
      }

      stmt.run(
        randomUUID(),
        userId,
        s.companionId,
        s.customName ?? null,
        toJson(s.traits),
        toJson(s.soulValues),
        toJson(s.style),
        s.customInstructions ?? '',
        toJson(s.boundaries),
        toJson(s.antiPatterns),
        s.soulHash ?? null,
        s.driftScore ?? 1.0,
        toEpochMsOrNull(s.lastCalibratedAt),
        toEpochMs(s.createdAt),
        toEpochMs(s.updatedAt),
      );
      result.imported++;
    } catch (err: any) {
      result.skipped++;
      result.errors.push(`soulConfigs[${s.companionId}]: ${err.message}`);
    }
  }

  return result;
}

/**
 * Import companion skills — INSERT OR REPLACE on UNIQUE(companion_id, user_id, skill_id).
 * Skips records where companion or skill doesn't exist.
 */
export function importCompanionSkills(
  db: InstanceType<typeof Database>,
  userId: string,
  skills: ExportCompanionSkill[],
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'companionSkills',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (!skills || skills.length === 0) return result;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO companion_skills
      (id, companion_id, user_id, skill_id, skill_level, xp, xp_to_next_level,
       is_portable, accrued_at, last_used_at, usage_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of skills) {
    try {
      if (!s.companionId || !s.skillId) {
        result.skipped++;
        result.errors.push(`companionSkills: missing required field companionId or skillId`);
        continue;
      }
      if (!companionExists(db, s.companionId)) {
        result.skipped++;
        result.errors.push(`companionSkills[${s.companionId}/${s.skillId}]: companion not found`);
        continue;
      }
      if (!skillExists(db, s.skillId)) {
        result.skipped++;
        result.errors.push(`companionSkills[${s.companionId}/${s.skillId}]: skill '${s.skillId}' not found in skills table`);
        continue;
      }

      stmt.run(
        randomUUID(),
        s.companionId,
        userId,
        s.skillId,
        s.skillLevel ?? 1,
        s.xp ?? 0,
        s.xpToNextLevel ?? 100,
        s.isPortable ? 1 : 0,
        toEpochMs(s.accruedAt),
        toEpochMsOrNull(s.lastUsedAt),
        s.usageCount ?? 0,
      );
      result.imported++;
    } catch (err: any) {
      result.skipped++;
      result.errors.push(`companionSkills[${s.companionId}/${s.skillId}]: ${err.message}`);
    }
  }

  return result;
}

/**
 * Import user skills — INSERT OR REPLACE on UNIQUE(user_id, skill_id, companion_id).
 * Skips records where skill doesn't exist.
 */
export function importUserSkills(
  db: InstanceType<typeof Database>,
  userId: string,
  skills: ExportUserSkill[],
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'userSkills',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (!skills || skills.length === 0) return result;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO user_skills
      (id, user_id, skill_id, companion_id, is_active, installed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const s of skills) {
    try {
      if (!s.skillId) {
        result.skipped++;
        result.errors.push('userSkills: missing required field skillId');
        continue;
      }
      if (!skillExists(db, s.skillId)) {
        result.skipped++;
        result.errors.push(`userSkills[${s.skillId}]: skill not found in skills table`);
        continue;
      }

      stmt.run(
        randomUUID(),
        userId,
        s.skillId,
        s.companionId ?? null,
        s.isActive ? 1 : 0,
        toEpochMs(s.installedAt),
      );
      result.imported++;
    } catch (err: any) {
      result.skipped++;
      result.errors.push(`userSkills[${s.skillId}]: ${err.message}`);
    }
  }

  return result;
}

/**
 * Import progress — INSERT OR REPLACE on UNIQUE(user_id).
 */
export function importProgress(
  db: InstanceType<typeof Database>,
  userId: string,
  progress: ExportProgress | null,
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'progress',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (progress == null) return result;

  try {
    db.prepare(`
      INSERT OR REPLACE INTO progress
        (id, user_id, current_streak, longest_streak, total_messages,
         total_projects, total_voice_notes, last_active_date, level, xp,
         badges, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      userId,
      progress.currentStreak ?? 0,
      progress.longestStreak ?? 0,
      progress.totalMessages ?? 0,
      progress.totalProjects ?? 0,
      progress.totalVoiceNotes ?? 0,
      progress.lastActiveDate ?? null,
      progress.level ?? 1,
      progress.xp ?? 0,
      toJson(progress.badges),
      toEpochMs(progress.createdAt),
      toEpochMs(progress.updatedAt),
    );
    result.imported = 1;
  } catch (err: any) {
    result.skipped = 1;
    result.errors.push(`progress: ${err.message}`);
  }

  return result;
}

/**
 * Import training curation — INSERT OR REPLACE on UNIQUE(entry_hash).
 */
export function importTrainingCuration(
  db: InstanceType<typeof Database>,
  userId: string,
  curation: ExportTrainingCuration[],
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'trainingCuration',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (!curation || curation.length === 0) return result;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO training_curation
      (id, entry_hash, companion_id, verdict, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const c of curation) {
    try {
      if (!c.entryHash || !c.companionId) {
        result.skipped++;
        result.errors.push(`trainingCuration: missing required field entryHash or companionId`);
        continue;
      }

      stmt.run(
        randomUUID(),
        c.entryHash,
        c.companionId,
        c.verdict ?? 'pending',
        toEpochMs(c.createdAt),
        toEpochMs(c.updatedAt),
      );
      result.imported++;
    } catch (err: any) {
      result.skipped++;
      result.errors.push(`trainingCuration[${c.entryHash}]: ${err.message}`);
    }
  }

  return result;
}

/**
 * Import companion snapshots — DELETE existing + INSERT with new UUIDs.
 */
export function importCompanionSnapshots(
  db: InstanceType<typeof Database>,
  userId: string,
  snapshots: ExportCompanionSnapshot[],
): ImportCategoryResult {
  const result: ImportCategoryResult = {
    category: 'companionSnapshots',
    imported: 0,
    skipped: 0,
    errors: [],
  };

  db.prepare('DELETE FROM companion_snapshots WHERE user_id = ?').run(userId);

  if (!snapshots || snapshots.length === 0) return result;

  const stmt = db.prepare(`
    INSERT INTO companion_snapshots
      (id, companion_id, user_id, nft_mint_address, snapshot_type, content_hash,
       ipfs_cid, solana_tx_sig, is_on_chain, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of snapshots) {
    try {
      if (!s.companionId || !s.contentHash) {
        result.skipped++;
        result.errors.push(`companionSnapshots[${s.id}]: missing required field companionId or contentHash`);
        continue;
      }

      stmt.run(
        randomUUID(),
        s.companionId,
        userId,
        s.nftMintAddress ?? null,
        s.snapshotType ?? 'skill_state',
        s.contentHash,
        s.ipfsCid ?? null,
        s.solanaTxSig ?? null,
        s.isOnChain ? 1 : 0,
        toEpochMs(s.createdAt),
      );
      result.imported++;
    } catch (err: any) {
      result.skipped++;
      result.errors.push(`companionSnapshots[${s.id}]: ${err.message}`);
    }
  }

  return result;
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Import all archive categories in FK dependency order within a single transaction.
 * Each category is wrapped in try/catch for per-category error isolation —
 * an individual category failure doesn't abort the transaction.
 *
 * Order: userProfile → companions → preferences → conversations → messages →
 *        memories → customizations → soulConfigs → companionSkills →
 *        userSkills → progress → trainingCuration → companionSnapshots
 */
export function importArchiveData(
  db: InstanceType<typeof Database>,
  userId: string,
  categoryData: ArchiveCategoryData,
): ImportResult {
  const start = performance.now();
  const categories: ImportCategoryResult[] = [];

  const runImport = (fn: () => ImportCategoryResult): void => {
    try {
      categories.push(fn());
    } catch (err: any) {
      // Catastrophic failure in an importer — still isolate
      categories.push({
        category: 'unknown',
        imported: 0,
        skipped: 0,
        errors: [`Catastrophic: ${err.message}`],
      });
    }
  };

  // Wrap everything in a single transaction
  const txn = db.transaction(() => {
    // 1. User profile (no FK deps)
    runImport(() => importUserProfile(db, userId, categoryData.userProfile));

    // 2. Companions (FK: users)
    runImport(() => importCompanions(db, userId, categoryData.companions));

    // 3. Preferences (FK: users)
    runImport(() => importPreferences(db, userId, categoryData.preferences));

    // 4 & 5. Conversations + Messages (FK: users, companions → messages FK: conversations)
    let conversationIdMap = new Map<string, string>();
    runImport(() => {
      const { result, conversationIdMap: idMap } = importConversations(
        db,
        userId,
        categoryData.conversations,
      );
      conversationIdMap = idMap;
      return result;
    });
    runImport(() => importMessages(db, conversationIdMap, categoryData.conversations));

    // 6. Memories (FK: users, companions)
    runImport(() => importMemories(db, userId, categoryData.memories));

    // 7. Customizations (FK: users, companions)
    runImport(() => importCustomizations(db, userId, categoryData.customizations));

    // 8. Soul Configs (FK: users)
    runImport(() => importSoulConfigs(db, userId, categoryData.soulConfigs));

    // 9. Companion Skills (FK: users, skills)
    runImport(() => importCompanionSkills(db, userId, categoryData.companionSkills));

    // 10. User Skills (FK: users, skills)
    runImport(() => importUserSkills(db, userId, categoryData.userSkills));

    // 11. Progress (FK: users)
    runImport(() => importProgress(db, userId, categoryData.progress));

    // 12. Training Curation (no direct user FK, but logically user-scoped)
    runImport(() => importTrainingCuration(db, userId, categoryData.trainingCuration));

    // 13. Companion Snapshots (FK: users)
    runImport(() => importCompanionSnapshots(db, userId, categoryData.companionSnapshots));
  });

  txn();

  const durationMs = Math.round(performance.now() - start);

  const totalImported = categories.reduce((sum, c) => sum + c.imported, 0);
  const totalSkipped = categories.reduce((sum, c) => sum + c.skipped, 0);
  const totalErrors = categories.reduce((sum, c) => sum + c.errors.length, 0);

  return {
    categories,
    totalImported,
    totalSkipped,
    totalErrors,
    durationMs,
  };
}
