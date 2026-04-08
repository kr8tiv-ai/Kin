/**
 * First Message Routes - Personalized onboarding handoff into a real conversation.
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { getCompanionConfig } from '../../companions/config.js';

interface FirstMessageBody {
  companionId: string;
}

interface PreferencesRow {
  display_name: string | null;
  experience_level: 'beginner' | 'intermediate' | 'advanced' | null;
  goals: string | null;
  language: string | null;
  tone: 'friendly' | 'professional' | 'casual' | 'technical' | null;
  privacy_mode: 'private' | 'shared' | null;
}

interface MemoryRow {
  memory_type: 'personal' | 'preference' | 'context' | 'event';
  content: string;
}

interface SoulRow {
  custom_name: string | null;
}

const STARTER_REPLIES: Record<string, string[]> = {
  cipher: [
    'Help me make something beautiful',
    'Can you guide me without jargon?',
    'What should we work on first?',
  ],
  mischief: [
    'Help me get organized this week',
    'I want support with my brand',
    'Give me one useful thing we can do now',
  ],
  vortex: [
    'Help me find the best next move',
    'Can you simplify the strategy for me?',
    'What should we focus on first?',
  ],
  forge: [
    'Help me fix something that feels stuck',
    'Review my setup and tell me what matters',
    'Guide me step by step',
  ],
  aether: [
    'Help me find the right words',
    'Give me a creative starting point',
    'What should we make together?',
  ],
  catalyst: [
    'Help me get my life in order',
    'Give me a simple plan I can stick to',
    'What small win should we start with?',
  ],
};

function parseGoals(raw: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function extractMemoryValue(memories: MemoryRow[], prefix: string): string | null {
  const row = memories.find((memory) => memory.content.startsWith(prefix));
  if (!row) return null;
  const value = row.content.slice(prefix.length).trim();
  return value || null;
}

function buildToneLine(
  tone: PreferencesRow['tone'],
  experienceLevel: PreferencesRow['experience_level'],
): string {
  const toneLine =
    tone === 'professional'
      ? 'I will keep things polished and focused.'
      : tone === 'casual'
        ? 'I will keep things relaxed and natural.'
        : tone === 'technical'
          ? 'I can go deep when you want precision.'
          : 'I will keep things warm, clear, and easy to follow.';

  const experienceLine =
    experienceLevel === 'beginner'
      ? 'I will explain things without assuming background knowledge.'
      : experienceLevel === 'advanced'
        ? 'I can move fast and skip the basics when that helps.'
        : 'I will match your pace and adjust as we go.';

  return `${toneLine} ${experienceLine}`;
}

function buildWelcomeMessage(input: {
  companionName: string;
  userDisplayName: string | null;
  tagline: string;
  goals: string[];
  currentProject: string | null;
  occupation: string | null;
  interests: string | null;
  tone: PreferencesRow['tone'];
  experienceLevel: PreferencesRow['experience_level'];
  privacyMode: PreferencesRow['privacy_mode'];
}): string {
  const greetingName = input.userDisplayName?.trim() || 'friend';
  const intro = `Hi ${greetingName} - I'm ${input.companionName}. I'm here to help with ${input.tagline.toLowerCase()}.`;

  const contextLines: string[] = [];

  if (input.currentProject) {
    contextLines.push(`I already know you're working on ${input.currentProject}.`);
  } else if (input.occupation) {
    contextLines.push(`I know your world includes ${input.occupation}, so I'll meet you there.`);
  }

  if (input.goals.length > 0) {
    const goalsSummary = input.goals.slice(0, 2).join(' and ');
    contextLines.push(`A good first direction for us is ${goalsSummary.toLowerCase()}.`);
  }

  if (input.interests) {
    contextLines.push(`I'll keep your interests in mind too: ${input.interests}.`);
  }

  const toneLine = buildToneLine(input.tone, input.experienceLevel);
  const privacyLine =
    input.privacyMode === 'private'
      ? "You've chosen privacy first, so I'll be careful and keep sensitive help as local as possible."
      : "You've allowed a smarter shared mode, so I can reach for heavier help when it genuinely improves the result.";

  return [intro, ...contextLines, toneLine, privacyLine]
    .filter(Boolean)
    .join(' ');
}

function buildSuggestedReplies(input: {
  companionId: string;
  currentProject: string | null;
  goals: string[];
}): string[] {
  const starterReplies =
    STARTER_REPLIES[input.companionId] ?? STARTER_REPLIES.cipher ?? [];
  const baseReplies = [...starterReplies];
  const primaryGoal = input.goals[0];

  if (input.currentProject) {
    baseReplies[0] = `Help me with ${input.currentProject}`;
  } else if (primaryGoal) {
    baseReplies[0] = `Help me with ${primaryGoal}`;
  }

  return baseReplies.slice(0, 3);
}

const firstMessageRoutes: FastifyPluginAsync = async (fastify) => {
  const schema = {
    body: {
      type: 'object' as const,
      required: ['companionId'],
      properties: {
        companionId: { type: 'string' as const, minLength: 1, maxLength: 64 },
      },
      additionalProperties: false,
    },
  };

  const registerPath = async (path: string) => {
    await fastify.post<{ Body: FirstMessageBody }>(path, { schema }, async (request, reply) => {
      const userId = (request.user as { userId: string }).userId;
      const { companionId } = request.body;

      const claimed = fastify.context.db.prepare(`
        SELECT 1
        FROM user_companions
        WHERE user_id = ? AND companion_id = ?
      `).get(userId, companionId);

      if (!claimed) {
        reply.status(404);
        return { error: 'Companion not found for user' };
      }

      const preferences = fastify.context.db.prepare(`
        SELECT display_name, experience_level, goals, language, tone, privacy_mode
        FROM user_preferences
        WHERE user_id = ?
      `).get(userId) as PreferencesRow | undefined;

      const memories = fastify.context.db.prepare(`
        SELECT memory_type, content
        FROM memories
        WHERE user_id = ? AND companion_id = ?
        ORDER BY created_at ASC
        LIMIT 20
      `).all(userId, companionId) as MemoryRow[];

      const soul = fastify.context.db.prepare(`
        SELECT custom_name
        FROM companion_souls
        WHERE user_id = ? AND companion_id = ?
      `).get(userId, companionId) as SoulRow | undefined;

      const companion = getCompanionConfig(companionId);
      const companionName = soul?.custom_name?.trim() || companion.name;
      const goals = parseGoals(preferences?.goals ?? null);
      const currentProject = extractMemoryValue(memories, 'Currently working on: ');
      const occupation = extractMemoryValue(memories, 'Occupation/Industry: ');
      const interests = extractMemoryValue(memories, 'Interests: ');

      const welcomeMessage = buildWelcomeMessage({
        companionName,
        userDisplayName: preferences?.display_name ?? null,
        tagline: companion.tagline,
        goals,
        currentProject,
        occupation,
        interests,
        tone: preferences?.tone ?? 'friendly',
        experienceLevel: preferences?.experience_level ?? 'beginner',
        privacyMode: preferences?.privacy_mode ?? 'private',
      });

      const suggestedReplies = buildSuggestedReplies({
        companionId,
        currentProject,
        goals,
      });

      const conversationId = `conv-${crypto.randomUUID()}`;
      const messageId = crypto.randomUUID();

      fastify.context.db.prepare(`
        INSERT INTO conversations (id, user_id, companion_id, title, metadata)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        conversationId,
        userId,
        companionId,
        `Meet ${companionName}`,
        JSON.stringify({
          source: 'onboarding',
          suggestedReplies,
        }),
      );

      fastify.context.db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, provider, model, metadata)
        VALUES (?, ?, 'assistant', ?, ?, ?, ?)
      `).run(
        messageId,
        conversationId,
        welcomeMessage,
        'local',
        'starter-seed',
        JSON.stringify({
          source: 'onboarding',
          suggestedReplies,
        }),
      );

      return {
        conversationId,
        companionId,
        companionName,
        welcomeMessage,
        suggestedReplies,
      };
    });
  };

  await registerPath('/first-message');
  await registerPath('/kin/first-message');
};

export default firstMessageRoutes;
