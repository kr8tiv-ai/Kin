/**
 * Export Archive Tests — comprehensive per-category extraction, archive structure,
 * manifest validation, endpoint streaming, partial failure resilience, file artifact
 * inclusion, and empty-state handling.
 *
 * T01 scope: verify all extractors are importable as named exports and types compile.
 * T02 scope: verify archive builder produces correct manifest, archive stream, logger.
 * T03 scope: full integration tests — per-extractor correctness with seeded data,
 *   ZIP content parsing, manifest counts vs actual data, Fastify inject endpoint,
 *   partial failure resilience, file artifact mocking, and empty-state export.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

// Stub dockerode — fleet/container-manager.ts imports it but it's not installed in this env
vi.mock('dockerode', () => ({
  default: class Docker {
    listContainers() { return Promise.resolve([]); }
    createContainer() { return Promise.resolve({ start: () => Promise.resolve() }); }
    getContainer() { return { inspect: () => Promise.resolve({}) }; }
  },
}));

import {
  extractUserProfile,
  extractCompanions,
  extractPreferences,
  extractMemories,
  extractConversationsWithMessages,
  extractCustomizations,
  extractSoulConfigs,
  extractCompanionSkills,
  extractUserSkills,
  extractProgress,
  extractTrainingCuration,
  extractCompanionSnapshots,
  discoverFileArtifacts,
} from '../api/lib/export-extractors.js';

import { buildExportArchive, type BuildArchiveResult } from '../api/lib/archive-builder.js';

import type {
  ManifestV1,
  ArchiveCategoryData,
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
  CategoryCount,
  ManifestError,
} from '../api/lib/export-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create an in-memory SQLite database with the project schema. */
function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  return db;
}

/** Collect a stream into a Buffer. */
function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

const TEST_USER_ID = 'test-user-full';
const EMPTY_USER_ID = 'test-user-empty';
const NOW = Date.now();

/**
 * Seed a rich test dataset covering all 12+ categories.
 * This user has data in every extractable category.
 */
function seedFullUser(db: InstanceType<typeof Database>): void {
  // --- User ---
  db.prepare(`
    INSERT INTO users (id, first_name, last_name, tier, auth_provider, email, username, metadata, created_at, updated_at)
    VALUES (?, 'Alice', 'Export', 'elder', 'email', 'alice@test.com', 'alice_e', '{"theme":"dark"}', ?, ?)
  `).run(TEST_USER_ID, NOW - 86400000, NOW);

  // --- Preferences ---
  db.prepare(`
    INSERT INTO user_preferences (id, user_id, display_name, experience_level, goals, language, tone, privacy_mode, onboarding_complete, setup_wizard_complete, deployment_complete, created_at, updated_at)
    VALUES (?, ?, 'AliceDisplay', 'advanced', '["learn_ai","build_apps"]', 'en', 'technical', 'shared', 1, 1, 0, ?, ?)
  `).run('pref-full', TEST_USER_ID, NOW - 86400000, NOW);

  // --- Companions (claim cipher and forge) ---
  db.prepare(`
    INSERT INTO user_companions (id, user_id, companion_id, is_active, nft_mint_address, claimed_at)
    VALUES (?, ?, 'cipher', 1, 'mint-cipher-123', ?)
  `).run('uc-cipher', TEST_USER_ID, NOW - 86400000);
  db.prepare(`
    INSERT INTO user_companions (id, user_id, companion_id, is_active, claimed_at)
    VALUES (?, ?, 'forge', 0, ?)
  `).run('uc-forge', TEST_USER_ID, NOW - 43200000);

  // --- Memories (3 memories — verifying no cap) ---
  for (let i = 0; i < 3; i++) {
    db.prepare(`
      INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable, access_count, created_at, last_accessed_at)
      VALUES (?, ?, 'cipher', 'personal', ?, 0.7, 1, ?, ?, ?)
    `).run(`mem-${i}`, TEST_USER_ID, `Memory content #${i}`, i + 1, NOW - (3 - i) * 3600000, NOW);
  }

  // --- Conversations + Messages (2 conversations, each with messages) ---
  db.prepare(`
    INSERT INTO conversations (id, user_id, companion_id, title, created_at, updated_at)
    VALUES (?, ?, 'cipher', 'Debug session', ?, ?)
  `).run('conv-1', TEST_USER_ID, NOW - 7200000, NOW - 3600000);

  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, tokens_used, model, provider, timestamp)
    VALUES (?, ?, 'user', 'How do I fix this bug?', 12, NULL, NULL, ?)
  `).run('msg-1a', 'conv-1', NOW - 7200000);
  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, tokens_used, model, provider, timestamp)
    VALUES (?, ?, 'assistant', 'Have you tried turning it off and on again?', 24, 'qwen3-32b', 'local', ?)
  `).run('msg-1b', 'conv-1', NOW - 7100000);

  db.prepare(`
    INSERT INTO conversations (id, user_id, companion_id, title, created_at, updated_at)
    VALUES (?, ?, 'forge', 'Architecture review', ?, ?)
  `).run('conv-2', TEST_USER_ID, NOW - 3600000, NOW - 1800000);

  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, timestamp)
    VALUES (?, ?, 'user', 'Review my schema design', ?)
  `).run('msg-2a', 'conv-2', NOW - 3600000);

  // --- Customizations ---
  db.prepare(`
    INSERT INTO companion_customizations (id, user_id, companion_id, custom_name, tone_override, personality_notes, created_at, updated_at)
    VALUES (?, ?, 'cipher', 'CipherBot', 'technical', 'Focus on code quality', ?, ?)
  `).run('cust-1', TEST_USER_ID, NOW - 86400000, NOW);

  // --- Soul Configs ---
  db.prepare(`
    INSERT INTO companion_souls (id, user_id, companion_id, custom_name, traits, soul_values, style, custom_instructions, boundaries, anti_patterns, soul_hash, drift_score, last_calibrated_at, created_at, updated_at)
    VALUES (?, ?, 'cipher', 'CipherSoul', '{"analytical":0.9}', '["precision","clarity"]', '{"verbosity":"low"}', 'Always cite sources', '["no_personal_advice"]', '["filler_words"]', 'sha256-abc123', 0.95, ?, ?, ?)
  `).run('soul-1', TEST_USER_ID, NOW - 43200000, NOW - 86400000, NOW);

  // --- Companion Skills ---
  db.prepare(`
    INSERT INTO companion_skills (id, companion_id, user_id, skill_id, skill_level, xp, xp_to_next_level, is_portable, accrued_at, last_used_at, usage_count)
    VALUES (?, 'cipher', ?, 'skill-code-gen', 3, 450, 200, 1, ?, ?, 15)
  `).run('cs-1', TEST_USER_ID, NOW - 86400000, NOW - 3600000);
  db.prepare(`
    INSERT INTO companion_skills (id, companion_id, user_id, skill_id, skill_level, xp, xp_to_next_level, is_portable, accrued_at, usage_count)
    VALUES (?, 'forge', ?, 'skill-architecture-review', 2, 200, 300, 1, ?, 8)
  `).run('cs-2', TEST_USER_ID, NOW - 43200000);

  // --- User Skills ---
  db.prepare(`
    INSERT INTO user_skills (id, user_id, skill_id, companion_id, is_active, installed_at)
    VALUES (?, ?, 'skill-calculator', NULL, 1, ?)
  `).run('us-1', TEST_USER_ID, NOW - 86400000);
  db.prepare(`
    INSERT INTO user_skills (id, user_id, skill_id, companion_id, is_active, installed_at)
    VALUES (?, ?, 'skill-weather', 'cipher', 0, ?)
  `).run('us-2', TEST_USER_ID, NOW - 43200000);

  // --- Progress ---
  db.prepare(`
    INSERT INTO progress (id, user_id, current_streak, longest_streak, total_messages, total_projects, total_voice_notes, last_active_date, level, xp, badges, created_at, updated_at)
    VALUES (?, ?, 5, 12, 150, 3, 2, '2026-04-06', 8, 3200, '["early_adopter","streak_master"]', ?, ?)
  `).run('prog-full', TEST_USER_ID, NOW - 86400000, NOW);

  // --- Training Curation (joined via companion IDs) ---
  db.prepare(`
    INSERT INTO training_curation (id, entry_hash, companion_id, verdict, created_at, updated_at)
    VALUES (?, 'hash-abc', 'cipher', 'approved', ?, ?)
  `).run('tc-1', NOW - 86400000, NOW);
  db.prepare(`
    INSERT INTO training_curation (id, entry_hash, companion_id, verdict, created_at, updated_at)
    VALUES (?, 'hash-def', 'cipher', 'rejected', ?, ?)
  `).run('tc-2', NOW - 43200000, NOW);

  // --- Companion Snapshots ---
  db.prepare(`
    INSERT INTO companion_snapshots (id, companion_id, user_id, nft_mint_address, snapshot_type, content_hash, ipfs_cid, solana_tx_sig, is_on_chain, created_at)
    VALUES (?, 'cipher', ?, 'mint-cipher-123', 'skill_state', 'sha256-snap1', 'QmTestCid123', 'SolTx123', 1, ?)
  `).run('snap-1', TEST_USER_ID, NOW - 86400000);
}

/**
 * Seed a user with absolutely no associated data (only the users row).
 */
function seedEmptyUser(db: InstanceType<typeof Database>): void {
  db.prepare(`
    INSERT INTO users (id, first_name, tier, auth_provider, created_at, updated_at)
    VALUES (?, 'EmptyUser', 'free', 'email', ?, ?)
  `).run(EMPTY_USER_ID, NOW, NOW);
}

// ============================================================================
// T01: Named Export and Type Compilation Tests (preserved)
// ============================================================================

describe('export-extractors: named exports', () => {
  it('all 13 extractors are importable functions', () => {
    const extractors = [
      extractUserProfile,
      extractCompanions,
      extractPreferences,
      extractMemories,
      extractConversationsWithMessages,
      extractCustomizations,
      extractSoulConfigs,
      extractCompanionSkills,
      extractUserSkills,
      extractProgress,
      extractTrainingCuration,
      extractCompanionSnapshots,
      discoverFileArtifacts,
    ];
    for (const fn of extractors) {
      expect(typeof fn).toBe('function');
    }
    expect(extractors).toHaveLength(13);
  });
});

describe('export-types: type compilation', () => {
  it('ManifestV1 shape is correct at type level', () => {
    const manifest: ManifestV1 = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      userId: 'user-123',
      categories: [{ category: 'userProfile', count: 1 }],
      fileArtifacts: [],
      errors: [],
    };
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.categories).toHaveLength(1);
  });

  it('ArchiveCategoryData shape is correct at type level', () => {
    const data: ArchiveCategoryData = {
      userProfile: null,
      companions: [],
      preferences: null,
      memories: [],
      conversations: [],
      customizations: [],
      soulConfigs: [],
      companionSkills: [],
      userSkills: [],
      progress: null,
      trainingCuration: [],
      companionSnapshots: [],
    };
    expect(data.userProfile).toBeNull();
    expect(data.companions).toEqual([]);
  });

  it('FileArtifactRef shape compiles', () => {
    const ref: FileArtifactRef = {
      category: 'training',
      companionId: 'cipher',
      archivePath: 'training/cipher/training.jsonl',
      sourcePath: '/some/path',
      sizeBytes: 1024,
    };
    expect(ref.category).toBe('training');
  });
});

// ============================================================================
// T03: Per-Extractor Integration Tests with Seeded Data
// ============================================================================

describe('extractors: per-category integration with seeded data', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDb();
    seedFullUser(db);
    seedEmptyUser(db);
  });

  afterAll(() => {
    db.close();
  });

  // ---- extractUserProfile ----
  describe('extractUserProfile', () => {
    it('returns complete camelCase profile for existing user', () => {
      const profile = extractUserProfile(db, TEST_USER_ID);
      expect(profile).not.toBeNull();
      expect(profile!.id).toBe(TEST_USER_ID);
      expect(profile!.firstName).toBe('Alice');
      expect(profile!.lastName).toBe('Export');
      expect(profile!.tier).toBe('elder');
      expect(profile!.authProvider).toBe('email');
      expect(profile!.email).toBe('alice@test.com');
      expect(profile!.username).toBe('alice_e');
      expect(profile!.metadata).toEqual({ theme: 'dark' });
      // Timestamps are ISO strings
      expect(profile!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(profile!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns null for nonexistent user', () => {
      expect(extractUserProfile(db, 'ghost')).toBeNull();
    });
  });

  // ---- extractCompanions ----
  describe('extractCompanions', () => {
    it('returns all companions with correct camelCase fields and joined metadata', () => {
      const companions = extractCompanions(db, TEST_USER_ID);
      expect(companions).toHaveLength(2);

      const cipher = companions.find(c => c.companionId === 'cipher')!;
      expect(cipher.companionName).toBe('Cipher');
      expect(cipher.companionType).toBe('code_kraken');
      expect(cipher.specialization).toBe('web_design');
      expect(cipher.isActive).toBe(true);
      expect(cipher.nftMintAddress).toBe('mint-cipher-123');
      expect(cipher.claimedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const forge = companions.find(c => c.companionId === 'forge')!;
      expect(forge.companionName).toBe('Forge');
      expect(forge.isActive).toBe(false);
      expect(forge.nftMintAddress).toBeNull();
    });

    it('returns empty array for user with no companions', () => {
      expect(extractCompanions(db, EMPTY_USER_ID)).toEqual([]);
    });
  });

  // ---- extractPreferences ----
  describe('extractPreferences', () => {
    it('returns complete preferences with parsed JSON goals', () => {
      const prefs = extractPreferences(db, TEST_USER_ID);
      expect(prefs).not.toBeNull();
      expect(prefs!.displayName).toBe('AliceDisplay');
      expect(prefs!.experienceLevel).toBe('advanced');
      expect(prefs!.goals).toEqual(['learn_ai', 'build_apps']);
      expect(prefs!.language).toBe('en');
      expect(prefs!.tone).toBe('technical');
      expect(prefs!.privacyMode).toBe('shared');
      expect(prefs!.onboardingComplete).toBe(true);
      expect(prefs!.setupWizardComplete).toBe(true);
      expect(prefs!.deploymentComplete).toBe(false);
    });

    it('returns null for user with no preferences', () => {
      expect(extractPreferences(db, EMPTY_USER_ID)).toBeNull();
    });
  });

  // ---- extractMemories ----
  describe('extractMemories', () => {
    it('returns all memories uncapped with correct fields', () => {
      const memories = extractMemories(db, TEST_USER_ID);
      expect(memories).toHaveLength(3);
      expect(memories[0].content).toBe('Memory content #0');
      expect(memories[0].companionId).toBe('cipher');
      expect(memories[0].memoryType).toBe('personal');
      expect(memories[0].importance).toBe(0.7);
      expect(memories[0].isTransferable).toBe(true);
      expect(memories[0].accessCount).toBe(1);
      expect(memories[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns memories in chronological order', () => {
      const memories = extractMemories(db, TEST_USER_ID);
      for (let i = 1; i < memories.length; i++) {
        expect(new Date(memories[i].createdAt).getTime())
          .toBeGreaterThanOrEqual(new Date(memories[i - 1].createdAt).getTime());
      }
    });

    it('returns empty array for user with no memories', () => {
      expect(extractMemories(db, EMPTY_USER_ID)).toEqual([]);
    });
  });

  // ---- extractConversationsWithMessages ----
  describe('extractConversationsWithMessages', () => {
    it('returns conversations with nested messages', () => {
      const convos = extractConversationsWithMessages(db, TEST_USER_ID);
      expect(convos).toHaveLength(2);

      const debug = convos.find(c => c.id === 'conv-1')!;
      expect(debug.companionId).toBe('cipher');
      expect(debug.title).toBe('Debug session');
      expect(debug.messages).toHaveLength(2);
      expect(debug.messages[0].role).toBe('user');
      expect(debug.messages[0].content).toBe('How do I fix this bug?');
      expect(debug.messages[0].tokensUsed).toBe(12);
      expect(debug.messages[1].role).toBe('assistant');
      expect(debug.messages[1].model).toBe('qwen3-32b');
      expect(debug.messages[1].provider).toBe('local');

      const arch = convos.find(c => c.id === 'conv-2')!;
      expect(arch.companionId).toBe('forge');
      expect(arch.messages).toHaveLength(1);
    });

    it('returns empty array for user with no conversations', () => {
      expect(extractConversationsWithMessages(db, EMPTY_USER_ID)).toEqual([]);
    });
  });

  // ---- extractCustomizations ----
  describe('extractCustomizations', () => {
    it('returns customizations with camelCase keys', () => {
      const custs = extractCustomizations(db, TEST_USER_ID);
      expect(custs).toHaveLength(1);
      expect(custs[0].companionId).toBe('cipher');
      expect(custs[0].customName).toBe('CipherBot');
      expect(custs[0].toneOverride).toBe('technical');
      expect(custs[0].personalityNotes).toBe('Focus on code quality');
    });

    it('returns empty array for user with no customizations', () => {
      expect(extractCustomizations(db, EMPTY_USER_ID)).toEqual([]);
    });
  });

  // ---- extractSoulConfigs ----
  describe('extractSoulConfigs', () => {
    it('returns soul configs with parsed JSON fields', () => {
      const souls = extractSoulConfigs(db, TEST_USER_ID);
      expect(souls).toHaveLength(1);
      expect(souls[0].companionId).toBe('cipher');
      expect(souls[0].customName).toBe('CipherSoul');
      expect(souls[0].traits).toEqual({ analytical: 0.9 });
      expect(souls[0].soulValues).toEqual(['precision', 'clarity']);
      expect(souls[0].style).toEqual({ verbosity: 'low' });
      expect(souls[0].customInstructions).toBe('Always cite sources');
      expect(souls[0].boundaries).toEqual(['no_personal_advice']);
      expect(souls[0].antiPatterns).toEqual(['filler_words']);
      expect(souls[0].soulHash).toBe('sha256-abc123');
      expect(souls[0].driftScore).toBe(0.95);
      expect(souls[0].lastCalibratedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns empty array for user with no soul configs', () => {
      expect(extractSoulConfigs(db, EMPTY_USER_ID)).toEqual([]);
    });
  });

  // ---- extractCompanionSkills ----
  describe('extractCompanionSkills', () => {
    it('returns companion skills with XP and usage data', () => {
      const skills = extractCompanionSkills(db, TEST_USER_ID);
      expect(skills).toHaveLength(2);

      const cipherSkill = skills.find(s => s.companionId === 'cipher')!;
      expect(cipherSkill.skillId).toBe('skill-code-gen');
      expect(cipherSkill.skillLevel).toBe(3);
      expect(cipherSkill.xp).toBe(450);
      expect(cipherSkill.xpToNextLevel).toBe(200);
      expect(cipherSkill.isPortable).toBe(true);
      expect(cipherSkill.usageCount).toBe(15);
      expect(cipherSkill.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const forgeSkill = skills.find(s => s.companionId === 'forge')!;
      expect(forgeSkill.skillId).toBe('skill-architecture-review');
      expect(forgeSkill.lastUsedAt).toBeNull();
    });

    it('returns empty array for user with no companion skills', () => {
      expect(extractCompanionSkills(db, EMPTY_USER_ID)).toEqual([]);
    });
  });

  // ---- extractUserSkills ----
  describe('extractUserSkills', () => {
    it('returns installed user skills', () => {
      const skills = extractUserSkills(db, TEST_USER_ID);
      expect(skills).toHaveLength(2);

      const calc = skills.find(s => s.skillId === 'skill-calculator')!;
      expect(calc.companionId).toBeNull();
      expect(calc.isActive).toBe(true);

      const weather = skills.find(s => s.skillId === 'skill-weather')!;
      expect(weather.companionId).toBe('cipher');
      expect(weather.isActive).toBe(false);
    });

    it('returns empty array for user with no skills', () => {
      expect(extractUserSkills(db, EMPTY_USER_ID)).toEqual([]);
    });
  });

  // ---- extractProgress ----
  describe('extractProgress', () => {
    it('returns progress with parsed badges', () => {
      const prog = extractProgress(db, TEST_USER_ID);
      expect(prog).not.toBeNull();
      expect(prog!.currentStreak).toBe(5);
      expect(prog!.longestStreak).toBe(12);
      expect(prog!.totalMessages).toBe(150);
      expect(prog!.totalProjects).toBe(3);
      expect(prog!.totalVoiceNotes).toBe(2);
      expect(prog!.lastActiveDate).toBe('2026-04-06');
      expect(prog!.level).toBe(8);
      expect(prog!.xp).toBe(3200);
      expect(prog!.badges).toEqual(['early_adopter', 'streak_master']);
    });

    it('returns null for user with no progress', () => {
      expect(extractProgress(db, EMPTY_USER_ID)).toBeNull();
    });
  });

  // ---- extractTrainingCuration ----
  describe('extractTrainingCuration', () => {
    it('returns curation entries joined via user_companions', () => {
      const curations = extractTrainingCuration(db, TEST_USER_ID);
      expect(curations).toHaveLength(2);

      const approved = curations.find(c => c.entryHash === 'hash-abc')!;
      expect(approved.companionId).toBe('cipher');
      expect(approved.verdict).toBe('approved');

      const rejected = curations.find(c => c.entryHash === 'hash-def')!;
      expect(rejected.verdict).toBe('rejected');
    });

    it('returns empty array for user with no companions (thus no curations)', () => {
      expect(extractTrainingCuration(db, EMPTY_USER_ID)).toEqual([]);
    });
  });

  // ---- extractCompanionSnapshots ----
  describe('extractCompanionSnapshots', () => {
    it('returns snapshots with blockchain fields', () => {
      const snaps = extractCompanionSnapshots(db, TEST_USER_ID);
      expect(snaps).toHaveLength(1);
      expect(snaps[0].companionId).toBe('cipher');
      expect(snaps[0].nftMintAddress).toBe('mint-cipher-123');
      expect(snaps[0].snapshotType).toBe('skill_state');
      expect(snaps[0].contentHash).toBe('sha256-snap1');
      expect(snaps[0].ipfsCid).toBe('QmTestCid123');
      expect(snaps[0].solanaTxSig).toBe('SolTx123');
      expect(snaps[0].isOnChain).toBe(true);
    });

    it('returns empty array for user with no snapshots', () => {
      expect(extractCompanionSnapshots(db, EMPTY_USER_ID)).toEqual([]);
    });
  });

  // ---- discoverFileArtifacts ----
  describe('discoverFileArtifacts', () => {
    it('returns empty array when no files exist on disk', () => {
      const artifacts = discoverFileArtifacts(db, TEST_USER_ID, {
        trainingBasePath: path.join('nonexistent', 'training'),
        distillBasePath: path.join('nonexistent', 'distill'),
        modelfileBasePath: path.join('nonexistent', 'models'),
      });
      expect(artifacts).toEqual([]);
    });

    it('returns empty for user with no companions', () => {
      expect(discoverFileArtifacts(db, EMPTY_USER_ID)).toEqual([]);
    });
  });
});

// ============================================================================
// T03: Archive Builder Integration — ZIP Content Verification
// ============================================================================

describe('archive-builder: ZIP content verification', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDb();
    seedFullUser(db);
    seedEmptyUser(db);
  });

  afterAll(() => {
    db.close();
  });

  it('ZIP contains manifest.json at root', async () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    const zip = new AdmZip(buf);
    const entries = zip.getEntries().map(e => e.entryName);
    expect(entries).toContain('manifest.json');
  });

  it('ZIP contains data/{category}.json for all 12 categories', async () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    const zip = new AdmZip(buf);
    const entries = zip.getEntries().map(e => e.entryName);

    const expectedDataFiles = [
      'data/userProfile.json',
      'data/companions.json',
      'data/preferences.json',
      'data/memories.json',
      'data/conversations.json',
      'data/customizations.json',
      'data/soulConfigs.json',
      'data/companionSkills.json',
      'data/userSkills.json',
      'data/progress.json',
      'data/trainingCuration.json',
      'data/companionSnapshots.json',
    ];

    for (const file of expectedDataFiles) {
      expect(entries).toContain(file);
    }
  });

  it('manifest.json inside ZIP matches the returned manifest', async () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    const zip = new AdmZip(buf);
    const manifestEntry = zip.getEntry('manifest.json');
    expect(manifestEntry).toBeTruthy();

    const manifestFromZip = JSON.parse(manifestEntry!.getData().toString('utf-8')) as ManifestV1;
    expect(manifestFromZip.schemaVersion).toBe(1);
    expect(manifestFromZip.userId).toBe(TEST_USER_ID);
    expect(manifestFromZip.exportedAt).toBe(result.manifest.exportedAt);
    expect(manifestFromZip.categories).toEqual(result.manifest.categories);
  });

  it('data/companions.json contains correct companion data', async () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    const zip = new AdmZip(buf);
    const data = JSON.parse(zip.getEntry('data/companions.json')!.getData().toString('utf-8'));
    expect(data).toHaveLength(2);
    expect(data[0].companionId).toBeDefined();
    expect(data[0].companionName).toBeDefined();
  });

  it('data/conversations.json includes nested messages', async () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    const zip = new AdmZip(buf);
    const convos = JSON.parse(zip.getEntry('data/conversations.json')!.getData().toString('utf-8'));
    expect(convos).toHaveLength(2);

    const debug = convos.find((c: any) => c.id === 'conv-1');
    expect(debug.messages).toHaveLength(2);
    expect(debug.messages[0].role).toBe('user');
    expect(debug.messages[1].role).toBe('assistant');
  });

  it('data/memories.json contains all memories (no cap)', async () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    const zip = new AdmZip(buf);
    const memories = JSON.parse(zip.getEntry('data/memories.json')!.getData().toString('utf-8'));
    expect(memories).toHaveLength(3);
  });
});

// ============================================================================
// T03: Manifest Validation
// ============================================================================

describe('archive-builder: manifest validation', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDb();
    seedFullUser(db);
    seedEmptyUser(db);
  });

  afterAll(() => {
    db.close();
  });

  it('schemaVersion is exactly 1', () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    expect(result.manifest.schemaVersion).toBe(1);
    result.archive.resume();
  });

  it('exportedAt is a valid ISO 8601 timestamp', () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    const d = new Date(result.manifest.exportedAt);
    expect(d.toISOString()).toBe(result.manifest.exportedAt);
    result.archive.resume();
  });

  it('categories has exactly 12 entries', () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    expect(result.manifest.categories).toHaveLength(12);
    result.archive.resume();
  });

  it('per-category counts match actual extracted data', () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    const counts = Object.fromEntries(
      result.manifest.categories.map(c => [c.category, c.count]),
    );

    expect(counts.userProfile).toBe(1);
    expect(counts.companions).toBe(2);
    expect(counts.preferences).toBe(1);
    expect(counts.memories).toBe(3);
    expect(counts.conversations).toBe(2);
    expect(counts.customizations).toBe(1);
    expect(counts.soulConfigs).toBe(1);
    expect(counts.companionSkills).toBe(2);
    expect(counts.userSkills).toBe(2);
    expect(counts.progress).toBe(1);
    expect(counts.trainingCuration).toBe(2);
    expect(counts.companionSnapshots).toBe(1);

    result.archive.resume();
  });

  it('errors array is empty when all extractions succeed', () => {
    const result = buildExportArchive({ db, userId: TEST_USER_ID });
    expect(result.manifest.errors).toEqual([]);
    result.archive.resume();
  });
});

// ============================================================================
// T03: Partial Failure Resilience
// ============================================================================

describe('archive-builder: partial failure resilience', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDb();
    seedFullUser(db);
  });

  afterAll(() => {
    db.close();
  });

  it('records error in manifest when one category extractor throws', async () => {
    // Drop the memories table to force extractMemories to throw
    const corruptDb = createTestDb();
    seedFullUser(corruptDb);
    corruptDb.exec('DROP TABLE memories');

    const result = buildExportArchive({ db: corruptDb, userId: TEST_USER_ID });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    // Memories should have an error, but other categories should still work
    expect(result.manifest.errors.length).toBeGreaterThan(0);
    const memoryError = result.manifest.errors.find(e => e.category === 'memories');
    expect(memoryError).toBeTruthy();
    expect(memoryError!.message).toBeTruthy();

    // Other categories should still have data
    const counts = Object.fromEntries(
      result.manifest.categories.map(c => [c.category, c.count]),
    );
    expect(counts.userProfile).toBe(1);
    expect(counts.companions).toBe(2);

    corruptDb.close();
  });

  it('still produces valid ZIP even with extraction errors', async () => {
    const corruptDb = createTestDb();
    seedFullUser(corruptDb);
    corruptDb.exec('DROP TABLE memories');

    const result = buildExportArchive({ db: corruptDb, userId: TEST_USER_ID });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    // ZIP should still be valid
    const zip = new AdmZip(buf);
    const entries = zip.getEntries().map(e => e.entryName);
    expect(entries).toContain('manifest.json');
    expect(entries).toContain('data/userProfile.json');
    expect(entries).toContain('data/memories.json'); // Still present — empty fallback

    // Memories data file should contain the empty fallback
    const memoriesData = JSON.parse(zip.getEntry('data/memories.json')!.getData().toString('utf-8'));
    expect(memoriesData).toEqual([]);

    corruptDb.close();
  });

  it('records multiple errors when multiple categories fail', async () => {
    const corruptDb = createTestDb();
    seedFullUser(corruptDb);
    corruptDb.exec('DROP TABLE memories');
    corruptDb.exec('DROP TABLE companion_customizations');

    const result = buildExportArchive({ db: corruptDb, userId: TEST_USER_ID });
    result.archive.resume();

    expect(result.manifest.errors.length).toBeGreaterThanOrEqual(2);
    const categories = result.manifest.errors.map(e => e.category);
    expect(categories).toContain('memories');
    expect(categories).toContain('customizations');

    corruptDb.close();
  });
});

// ============================================================================
// T03: File Artifact Handling (mocked filesystem)
// ============================================================================

describe('archive-builder: file artifact handling', () => {
  let db: InstanceType<typeof Database>;
  let tmpDir: string;

  beforeAll(() => {
    db = createTestDb();
    seedFullUser(db);

    // Create temp directory structure simulating training files
    tmpDir = path.join(process.cwd(), '.tmp-test-artifacts');
    const trainingDir = path.join(tmpDir, 'training', 'cipher');
    const modelfileDir = path.join(tmpDir, 'models', 'cipher');

    fs.mkdirSync(trainingDir, { recursive: true });
    fs.mkdirSync(modelfileDir, { recursive: true });

    fs.writeFileSync(path.join(trainingDir, 'training.jsonl'), '{"messages":[{"role":"user","content":"test"}]}\n');
    fs.writeFileSync(path.join(modelfileDir, 'Modelfile'), 'FROM kin-cipher\nSYSTEM You are Cipher.\n');
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers and includes training JSONL in archive', async () => {
    const result = buildExportArchive({
      db,
      userId: TEST_USER_ID,
      fileDiscovery: {
        trainingBasePath: path.join(tmpDir, 'training'),
        distillBasePath: path.join(tmpDir, 'distill'),
        modelfileBasePath: path.join(tmpDir, 'models'),
      },
    });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    // Check manifest file artifacts
    expect(result.manifest.fileArtifacts.length).toBeGreaterThan(0);
    const trainingArtifact = result.manifest.fileArtifacts.find(a => a.category === 'training');
    expect(trainingArtifact).toBeTruthy();
    expect(trainingArtifact!.companionId).toBe('cipher');
    expect(trainingArtifact!.sizeBytes).toBeGreaterThan(0);

    // Check actual ZIP entry
    const zip = new AdmZip(buf);
    const entries = zip.getEntries().map(e => e.entryName);
    expect(entries).toContain('training/cipher/training.jsonl');

    const jsonlContent = zip.getEntry('training/cipher/training.jsonl')!.getData().toString('utf-8');
    expect(jsonlContent).toContain('"messages"');
  });

  it('discovers and includes Modelfile in archive', async () => {
    const result = buildExportArchive({
      db,
      userId: TEST_USER_ID,
      fileDiscovery: {
        trainingBasePath: path.join(tmpDir, 'training'),
        distillBasePath: path.join(tmpDir, 'distill'),
        modelfileBasePath: path.join(tmpDir, 'models'),
      },
    });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    const modelArtifact = result.manifest.fileArtifacts.find(a => a.category === 'modelfile');
    expect(modelArtifact).toBeTruthy();
    expect(modelArtifact!.companionId).toBe('cipher');

    const zip = new AdmZip(buf);
    const entries = zip.getEntries().map(e => e.entryName);
    expect(entries).toContain('models/cipher/Modelfile');

    const content = zip.getEntry('models/cipher/Modelfile')!.getData().toString('utf-8');
    expect(content).toContain('FROM kin-cipher');
  });

  it('skips nonexistent distill files without error', async () => {
    const result = buildExportArchive({
      db,
      userId: TEST_USER_ID,
      fileDiscovery: {
        trainingBasePath: path.join(tmpDir, 'training'),
        distillBasePath: path.join(tmpDir, 'distill'), // No distill files exist
        modelfileBasePath: path.join(tmpDir, 'models'),
      },
    });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    const distillArtifact = result.manifest.fileArtifacts.find(a => a.category === 'distill');
    expect(distillArtifact).toBeUndefined();
    expect(result.manifest.errors).toEqual([]);
  });
});

// ============================================================================
// T03: Empty-State Export
// ============================================================================

describe('archive-builder: empty-state export', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDb();
    seedEmptyUser(db);
  });

  afterAll(() => {
    db.close();
  });

  it('produces valid archive for user with no data', async () => {
    const result = buildExportArchive({ db, userId: EMPTY_USER_ID });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    // ZIP should be valid
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4B);

    const zip = new AdmZip(buf);
    const entries = zip.getEntries().map(e => e.entryName);
    expect(entries).toContain('manifest.json');
    expect(entries).toContain('data/userProfile.json');
  });

  it('manifest shows zero counts for all array categories', () => {
    const result = buildExportArchive({ db, userId: EMPTY_USER_ID });
    const counts = Object.fromEntries(
      result.manifest.categories.map(c => [c.category, c.count]),
    );

    // Profile exists for this user
    expect(counts.userProfile).toBe(1);
    // Everything else should be zero
    expect(counts.companions).toBe(0);
    expect(counts.preferences).toBe(0);
    expect(counts.memories).toBe(0);
    expect(counts.conversations).toBe(0);
    expect(counts.customizations).toBe(0);
    expect(counts.soulConfigs).toBe(0);
    expect(counts.companionSkills).toBe(0);
    expect(counts.userSkills).toBe(0);
    expect(counts.progress).toBe(0);
    expect(counts.trainingCuration).toBe(0);
    expect(counts.companionSnapshots).toBe(0);

    result.archive.resume();
  });

  it('manifest has no errors for empty user', () => {
    const result = buildExportArchive({ db, userId: EMPTY_USER_ID });
    expect(result.manifest.errors).toEqual([]);
    result.archive.resume();
  });

  it('produces valid archive for completely nonexistent user', async () => {
    const result = buildExportArchive({ db, userId: 'nonexistent-ghost' });
    const buf = await streamToBuffer(result.archive);
    await result.finalized;

    const counts = Object.fromEntries(
      result.manifest.categories.map(c => [c.category, c.count]),
    );
    expect(counts.userProfile).toBe(0);
    expect(counts.companions).toBe(0);
    expect(result.manifest.errors).toEqual([]);
  });
});

// ============================================================================
// T03: Fastify Endpoint via inject() — /export/archive
// ============================================================================

describe('GET /export/archive endpoint', () => {
  let server: import('fastify').FastifyInstance;
  let token = '';
  let userId = '';

  const ENV_KEYS = [
    'TELEGRAM_BOT_TOKEN',
    'GROQ_API_KEY',
    'DISCORD_BOT_TOKEN',
    'DISCORD_CLIENT_ID',
    'WHATSAPP_AUTH_DIR',
  ] as const;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    // Save and set env
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
    }
    process.env.TELEGRAM_BOT_TOKEN = 'test-tg-token';
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.DISCORD_BOT_TOKEN = 'test-discord-token';
    process.env.DISCORD_CLIENT_ID = 'test-discord-id';
    process.env.WHATSAPP_AUTH_DIR = '.tmp-whatsapp-export';

    const { createServer } = await import('../api/server.js');
    server = await createServer({
      environment: 'development',
      databasePath: ':memory:',
      jwtSecret: 'export-test-secret',
      rateLimitMax: 10000,
    });

    await server.ready();

    // Create test user via dev-login
    const login = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 999001, firstName: 'ExportTest' },
    });
    const loginBody = login.json<{ token: string; user: { id: string } }>();
    token = loginBody.token;
    userId = loginBody.user.id;

    // Seed some data for this user
    const db = server.context.db;
    db.prepare(`
      INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance)
      VALUES (?, ?, 'cipher', 'personal', 'Endpoint test memory', 0.5)
    `).run('mem-endpoint', userId);

    // Claim cipher companion (dev-login may do this, but ensure it)
    try {
      db.prepare(`
        INSERT OR IGNORE INTO user_companions (id, user_id, companion_id, is_active)
        VALUES (?, ?, 'cipher', 1)
      `).run(`uc-endpoint-${userId}`, userId);
    } catch { /* may already exist from dev-login */ }
  });

  afterAll(async () => {
    for (const key of ENV_KEYS) {
      if (previousEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousEnv[key];
      }
    }
    await server.close();
  });

  it('returns 200 with application/zip content type', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/export/archive',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
  });

  it('returns Content-Disposition with timestamped filename', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/export/archive',
      headers: { authorization: `Bearer ${token}` },
    });
    const disposition = res.headers['content-disposition'] as string;
    expect(disposition).toMatch(/attachment; filename="kin-export-.*\.zip"/);
  });

  it('response body is a valid ZIP containing manifest.json', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/export/archive',
      headers: { authorization: `Bearer ${token}` },
    });
    const buf = Buffer.from(res.rawPayload);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4B);

    const zip = new AdmZip(buf);
    const entries = zip.getEntries().map(e => e.entryName);
    expect(entries).toContain('manifest.json');

    const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf-8'));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.userId).toBe(userId);
  });

  it('returns 401 without auth token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/export/archive',
    });
    expect(res.statusCode).toBe(401);
  });

  it('legacy /export/data returns 404 (removed)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/export/data',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ============================================================================
// T02: Archive Builder Tests (preserved from original)
// ============================================================================

describe('archive-builder: buildExportArchive (T02 preserved)', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDb();
    // Use legacy seed for backward compatibility with T02 tests
    db.prepare(`
      INSERT INTO users (id, first_name, last_name, tier, auth_provider)
      VALUES (?, 'Test', 'User', 'free', 'email')
    `).run('test-user-1');
    db.prepare(`
      INSERT INTO user_preferences (id, user_id, display_name, experience_level, goals, language, tone, onboarding_complete)
      VALUES (?, ?, 'TestUser', 'advanced', '["ai"]', 'en', 'friendly', 1)
    `).run('pref-test-user-1', 'test-user-1');
    db.prepare(`
      INSERT INTO user_companions (id, user_id, companion_id, is_active)
      VALUES (?, ?, 'cipher', 1)
    `).run('uc-test-user-1', 'test-user-1');
    db.prepare(`
      INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance)
      VALUES (?, ?, 'cipher', 'personal', 'Test memory content', 0.8)
    `).run('mem-test-user-1', 'test-user-1');
    db.prepare(`
      INSERT INTO conversations (id, user_id, companion_id, title)
      VALUES (?, ?, 'cipher', 'Test conversation')
    `).run('conv-test-user-1', 'test-user-1');
    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, 'user', 'Hello')
    `).run('msg1-test-user-1', 'conv-test-user-1');
    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, 'assistant', 'Hi there!')
    `).run('msg2-test-user-1', 'conv-test-user-1');
    db.prepare(`
      INSERT INTO progress (id, user_id, current_streak, longest_streak, total_messages, total_projects, total_voice_notes, level, xp, badges)
      VALUES (?, ?, 3, 7, 42, 2, 0, 5, 1200, '["early_adopter"]')
    `).run('prog-test-user-1', 'test-user-1');
  });

  afterAll(() => {
    db.close();
  });

  it('returns archive stream, finalized promise, and manifest', () => {
    const result = buildExportArchive({ db, userId: 'test-user-1' });
    expect(result).toHaveProperty('archive');
    expect(result).toHaveProperty('finalized');
    expect(result).toHaveProperty('manifest');
    expect(typeof result.archive.pipe).toBe('function');
    expect(result.finalized).toBeInstanceOf(Promise);
  });

  it('manifest has schemaVersion 1, valid userId, ISO exportedAt', () => {
    const result = buildExportArchive({ db, userId: 'test-user-1' });
    const m = result.manifest;
    expect(m.schemaVersion).toBe(1);
    expect(m.userId).toBe('test-user-1');
    expect(m.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(m.errors).toEqual([]);
    result.archive.resume();
  });

  it('manifest categories include all 12 data categories', () => {
    const result = buildExportArchive({ db, userId: 'test-user-1' });
    const categoryNames = result.manifest.categories.map(c => c.category);
    expect(categoryNames).toContain('userProfile');
    expect(categoryNames).toContain('companions');
    expect(categoryNames).toContain('preferences');
    expect(categoryNames).toContain('memories');
    expect(categoryNames).toContain('conversations');
    expect(categoryNames).toContain('customizations');
    expect(categoryNames).toContain('soulConfigs');
    expect(categoryNames).toContain('companionSkills');
    expect(categoryNames).toContain('userSkills');
    expect(categoryNames).toContain('progress');
    expect(categoryNames).toContain('trainingCuration');
    expect(categoryNames).toContain('companionSnapshots');
    expect(result.manifest.categories).toHaveLength(12);
    result.archive.resume();
  });

  it('produces a valid ZIP stream that finalizes', async () => {
    const result = buildExportArchive({ db, userId: 'test-user-1' });
    const buf = await streamToBuffer(result.archive);
    const { totalBytes } = await result.finalized;
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4B);
    expect(totalBytes).toBeGreaterThan(0);
    expect(totalBytes).toBe(buf.length);
  });

  it('accepts a logger without crashing', async () => {
    const logs: string[] = [];
    const result = buildExportArchive({
      db,
      userId: 'test-user-1',
      logger: {
        info: (msg) => logs.push(`info: ${msg}`),
        warn: (msg) => logs.push(`warn: ${msg}`),
        error: (msg) => logs.push(`error: ${msg}`),
      },
    });
    await streamToBuffer(result.archive);
    await result.finalized;
    expect(logs.some(l => l.includes('Export archive build started'))).toBe(true);
    expect(logs.some(l => l.includes('Export archive build complete'))).toBe(true);
  });
});

describe('archive-builder: buildExportArchive import', () => {
  it('buildExportArchive is importable as named export', () => {
    expect(typeof buildExportArchive).toBe('function');
  });
});
