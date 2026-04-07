/**
 * Import Routes — Full-state archive import and legacy flat-JSON endpoint.
 *
 * POST /import/archive  — accepts multipart ZIP upload, parses manifest,
 *                          delegates to per-category importer, restores file
 *                          artifacts and Ollama models
 * POST /import/data     — (deprecated) flat JSON import
 *
 * All routes are JWT-protected (registered under the protectedFastify scope).
 *
 * @module api/routes/import
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

import type { ExportData } from './export.js';
import type {
  ManifestV1,
  ArchiveCategoryData,
  FileArtifactRef,
} from '../lib/export-types.js';
import type { ImportResult } from '../lib/import-types.js';
import { importArchiveData } from '../lib/archive-importer.js';
import { getOllamaClient, isLocalLlmAvailable } from '../../inference/local-llm.js';

// ============================================================================
// Extended Import Result (adds file artifacts + model restoration info)
// ============================================================================

interface FileArtifactResult {
  restored: number;
  failed: number;
  errors: string[];
}

interface ModelRestorationResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

interface FullImportResult extends ImportResult {
  success: boolean;
  manifestVersion: number;
  fileArtifacts: FileArtifactResult;
  modelRestoration: ModelRestorationResult;
}

// ============================================================================
// Helpers
// ============================================================================

/** Safely parse JSON from a ZIP entry, returning null on failure. */
function parseZipJson<T>(zip: AdmZip, entryPath: string): T | null {
  const entry = zip.getEntry(entryPath);
  if (!entry) return null;
  try {
    return JSON.parse(entry.getData().toString('utf8'));
  } catch {
    return null;
  }
}

/** Category names that map to data/{name}.json files in the archive. */
const CATEGORY_FILE_MAP: Record<keyof ArchiveCategoryData, string> = {
  userProfile: 'data/userProfile.json',
  companions: 'data/companions.json',
  preferences: 'data/preferences.json',
  conversations: 'data/conversations.json',
  memories: 'data/memories.json',
  customizations: 'data/customizations.json',
  soulConfigs: 'data/soulConfigs.json',
  companionSkills: 'data/companionSkills.json',
  userSkills: 'data/userSkills.json',
  progress: 'data/progress.json',
  trainingCuration: 'data/trainingCuration.json',
  companionSnapshots: 'data/companionSnapshots.json',
};

// ============================================================================
// Route Plugin
// ============================================================================

const importRoutes: FastifyPluginAsync = async (fastify) => {
  // ==========================================================================
  // NEW: POST /import/archive — multipart ZIP upload with full-state import
  // ==========================================================================

  fastify.post('/import/archive', async (request, reply) => {
    const start = performance.now();
    const userId = (request.user as { userId: string }).userId;

    request.log.info({ userId }, 'Import archive requested');

    // ---- 1. Read multipart file ----
    let fileData: Buffer;
    try {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ success: false, error: 'No file uploaded' });
      }
      fileData = await file.toBuffer();
    } catch (err: any) {
      request.log.error({ userId, error: err.message }, 'Multipart read failed');
      return reply.status(400).send({ success: false, error: 'Failed to read uploaded file' });
    }

    // ---- 2. Parse ZIP ----
    let zip: AdmZip;
    try {
      zip = new AdmZip(fileData);
    } catch (err: any) {
      request.log.warn({ userId, error: err.message }, 'Invalid ZIP archive');
      return reply.status(400).send({ success: false, error: 'Invalid ZIP archive' });
    }

    // ---- 3. Validate manifest ----
    const manifest = parseZipJson<ManifestV1>(zip, 'manifest.json');
    if (!manifest) {
      return reply.status(400).send({ success: false, error: 'Missing or invalid manifest.json in archive' });
    }
    if (manifest.schemaVersion !== 1) {
      return reply.status(400).send({
        success: false,
        error: `Unsupported schema version: ${manifest.schemaVersion}. Expected 1.`,
      });
    }

    // ---- 4. Extract category data from ZIP ----
    const categoryData: ArchiveCategoryData = {
      userProfile: parseZipJson(zip, CATEGORY_FILE_MAP.userProfile),
      companions: parseZipJson(zip, CATEGORY_FILE_MAP.companions) ?? [],
      preferences: parseZipJson(zip, CATEGORY_FILE_MAP.preferences),
      conversations: parseZipJson(zip, CATEGORY_FILE_MAP.conversations) ?? [],
      memories: parseZipJson(zip, CATEGORY_FILE_MAP.memories) ?? [],
      customizations: parseZipJson(zip, CATEGORY_FILE_MAP.customizations) ?? [],
      soulConfigs: parseZipJson(zip, CATEGORY_FILE_MAP.soulConfigs) ?? [],
      companionSkills: parseZipJson(zip, CATEGORY_FILE_MAP.companionSkills) ?? [],
      userSkills: parseZipJson(zip, CATEGORY_FILE_MAP.userSkills) ?? [],
      progress: parseZipJson(zip, CATEGORY_FILE_MAP.progress),
      trainingCuration: parseZipJson(zip, CATEGORY_FILE_MAP.trainingCuration) ?? [],
      companionSnapshots: parseZipJson(zip, CATEGORY_FILE_MAP.companionSnapshots) ?? [],
    };

    // ---- 5. Run per-category import via orchestrator ----
    const db = fastify.context.db;
    const importResult = importArchiveData(db, userId, categoryData);

    // ---- 6. Restore file artifacts to disk ----
    const fileArtifacts: FileArtifactResult = { restored: 0, failed: 0, errors: [] };

    if (manifest.fileArtifacts && manifest.fileArtifacts.length > 0) {
      for (const artifact of manifest.fileArtifacts) {
        try {
          const entry = zip.getEntry(artifact.archivePath);
          if (!entry) {
            fileArtifacts.failed++;
            fileArtifacts.errors.push(`File not found in archive: ${artifact.archivePath}`);
            continue;
          }

          // Determine target path on disk
          const targetPath = resolveArtifactDiskPath(artifact);
          const targetDir = path.dirname(targetPath);

          fs.mkdirSync(targetDir, { recursive: true });
          fs.writeFileSync(targetPath, entry.getData());
          fileArtifacts.restored++;
        } catch (err: any) {
          fileArtifacts.failed++;
          fileArtifacts.errors.push(`${artifact.archivePath}: ${err.message}`);
        }
      }
    }

    // ---- 7. Restore Ollama models (fire-and-forget, non-blocking) ----
    const modelRestoration: ModelRestorationResult = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    const modelEntries = zip.getEntries().filter(
      (e) => e.entryName.startsWith('models/') && e.entryName.endsWith('/Modelfile'),
    );

    if (modelEntries.length > 0) {
      const ollamaAvailable = await isLocalLlmAvailable();

      if (!ollamaAvailable) {
        modelRestoration.failed = modelEntries.length;
        modelRestoration.attempted = modelEntries.length;
        modelRestoration.errors.push('Ollama is not available — skipped all model restorations');
      } else {
        const client = getOllamaClient();

        for (const entry of modelEntries) {
          modelRestoration.attempted++;
          // Extract companionId from path: models/{companionId}/Modelfile
          const parts = entry.entryName.split('/');
          const companionId = parts[1];

          if (!companionId) {
            modelRestoration.failed++;
            modelRestoration.errors.push(`Invalid model path: ${entry.entryName}`);
            continue;
          }

          const modelName = `kin-${companionId}`;
          const modelfileContent = entry.getData().toString('utf8');

          try {
            await client.createModel(modelName, modelfileContent);
            modelRestoration.succeeded++;
          } catch (err: any) {
            modelRestoration.failed++;
            modelRestoration.errors.push(`${modelName}: ${err.message}`);
          }
        }
      }
    }

    const durationMs = Math.round(performance.now() - start);

    // ---- 8. Build response ----
    const fullResult: FullImportResult = {
      ...importResult,
      durationMs, // Override with total duration including file + model restoration
      success: importResult.totalErrors === 0 && fileArtifacts.failed === 0 && modelRestoration.failed === 0,
      manifestVersion: manifest.schemaVersion,
      fileArtifacts,
      modelRestoration,
    };

    request.log.info(
      {
        userId,
        categoryCount: importResult.categories.length,
        totalImported: importResult.totalImported,
        totalErrors: importResult.totalErrors,
        filesRestored: fileArtifacts.restored,
        modelsRestored: modelRestoration.succeeded,
        durationMs,
      },
      'Import archive completed',
    );

    return fullResult;
  });

  // ==========================================================================
  // DEPRECATED: POST /import/data — flat JSON import (backward compatible)
  // ==========================================================================

  fastify.post<{ Body: { importData: ExportData } }>(
    '/import/data',
    {
      schema: {
        body: {
          type: 'object',
          required: ['importData'],
          properties: {
            importData: { type: 'object' },
          },
        },
      },
    } as any,
    async (request, reply: FastifyReply) => {
      const userId = (request.user as { userId: string }).userId;
      const importData = request.body.importData;

      reply.header('X-Deprecated', 'Use POST /import/archive for full-state import');

      if (!importData.version) {
        return reply.status(400).send({ success: false, error: 'Invalid import file: missing version' });
      }

      const results = {
        preferences: false,
        memories: 0,
        customizations: 0,
      };

      try {
        if (importData.preferences) {
          const prefs = importData.preferences;
          const existingPrefs = fastify.context.db.prepare(
            `SELECT id FROM user_preferences WHERE user_id = ?`,
          ).get(userId);

          if (existingPrefs) {
            fastify.context.db.prepare(`
              UPDATE user_preferences SET display_name = ?, experience_level = ?, goals = ?, language = ?, tone = ?, privacy_mode = ?, updated_at = ?
              WHERE user_id = ?
            `).run(
              prefs.displayName ?? null,
              prefs.experienceLevel ?? 'beginner',
              JSON.stringify(prefs.goals ?? []),
              prefs.language ?? 'en',
              prefs.tone ?? 'friendly',
              prefs.privacyMode ?? 'private',
              Date.now(),
              userId,
            );
          } else {
            fastify.context.db.prepare(`
              INSERT INTO user_preferences (id, user_id, display_name, experience_level, goals, language, tone, privacy_mode, onboarding_complete)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            `).run(
              `pref-${crypto.randomUUID()}`,
              userId,
              prefs.displayName ?? null,
              prefs.experienceLevel ?? 'beginner',
              JSON.stringify(prefs.goals ?? []),
              prefs.language ?? 'en',
              prefs.tone ?? 'friendly',
              prefs.privacyMode ?? 'private',
            );
          }
          results.preferences = true;
        }

        if (importData.memories?.length > 0) {
          for (const memory of importData.memories) {
            try {
              fastify.context.db.prepare(`
                INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, created_at, last_accessed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                memory.id ?? `mem-${crypto.randomUUID()}`,
                userId,
                memory.companionId,
                memory.memoryType ?? 'context',
                memory.content,
                memory.importance ?? 0.5,
                new Date(memory.createdAt).getTime() ?? Date.now(),
                Date.now(),
              );
              results.memories++;
            } catch {
              // Skip duplicate memories
            }
          }
        }

        if (importData.customizations?.length > 0) {
          for (const custom of importData.customizations) {
            try {
              fastify.context.db.prepare(`
                INSERT OR REPLACE INTO companion_customizations (id, user_id, companion_id, custom_name, tone_override, personality_notes, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                `custom-${crypto.randomUUID()}`,
                userId,
                custom.companionId,
                custom.customName ?? null,
                custom.toneOverride ?? null,
                custom.personalityNotes ?? null,
                Date.now(),
              );
              results.customizations++;
            } catch {
              // Skip failed customizations
            }
          }
        }

        return {
          success: true,
          imported: results,
        };
      } catch (err) {
        fastify.log.error({ err }, 'Import failed');
        return reply.status(500).send({ success: false, error: 'Import failed' });
      }
    },
  );
};

// ============================================================================
// Helpers — File Artifact Disk Path Resolution
// ============================================================================

/**
 * Resolve the disk path for a file artifact based on its category and companionId.
 * Training data → data/training/{companionId}/training.jsonl
 * Distill data  → data/distill/{companionId}/distill.jsonl
 * Modelfile     → data/models/{companionId}/Modelfile
 */
function resolveArtifactDiskPath(artifact: FileArtifactRef): string {
  switch (artifact.category) {
    case 'training':
      return path.join(process.cwd(), 'data', 'training', artifact.companionId, 'training.jsonl');
    case 'distill':
      return path.join(process.cwd(), 'data', 'distill', artifact.companionId, 'distill.jsonl');
    case 'modelfile':
      return path.join(process.cwd(), 'data', 'models', artifact.companionId, 'Modelfile');
    default:
      // Fall back to archivePath relative to data/
      return path.join(process.cwd(), 'data', artifact.archivePath);
  }
}

export default importRoutes;
