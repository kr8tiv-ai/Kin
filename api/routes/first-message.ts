/**
 * First Message Route — Generate a personalized first companion message for onboarding.
 *
 * POST /kin/first-message
 *   Body: { companionId, userProfile?: { displayName?, interests?, goals? } }
 *   Returns: { message, companionId, route, latencyMs }
 *
 * Called by the onboarding flow after the user completes setup. Uses the
 * two-brain supervisor to generate a warm, in-character greeting that
 * references the user's profile.
 */

import { FastifyPluginAsync } from 'fastify';
import { supervisedChat } from '../../inference/supervisor.js';
import { FallbackHandler, type Message } from '../../inference/fallback-handler.js';
import { buildCompanionPrompt, getAvailableCompanions } from '../../inference/companion-prompts.js';

// ============================================================================
// Types
// ============================================================================

interface FirstMessageBody {
  companionId: string;
  userProfile?: {
    displayName?: string;
    interests?: string[];
    goals?: string[];
  };
}

// ============================================================================
// Shared fallback handler (singleton per process)
// ============================================================================

let fallback: FallbackHandler | null = null;

function getFallback(): FallbackHandler {
  if (!fallback) {
    fallback = new FallbackHandler(
      { preferredProvider: process.env.GROQ_API_KEY ? 'groq' : undefined },
      {
        groq: {
          apiKey: process.env.GROQ_API_KEY,
          model: process.env.GROQ_MODEL ?? 'qwen/qwen3-32b',
        },
        openai: {
          apiKey: process.env.OPENAI_API_KEY,
        },
        anthropic: {
          apiKey: process.env.ANTHROPIC_API_KEY,
        },
      },
    );
  }
  return fallback;
}

// ============================================================================
// Route
// ============================================================================

const firstMessageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: FirstMessageBody }>('/kin/first-message', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['companionId'],
        properties: {
          companionId: { type: 'string' as const, minLength: 1, maxLength: 64 },
          userProfile: {
            type: 'object' as const,
            properties: {
              displayName: { type: 'string' as const, maxLength: 100 },
              interests: { type: 'array' as const, items: { type: 'string' as const }, maxItems: 20 },
              goals: { type: 'array' as const, items: { type: 'string' as const }, maxItems: 20 },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { companionId, userProfile } = request.body;

    // Validate companion exists
    if (!getAvailableCompanions().includes(companionId)) {
      reply.status(404);
      return { error: 'Companion not found' };
    }

    const name = userProfile?.displayName || 'friend';
    const interests = userProfile?.interests?.length
      ? userProfile.interests.join(', ')
      : 'exploring new things';
    const goals = userProfile?.goals?.length
      ? userProfile.goals.join(', ')
      : 'learning and growing';

    // Build a system prompt + first-message instruction
    const systemPrompt = buildCompanionPrompt(companionId);
    const firstMessageInstruction =
      `This is your very first message to a new user named ${name} ` +
      `who is interested in ${interests}. Their goals include: ${goals}. ` +
      `Greet them warmly and show you understand their interests and goals. ` +
      `Keep it under 100 words. Be natural and in-character.`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: firstMessageInstruction },
    ];

    const userId = (request.user as { userId: string }).userId;

    try {
      const result = await supervisedChat(messages, companionId, getFallback(), {
        userId,
        taskType: 'chat',
      });

      console.log(
        `[first-message] Generated for ${companionId} | user=${userId} | ` +
        `route=${result.route} | ${Math.round(result.latencyMs)}ms`,
      );

      return {
        message: result.content,
        companionId,
        route: result.route,
        latencyMs: Math.round(result.latencyMs),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.error({ err }, `[first-message] Failed: ${msg}`);
      reply.status(500);
      return { error: 'Failed to generate first companion message' };
    }
  });
};

export default firstMessageRoutes;
