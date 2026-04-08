/**
 * Archive Builder — Assembles a streaming ZIP archive of all user data.
 *
 * Orchestrates the T01 extractors, writes each category as data/{category}.json,
 * copies file artifacts (training JSONL, distill JSONL, Modelfiles) into their
 * respective directories, and generates a manifest.json with v1 schema.
 *
 * Per-category extraction errors are caught and recorded in the manifest —
 * a single failing category never aborts the whole export.
 *
 * @module api/lib/archive-builder
 */

import archiver from 'archiver';
import * as fs from 'fs';
import type { PassThrough } from 'stream';
import type Database from 'better-sqlite3';
import type {
  ManifestV1,
  ManifestError,
  CategoryCount,
  ArchiveCategoryData,
  FileArtifactRef,
} from './export-types.js';
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
  type FileDiscoveryOptions,
} from './export-extractors.js';

// ============================================================================
// Types
// ============================================================================

export interface BuildArchiveOptions {
  /** better-sqlite3 Database instance */
  db: InstanceType<typeof Database>;
  /** User ID to export */
  userId: string;
  /** File discovery base paths (optional overrides) */
  fileDiscovery?: FileDiscoveryOptions;
  /** Optional logger — receives structured log objects */
  logger?: {
    info: (msg: string, ctx?: Record<string, unknown>) => void;
    warn: (msg: string, ctx?: Record<string, unknown>) => void;
    error: (msg: string, ctx?: Record<string, unknown>) => void;
  };
}

export interface BuildArchiveResult {
  /** The archiver instance (a readable stream) — pipe this to the response */
  archive: archiver.Archiver;
  /** Promise that resolves when the archive has been finalized with total byte count */
  finalized: Promise<{ totalBytes: number }>;
  /** The manifest that was written into the archive */
  manifest: ManifestV1;
}

// ============================================================================
// Category Extraction with Error Isolation
// ============================================================================

interface CategoryResult<T> {
  data: T;
  error: ManifestError | null;
}

function safeExtract<T>(
  category: string,
  fallback: T,
  fn: () => T,
): CategoryResult<T> {
  try {
    return { data: fn(), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: fallback,
      error: { category, message },
    };
  }
}

// ============================================================================
// Build Archive
// ============================================================================

/**
 * Build a streaming ZIP export archive for the given user.
 *
 * Returns the archiver stream (pipe it to your response), a finalized promise,
 * and the manifest. The archive is streaming — no full ZIP held in memory.
 */
export async function buildExportArchive(options: BuildArchiveOptions): Promise<BuildArchiveResult> {
  const { db, userId, fileDiscovery, logger } = options;
  const startTime = Date.now();
  const errors: ManifestError[] = [];

  logger?.info('Export archive build started', { userId });

  // --------------------------------------------------------------------------
  // 1. Run all category extractors with error isolation
  // --------------------------------------------------------------------------

  const userProfile = safeExtract('userProfile', null, () => extractUserProfile(db, userId));
  const companions = safeExtract('companions', [], () => extractCompanions(db, userId));
  const preferences = safeExtract('preferences', null, () => extractPreferences(db, userId));
  const memories = safeExtract('memories', [], () => extractMemories(db, userId));
  const conversations = safeExtract('conversations', [], () =>
    extractConversationsWithMessages(db, userId),
  );
  const customizations = safeExtract('customizations', [], () =>
    extractCustomizations(db, userId),
  );
  const soulConfigs = safeExtract('soulConfigs', [], () => extractSoulConfigs(db, userId));
  const companionSkills = safeExtract('companionSkills', [], () =>
    extractCompanionSkills(db, userId),
  );
  const userSkills = safeExtract('userSkills', [], () => extractUserSkills(db, userId));
  const progress = safeExtract('progress', null, () => extractProgress(db, userId));
  const trainingCuration = safeExtract('trainingCuration', [], () =>
    extractTrainingCuration(db, userId),
  );
  const companionSnapshots = safeExtract('companionSnapshots', [], () =>
    extractCompanionSnapshots(db, userId),
  );

  // Collect errors
  const results = [
    userProfile, companions, preferences, memories, conversations,
    customizations, soulConfigs, companionSkills, userSkills, progress,
    trainingCuration, companionSnapshots,
  ];
  for (const r of results) {
    if (r.error) errors.push(r.error);
  }

  // Assemble category data object
  const categoryData: ArchiveCategoryData = {
    userProfile: userProfile.data,
    companions: companions.data,
    preferences: preferences.data,
    memories: memories.data,
    conversations: conversations.data,
    customizations: customizations.data,
    soulConfigs: soulConfigs.data,
    companionSkills: companionSkills.data,
    userSkills: userSkills.data,
    progress: progress.data,
    trainingCuration: trainingCuration.data,
    companionSnapshots: companionSnapshots.data,
  };

  // --------------------------------------------------------------------------
  // 2. Discover file artifacts
  // --------------------------------------------------------------------------

  let fileArtifacts: FileArtifactRef[] = [];
  try {
    fileArtifacts = discoverFileArtifacts(db, userId, fileDiscovery);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ category: 'fileArtifacts', message });
    logger?.warn('File artifact discovery failed', { userId, error: message });
  }

  // --------------------------------------------------------------------------
  // 3. Build category counts
  // --------------------------------------------------------------------------

  const categories: CategoryCount[] = [
    { category: 'userProfile', count: userProfile.data ? 1 : 0 },
    { category: 'companions', count: companions.data.length },
    { category: 'preferences', count: preferences.data ? 1 : 0 },
    { category: 'memories', count: memories.data.length },
    { category: 'conversations', count: conversations.data.length },
    { category: 'customizations', count: customizations.data.length },
    { category: 'soulConfigs', count: soulConfigs.data.length },
    { category: 'companionSkills', count: companionSkills.data.length },
    { category: 'userSkills', count: userSkills.data.length },
    { category: 'progress', count: progress.data ? 1 : 0 },
    { category: 'trainingCuration', count: trainingCuration.data.length },
    { category: 'companionSnapshots', count: companionSnapshots.data.length },
  ];

  // --------------------------------------------------------------------------
  // 4. Build manifest
  // --------------------------------------------------------------------------

  const manifest: ManifestV1 = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    userId,
    categories,
    fileArtifacts: fileArtifacts.map((f) => ({
      category: f.category,
      companionId: f.companionId,
      archivePath: f.archivePath,
      sourcePath: f.sourcePath,
      sizeBytes: f.sizeBytes,
    })),
    errors,
  };

  // --------------------------------------------------------------------------
  // 5. Create streaming ZIP archive
  // --------------------------------------------------------------------------

  const archive = archiver('zip', { zlib: { level: 6 } });

  // Track total bytes via the 'end' event on the archive stream
  const finalized = new Promise<{ totalBytes: number }>((resolve, reject) => {
    archive.on('end', () => {
      const totalBytes = archive.pointer();
      const durationMs = Date.now() - startTime;
      logger?.info('Export archive build complete', {
        userId,
        totalBytes,
        durationMs,
        categoryCount: categories.length,
        fileArtifactCount: fileArtifacts.length,
        errorCount: errors.length,
      });
      resolve({ totalBytes });
    });

    archive.on('error', (err) => {
      logger?.error('Export archive build failed', {
        userId,
        error: err.message,
      });
      reject(err);
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        logger?.warn('File not found during archive build', {
          userId,
          error: err.message,
        });
      } else {
        // Non-ENOENT warnings are treated as errors
        reject(err);
      }
    });
  });

  // --- Write manifest.json ---
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

  // --- Write data/{category}.json for each category ---
  for (const [key, value] of Object.entries(categoryData)) {
    archive.append(JSON.stringify(value, null, 2), { name: `data/${key}.json` });
  }

  // --- Copy file artifacts into archive ---
  for (const artifact of fileArtifacts) {
    try {
      // Verify file still exists with async access (avoid sync I/O in request handler)
      await fs.promises.access(artifact.sourcePath, fs.constants.R_OK);
      archive.file(artifact.sourcePath, { name: artifact.archivePath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger?.warn('File artifact unavailable for archive', {
        userId,
        path: artifact.sourcePath,
        error: message,
      });
    }
  }

  // Finalize the archive — this triggers the 'end' event
  archive.finalize();

  return { archive, finalized, manifest };
}
