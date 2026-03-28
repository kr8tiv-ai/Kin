/**
 * Telegram Webhook Route
 *
 * Receives Telegram updates via POST when the bot is running in webhook mode.
 * Uses grammy's built-in webhookCallback adapter for Fastify.
 *
 * Security: Telegram delivers updates only to the registered webhook URL.
 * An optional secret token (TELEGRAM_WEBHOOK_SECRET) can be verified in the
 * X-Telegram-Bot-Api-Secret-Token header for additional validation.
 */

import { FastifyPluginAsync } from 'fastify';
import { Bot, webhookCallback } from 'grammy';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface TelegramWebhookOpts {
  /** The grammy Bot instance (already configured with handlers). */
  bot: Bot;
  /**
   * Optional secret token that Telegram sends in the
   * X-Telegram-Bot-Api-Secret-Token header.  When set, requests without a
   * matching header are rejected with 401.
   */
  secretToken?: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const telegramWebhookRoutes: FastifyPluginAsync<TelegramWebhookOpts> = async (
  fastify,
  opts,
) => {
  const { bot, secretToken } = opts;

  // grammy's webhookCallback returns a framework-specific handler.
  // For Fastify it returns an async (request, reply) handler that reads
  // request.body, processes the Update, and replies with 200.
  const handleUpdate = webhookCallback(bot, 'fastify', {
    // When a secretToken is configured on setWebhook, grammy can verify it
    // automatically via the onTimeout / secretToken option.
    ...(secretToken ? { secretToken } : {}),
  });

  // Optional: manual secret-token guard (belt-and-suspenders with grammy's
  // own check).  This gives us a clear 401 before any grammy processing.
  if (secretToken) {
    fastify.addHook('preHandler', async (request, reply) => {
      if (request.url !== '/telegram/webhook') return;
      const header = request.headers['x-telegram-bot-api-secret-token'];
      if (header !== secretToken) {
        reply.status(401).send({ error: 'Invalid secret token' });
      }
    });
  }

  // POST /telegram/webhook  --  Telegram sends Update JSON here
  fastify.post('/telegram/webhook', async (request, reply) => {
    try {
      await handleUpdate(request, reply);
    } catch (err) {
      fastify.log.error({ err }, 'Error processing Telegram webhook update');
      // Return 200 anyway so Telegram does not retry endlessly
      if (!reply.sent) {
        reply.status(200).send({ ok: true });
      }
    }
  });

  // GET /telegram/webhook  --  convenience endpoint to check registration
  fastify.get('/telegram/webhook', async () => {
    return {
      status: 'active',
      info: 'Telegram webhook endpoint. Updates are delivered via POST.',
    };
  });
};

export default telegramWebhookRoutes;
