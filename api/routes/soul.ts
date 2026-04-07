/**
 * Soul Routes — Companion personality authoring + drift detection.
 *
 * GET    /soul/:companionId            Get user's soul config
 * PUT    /soul/:companionId            Create/update soul config
 * GET    /soul/:companionId/preview    Sample message from companion with soul
 * POST   /soul/:companionId/calibrate  Re-score drift against recent messages
 * GET    /soul/export/:companionId     Export as soul.md markdown
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { configToSoulMd } from '../../inference/soul-bridge.js';
import type { SoulTraits, SoulStyle, SoulConfigBody } from '../../inference/soul-types.js';

// ---------------------------------------------------------------------------
// JSON Schemas
// ---------------------------------------------------------------------------

const soulConfigSchema = {
  type: 'object' as const,
  required: ['traits', 'values', 'style', 'customInstructions', 'boundaries', 'antiPatterns'],
  properties: {
    customName: { type: 'string' as const, maxLength: 50 },
    traits: {
      type: 'object' as const,
      required: ['warmth', 'formality', 'humor', 'directness', 'creativity', 'depth'],
      properties: {
        warmth: { type: 'number' as const, minimum: 0, maximum: 100 },
        formality: { type: 'number' as const, minimum: 0, maximum: 100 },
        humor: { type: 'number' as const, minimum: 0, maximum: 100 },
        directness: { type: 'number' as const, minimum: 0, maximum: 100 },
        creativity: { type: 'number' as const, minimum: 0, maximum: 100 },
        depth: { type: 'number' as const, minimum: 0, maximum: 100 },
      },
    },
    values: { type: 'array' as const, items: { type: 'string' as const, maxLength: 50 }, maxItems: 10 },
    style: {
      type: 'object' as const,
      required: ['vocabulary', 'responseLength', 'useEmoji'],
      properties: {
        vocabulary: { type: 'string' as const, enum: ['simple', 'moderate', 'advanced'] },
        responseLength: { type: 'string' as const, enum: ['concise', 'balanced', 'detailed'] },
        useEmoji: { type: 'boolean' as const },
      },
    },
    customInstructions: { type: 'string' as const, maxLength: 500 },
    boundaries: { type: 'array' as const, items: { type: 'string' as const, maxLength: 200 }, maxItems: 10 },
    antiPatterns: { type: 'array' as const, items: { type: 'string' as const, maxLength: 200 }, maxItems: 10 },
  },
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeHash(config: SoulConfigBody): string {
  return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

function parseSoulRow(row: any): any {
  return {
    id: row.id,
    companionId: row.companion_id,
    config: {
      customName: row.custom_name ?? undefined,
      traits: JSON.parse(row.traits || '{}'),
      values: JSON.parse(row.soul_values || '[]'),
      style: JSON.parse(row.style || '{}'),
      customInstructions: row.custom_instructions ?? '',
      boundaries: JSON.parse(row.boundaries || '[]'),
      antiPatterns: JSON.parse(row.anti_patterns || '[]'),
    },
    soulHash: row.soul_hash,
    driftScore: row.drift_score,
    lastCalibratedAt: row.last_calibrated_at
      ? new Date(row.last_calibrated_at).toISOString()
      : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const soulRoutes: FastifyPluginAsync = async (fastify) => {

  // ── GET /soul/:companionId ───────────────────────────────────────────────
  fastify.get<{ Params: { companionId: string } }>('/soul/:companionId', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId } = request.params;

    const row = fastify.context.db.prepare(
      `SELECT * FROM companion_souls WHERE user_id = ? AND companion_id = ?`,
    ).get(userId, companionId) as any;

    if (!row) {
      return { soul: null };
    }

    return { soul: parseSoulRow(row) };
  });

  // ── PUT /soul/:companionId ───────────────────────────────────────────────
  fastify.put<{
    Params: { companionId: string };
    Body: SoulConfigBody;
  }>('/soul/:companionId', { schema: { body: soulConfigSchema } } as any, async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId } = request.params;
    const config = request.body;
    const hash = computeHash(config);
    const now = Date.now();

    // UPSERT
    const existing = fastify.context.db.prepare(
      `SELECT id FROM companion_souls WHERE user_id = ? AND companion_id = ?`,
    ).get(userId, companionId) as any;

    if (existing) {
      fastify.context.db.prepare(`
        UPDATE companion_souls SET
          custom_name = ?, traits = ?, soul_values = ?, style = ?,
          custom_instructions = ?, boundaries = ?, anti_patterns = ?,
          soul_hash = ?, drift_score = 1.0, updated_at = ?
        WHERE id = ?
      `).run(
        config.customName ?? null,
        JSON.stringify(config.traits),
        JSON.stringify(config.values),
        JSON.stringify(config.style),
        config.customInstructions,
        JSON.stringify(config.boundaries),
        JSON.stringify(config.antiPatterns),
        hash,
        now,
        existing.id,
      );
    } else {
      const id = `soul-${crypto.randomUUID()}`;
      fastify.context.db.prepare(`
        INSERT INTO companion_souls
          (id, user_id, companion_id, custom_name, traits, soul_values, style,
           custom_instructions, boundaries, anti_patterns, soul_hash, drift_score, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0, ?, ?)
      `).run(
        id, userId, companionId,
        config.customName ?? null,
        JSON.stringify(config.traits),
        JSON.stringify(config.values),
        JSON.stringify(config.style),
        config.customInstructions,
        JSON.stringify(config.boundaries),
        JSON.stringify(config.antiPatterns),
        hash,
        now, now,
      );
    }

    return { success: true, soulHash: hash };
  });

  // ── POST /soul/:companionId/calibrate ────────────────────────────────────
  fastify.post<{ Params: { companionId: string } }>('/soul/:companionId/calibrate', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId } = request.params;

    const soul = fastify.context.db.prepare(
      `SELECT * FROM companion_souls WHERE user_id = ? AND companion_id = ?`,
    ).get(userId, companionId) as any;

    if (!soul) {
      return reply.notFound('No soul config found for this companion');
    }

    // Get recent assistant messages for this companion
    const messages = fastify.context.db.prepare(`
      SELECT m.content FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ? AND c.companion_id = ? AND m.role = 'assistant'
      ORDER BY m.created_at DESC
      LIMIT 20
    `).all(userId, companionId) as { content: string }[];

    if (messages.length < 3) {
      return { driftScore: 1.0, message: 'Not enough messages to calibrate (need at least 3)' };
    }

    // Dynamic import to avoid circular deps
    const { scoreDrift } = await import('../../inference/soul-drift.js');
    const config: SoulConfigBody = {
      customName: soul.custom_name,
      traits: JSON.parse(soul.traits),
      values: JSON.parse(soul.soul_values),
      style: JSON.parse(soul.style),
      customInstructions: soul.custom_instructions,
      boundaries: JSON.parse(soul.boundaries),
      antiPatterns: JSON.parse(soul.anti_patterns),
    };

    const driftScore = scoreDrift(config, messages);

    // Update DB
    fastify.context.db.prepare(`
      UPDATE companion_souls SET drift_score = ?, last_calibrated_at = ? WHERE id = ?
    `).run(driftScore, Date.now(), soul.id);

    return { driftScore, messageCount: messages.length };
  });

  // ── GET /soul/export/:companionId ────────────────────────────────────────
  fastify.get<{ Params: { companionId: string } }>('/soul/export/:companionId', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId } = request.params;

    const soul = fastify.context.db.prepare(
      `SELECT * FROM companion_souls WHERE user_id = ? AND companion_id = ?`,
    ).get(userId, companionId) as any;

    if (!soul) {
      return reply.notFound('No soul config found for this companion');
    }

    const config: SoulConfigBody = {
      customName: soul.custom_name,
      traits: JSON.parse(soul.traits),
      values: JSON.parse(soul.soul_values),
      style: JSON.parse(soul.style),
      customInstructions: soul.custom_instructions,
      boundaries: JSON.parse(soul.boundaries),
      antiPatterns: JSON.parse(soul.anti_patterns),
    };

    // Get companion name
    const companion = fastify.context.db.prepare(
      `SELECT name FROM companions WHERE id = ?`,
    ).get(companionId) as { name: string } | undefined;

    const markdown = configToSoulMd(config, companion?.name);

    reply.type('text/markdown').send(markdown);
  });

  // ── GET /soul/:companionId/preview ───────────────────────────────────────
  fastify.get<{ Params: { companionId: string } }>('/soul/:companionId/preview', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId } = request.params;

    const soul = fastify.context.db.prepare(
      `SELECT * FROM companion_souls WHERE user_id = ? AND companion_id = ?`,
    ).get(userId, companionId) as any;

    if (!soul) {
      return { preview: null };
    }

    const config: SoulConfigBody = {
      customName: soul.custom_name,
      traits: JSON.parse(soul.traits),
      values: JSON.parse(soul.soul_values),
      style: JSON.parse(soul.style),
      customInstructions: soul.custom_instructions,
      boundaries: JSON.parse(soul.boundaries),
      antiPatterns: JSON.parse(soul.anti_patterns),
    };

    // Generate a preview greeting client-side style (no LLM call for speed)
    const preview = generatePreviewGreeting(config);
    return { preview };
  });
};

// ---------------------------------------------------------------------------
// Preview greeting generator (no LLM — template-based)
// ---------------------------------------------------------------------------

function generatePreviewGreeting(config: SoulConfigBody): string {
  const { traits } = config;

  // Build greeting parts based on trait intensities
  let greeting = '';
  let body = '';
  let signoff = '';

  // Warmth + Formality determine greeting style
  if (traits.warmth > 70 && traits.formality < 40) {
    greeting = traits.humor > 60 ? 'Hey there! 👋' : 'Hey! Great to meet you!';
  } else if (traits.warmth > 70 && traits.formality >= 40) {
    greeting = 'Hello! It\'s wonderful to meet you.';
  } else if (traits.warmth <= 30) {
    greeting = traits.formality > 60 ? 'Good day.' : 'Hey.';
  } else {
    greeting = traits.formality > 60 ? 'Hello there.' : 'Hi, nice to meet you!';
  }

  // Depth determines body length
  if (traits.depth > 70) {
    body = ' I\'m here to help you with whatever you need — whether it\'s diving deep into complex problems, exploring creative ideas, or just having a thoughtful conversation. I love getting into the details.';
  } else if (traits.depth < 30) {
    body = ' I\'m here to help. What do you need?';
  } else {
    body = ' I\'m ready to help you out. Just let me know what you\'re working on.';
  }

  // Humor adds flavor
  if (traits.humor > 70) {
    signoff = ' Let\'s make something awesome! 🚀';
  } else if (traits.directness > 70) {
    signoff = ' No fluff — just tell me what you need.';
  } else {
    signoff = '';
  }

  return `${greeting}${body}${signoff}`;
}

export default soulRoutes;
