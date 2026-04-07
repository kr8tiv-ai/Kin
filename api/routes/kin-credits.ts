/**
 * KIN Credits Routes — Provision, revoke, and inspect user provider credentials
 *
 * REST surface for managing fee-funded API credits via PinkBrain subscriptions.
 * All routes are JWT-protected (registered inside the protected scope).
 * Responses use camelCase keys (K005).
 *
 * @module api/routes/kin-credits
 */

import { FastifyPluginAsync } from 'fastify';
import {
  CredentialManager,
  type CredentialType,
  type KinCredentialInfo,
  decryptCredential,
} from '../../inference/kin-credits.js';
import {
  getAllProviderSpecs,
  type FrontierProviderId,
} from '../../inference/providers/index.js';

// ============================================================================
// Request body types
// ============================================================================

interface ProvisionBody {
  providerId: string;
  credentialType: string;
  credential: string;
  planTier?: string;
}

interface RevokeBody {
  providerId: string;
  credentialType: string;
}

// ============================================================================
// Validation helpers
// ============================================================================

const VALID_CREDENTIAL_TYPES: CredentialType[] = ['cli', 'api'];

const VALID_PROVIDER_IDS: FrontierProviderId[] = [
  'groq', 'openai', 'anthropic', 'google', 'xai', 'moonshot',
  'zai', 'deepseek', 'mistral', 'together', 'fireworks', 'openrouter',
];

function isValidProviderId(id: string): id is FrontierProviderId {
  return VALID_PROVIDER_IDS.includes(id as FrontierProviderId);
}

function isValidCredentialType(t: string): t is CredentialType {
  return VALID_CREDENTIAL_TYPES.includes(t as CredentialType);
}

/**
 * Redact a credential info entry — show only last 4 chars of the encrypted blob
 * so the user can identify which key is provisioned without exposing secrets.
 */
function redactCredential(info: KinCredentialInfo): KinCredentialInfo & { hint: string } {
  return {
    ...info,
    hint: '****' + (info.id?.slice(-4) ?? ''),
  };
}

// ============================================================================
// Route plugin
// ============================================================================

const kinCreditsRoutes: FastifyPluginAsync = async (fastify) => {
  // Resolve CredentialManager from the server's db context
  // (initialized in server.ts and stored on kin_credits table in the same db)
  const getManager = (): CredentialManager => {
    return new CredentialManager(fastify.context.db);
  };

  // --------------------------------------------------------------------------
  // GET /kin-credits/status
  // --------------------------------------------------------------------------
  fastify.get('/kin-credits/status', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const manager = getManager();

    const systemStatus = manager.getStatus();
    const userCredentials = manager.getUserCredentials(userId).map(redactCredential);

    return {
      system: systemStatus,
      userCredentials,
    };
  });

  // --------------------------------------------------------------------------
  // POST /kin-credits/provision
  // --------------------------------------------------------------------------
  fastify.post<{ Body: ProvisionBody }>('/kin-credits/provision', async (request, reply) => {
    const body = request.body ?? ({} as ProvisionBody);
    const userId = (request.user as { userId: string }).userId;

    // Validate providerId
    if (!body.providerId || typeof body.providerId !== 'string') {
      reply.status(400);
      return { error: 'providerId is required and must be a string' };
    }
    if (!isValidProviderId(body.providerId)) {
      reply.status(400);
      return { error: `Invalid providerId. Must be one of: ${VALID_PROVIDER_IDS.join(', ')}` };
    }

    // Validate credentialType
    if (!body.credentialType || typeof body.credentialType !== 'string') {
      reply.status(400);
      return { error: 'credentialType is required and must be a string' };
    }
    if (!isValidCredentialType(body.credentialType)) {
      reply.status(400);
      return { error: `Invalid credentialType. Must be one of: ${VALID_CREDENTIAL_TYPES.join(', ')}` };
    }

    // Validate credential value
    if (!body.credential || typeof body.credential !== 'string') {
      reply.status(400);
      return { error: 'credential is required and must be a non-empty string' };
    }

    // Validate plan tier — free tier users cannot provision
    if (body.planTier === 'free') {
      reply.status(403);
      return { error: 'Free-tier users cannot provision KIN Credits. Upgrade your plan first.' };
    }

    const manager = getManager();
    const id = manager.provisionCredential(
      userId,
      body.providerId,
      body.credentialType,
      body.credential,
      body.planTier,
    );

    return {
      success: true,
      credentialId: id,
      providerId: body.providerId,
      credentialType: body.credentialType,
    };
  });

  // --------------------------------------------------------------------------
  // POST /kin-credits/revoke
  // --------------------------------------------------------------------------
  fastify.post<{ Body: RevokeBody }>('/kin-credits/revoke', async (request, reply) => {
    const body = request.body ?? ({} as RevokeBody);
    const userId = (request.user as { userId: string }).userId;

    // Validate providerId
    if (!body.providerId || typeof body.providerId !== 'string') {
      reply.status(400);
      return { error: 'providerId is required and must be a string' };
    }
    if (!isValidProviderId(body.providerId)) {
      reply.status(400);
      return { error: `Invalid providerId. Must be one of: ${VALID_PROVIDER_IDS.join(', ')}` };
    }

    // Validate credentialType
    if (!body.credentialType || typeof body.credentialType !== 'string') {
      reply.status(400);
      return { error: 'credentialType is required and must be a string' };
    }
    if (!isValidCredentialType(body.credentialType)) {
      reply.status(400);
      return { error: `Invalid credentialType. Must be one of: ${VALID_CREDENTIAL_TYPES.join(', ')}` };
    }

    const manager = getManager();
    const revoked = manager.revokeCredential(userId, body.providerId, body.credentialType);

    if (!revoked) {
      reply.status(404);
      return { error: 'No matching active credential found to revoke' };
    }

    return {
      success: true,
      providerId: body.providerId,
      credentialType: body.credentialType,
      status: 'revoked',
    };
  });

  // --------------------------------------------------------------------------
  // GET /kin-credits/providers
  // --------------------------------------------------------------------------
  fastify.get('/kin-credits/providers', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const manager = getManager();

    // Get all registered provider specs
    const specs = getAllProviderSpecs();

    // Get user's active credentials for cross-referencing
    const userCreds = manager.getUserCredentials(userId);
    const credsByProvider = new Map<string, KinCredentialInfo[]>();
    for (const cred of userCreds) {
      const existing = credsByProvider.get(cred.providerId) ?? [];
      existing.push(cred);
      credsByProvider.set(cred.providerId, existing);
    }

    // Build provider listing with user provisioning status
    const providers = specs.map((spec) => {
      const creds = credsByProvider.get(spec.providerId) ?? [];
      const activeCreds = creds.filter((c) => c.status === 'active');

      return {
        providerId: spec.providerId,
        displayName: spec.displayName,
        modelId: spec.modelId,
        contextWindow: spec.contextWindow,
        pricing: spec.pricing,
        apiConfigured: !!process.env[spec.apiKeyEnvVar],
        userProvisioned: {
          cli: activeCreds.some((c) => c.credentialType === 'cli'),
          api: activeCreds.some((c) => c.credentialType === 'api'),
        },
      };
    });

    return { providers };
  });
};

export default kinCreditsRoutes;
