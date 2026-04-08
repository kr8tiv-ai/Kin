/**
 * Training Curation Routes — Builder review of SFT training pairs
 *
 * Endpoints:
 *   GET  /training/companions                       — list companions with curation stats
 *   GET  /training/companions/:companionId/entries   — paginated training entries with verdicts
 *   PUT  /training/entries/:entryHash/verdict         — set verdict on an entry
 *   GET  /training/companions/:companionId/export     — export approved entries as JSONL
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { getCompanionIds, getCompanionConfig } from '../../companions/config.js';
import { readTrainingEntries, filterApprovedEntries } from '../../inference/training-curation.js';

// ============================================================================
// Types
// ============================================================================

interface VerdictBody {
  verdict: string;
}

interface EntriesQuery {
  page?: string;
  pageSize?: string;
}

const VALID_VERDICTS = ['approved', 'rejected', 'pending'];

// ============================================================================
// Routes
// ============================================================================

const trainingRoutes: FastifyPluginAsync = async (fastify) => {

  // --------------------------------------------------------------------------
  // GET /training/companions — list all companions with curation stats
  // --------------------------------------------------------------------------
  fastify.get('/training/companions', async (request) => {
    request.log.info('listing companions with curation stats');

    const companionIds = getCompanionIds();
    const companions = await Promise.all(companionIds.map(async (id) => {
      const config = getCompanionConfig(id);
      const entries = await readTrainingEntries(id);
      const totalEntries = entries.length;

      // Query verdict counts from DB
      const row = fastify.context.db.prepare(`
        SELECT
          COUNT(CASE WHEN verdict = 'approved' THEN 1 END) AS approved_count,
          COUNT(CASE WHEN verdict = 'rejected' THEN 1 END) AS rejected_count,
          COUNT(CASE WHEN verdict = 'pending' THEN 1 END) AS pending_count
        FROM training_curation
        WHERE companion_id = ?
      `).get(id) as { approved_count: number; rejected_count: number; pending_count: number } | undefined;

      return {
        id,
        name: config.name,
        emoji: config.emoji,
        totalEntries,
        approvedCount: row?.approved_count ?? 0,
        rejectedCount: row?.rejected_count ?? 0,
        pendingCount: row?.pending_count ?? 0,
      };
    }));

    return { companions };
  });

  // --------------------------------------------------------------------------
  // GET /training/companions/:companionId/entries — paginated entries with verdicts
  // --------------------------------------------------------------------------
  fastify.get<{ Params: { companionId: string }; Querystring: EntriesQuery }>(
    '/training/companions/:companionId/entries',
    async (request, reply) => {
      const { companionId } = request.params;
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(request.query.pageSize ?? '20', 10) || 20));

      const entries = await readTrainingEntries(companionId);
      const total = entries.length;

      // Paginate
      const start = (page - 1) * pageSize;
      const pageEntries = entries.slice(start, start + pageSize);

      // Fetch verdicts for entries on this page
      const hashes = pageEntries.map((e) => e.hash);
      const verdictMap = new Map<string, string>();

      if (hashes.length > 0) {
        // Query in batches to avoid too many SQL params — but pageSize ≤ 100 is safe
        const placeholders = hashes.map(() => '?').join(',');
        const rows = fastify.context.db.prepare(
          `SELECT entry_hash, verdict FROM training_curation WHERE entry_hash IN (${placeholders})`
        ).all(...hashes) as Array<{ entry_hash: string; verdict: string }>;

        for (const row of rows) {
          verdictMap.set(row.entry_hash, row.verdict);
        }
      }

      // Pre-seed curation rows for hashes not yet in DB so PUT /verdict
      // can always resolve companion_id via SQLite instead of scanning JSONL.
      const unseeded = hashes.filter((h) => !verdictMap.has(h));
      if (unseeded.length > 0) {
        const insertStmt = fastify.context.db.prepare(
          `INSERT OR IGNORE INTO training_curation (id, entry_hash, companion_id, verdict, created_at, updated_at)
           VALUES (?, ?, ?, 'pending', ?, ?)`
        );
        const now = Date.now();
        for (const hash of unseeded) {
          insertStmt.run(`tc-${crypto.randomUUID()}`, hash, companionId, now, now);
        }
      }

      const responseEntries = pageEntries.map((entry) => ({
        hash: entry.hash,
        messages: entry.line.messages,
        metadata: entry.line.metadata,
        verdict: verdictMap.get(entry.hash) ?? 'pending',
      }));

      return {
        entries: responseEntries,
        total,
        page,
        pageSize,
      };
    },
  );

  // --------------------------------------------------------------------------
  // PUT /training/entries/:entryHash/verdict — set verdict on an entry
  // --------------------------------------------------------------------------
  fastify.put<{ Params: { entryHash: string }; Body: VerdictBody }>(
    '/training/entries/:entryHash/verdict',
    async (request, reply) => {
      const { entryHash } = request.params;
      const body = request.body ?? {} as VerdictBody;
      const verdict = body.verdict;

      if (!verdict || !VALID_VERDICTS.includes(verdict)) {
        reply.status(400);
        return { error: `Invalid verdict. Must be one of: ${VALID_VERDICTS.join(', ')}` };
      }

      request.log.info({ entryHash: entryHash.slice(0, 12), verdict }, 'setting curation verdict');

      // Upsert — works for new and existing entries
      // We need a companion_id. If the entry already exists, keep it.
      // If it's new, we need it from the request. However, the entry_hash is
      // derived from the JSONL line which contains metadata.companionId.
      // For simplicity, look up the existing row first.
      const existing = fastify.context.db.prepare(
        `SELECT id, companion_id FROM training_curation WHERE entry_hash = ?`
      ).get(entryHash) as { id: string; companion_id: string } | undefined;

      const now = Date.now();

      if (existing) {
        fastify.context.db.prepare(
          `UPDATE training_curation SET verdict = ?, updated_at = ? WHERE entry_hash = ?`
        ).run(verdict, now, entryHash);
      } else {
        // Entries page pre-seeds curation rows, so this path only runs for
        // direct API calls with hashes not yet browsed. Use 'unknown' companion
        // — the entries endpoint will backfill companion_id when the entry
        // is next loaded from JSONL.
        const id = `tc-${crypto.randomUUID()}`;
        fastify.context.db.prepare(
          `INSERT INTO training_curation (id, entry_hash, companion_id, verdict, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(id, entryHash, 'unknown', verdict, now, now);
      }

      // Return the updated record
      const record = fastify.context.db.prepare(
        `SELECT id, entry_hash, companion_id, verdict, created_at, updated_at FROM training_curation WHERE entry_hash = ?`
      ).get(entryHash) as { id: string; entry_hash: string; companion_id: string; verdict: string; created_at: number; updated_at: number };

      return {
        id: record.id,
        entryHash: record.entry_hash,
        companionId: record.companion_id,
        verdict: record.verdict,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      };
    },
  );

  // --------------------------------------------------------------------------
  // GET /training/companions/:companionId/export — export approved entries as JSONL
  // --------------------------------------------------------------------------
  fastify.get<{ Params: { companionId: string } }>(
    '/training/companions/:companionId/export',
    async (request, reply) => {
      const { companionId } = request.params;

      request.log.info({ companionId }, 'exporting approved training entries');

      const entries = await readTrainingEntries(companionId);

      // Load approved verdicts from DB
      const rows = fastify.context.db.prepare(
        `SELECT entry_hash, verdict FROM training_curation WHERE companion_id = ?`
      ).all(companionId) as Array<{ entry_hash: string; verdict: string }>;

      const verdictMap = new Map<string, string>();
      for (const row of rows) {
        verdictMap.set(row.entry_hash, row.verdict);
      }

      const approvedLines = filterApprovedEntries(entries, verdictMap);

      reply.type('text/jsonl');
      return approvedLines.length > 0
        ? approvedLines.join('\n') + '\n'
        : '';
    },
  );
};

export default trainingRoutes;
