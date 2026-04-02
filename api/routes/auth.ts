/**
 * Auth Routes - Authentication endpoints
 * Supports: Telegram Login, Google OAuth, Solana Wallet Sign-In, Email/Password
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';

// ============================================================================
// Google OAuth — verify ID token via Google's tokeninfo endpoint
// ============================================================================

interface GoogleTokenInfo {
  iss: string;
  sub: string;       // Google user ID
  email: string;
  email_verified: string;
  name: string;
  given_name: string;
  family_name?: string;
  picture?: string;
  aud: string;        // Must match our client ID
  exp: string;
}

async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<GoogleTokenInfo | null> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) return null;
    const info = await res.json() as GoogleTokenInfo;
    // Verify audience matches our client ID
    if (info.aud !== clientId) return null;
    // Verify issuer
    if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') return null;
    // Verify not expired
    if (Number(info.exp) < Date.now() / 1000) return null;
    return info;
  } catch {
    return null;
  }
}

// ============================================================================
// Solana Sign-In — verify Ed25519 signature of a challenge nonce
// ============================================================================

// In-memory nonce store (TTL 5 minutes)
const nonceStore = new Map<string, { walletAddress: string; message: string; expiresAt: number }>();

// Clean expired nonces every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [nonce, data] of nonceStore) {
    if (data.expiresAt < now) nonceStore.delete(nonce);
  }
}, 60_000);

async function verifyEd25519Signature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  try {
    const key = await crypto.webcrypto.subtle.importKey(
      'raw',
      publicKey,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.webcrypto.subtle.verify('Ed25519', key, signature, message);
  } catch {
    return false;
  }
}

// Base58 decode (Solana wallet addresses)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(str: string): Uint8Array {
  const bytes = [0];
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) throw new Error(`Invalid base58 character: ${char}`);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of str) {
    if (char !== '1') break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

interface TelegramAuth {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// JSON Schema for Telegram auth payload validation
const telegramAuthSchema = {
  type: 'object' as const,
  required: ['id', 'first_name', 'auth_date', 'hash'],
  properties: {
    id: { type: 'number' as const },
    first_name: { type: 'string' as const, minLength: 1, maxLength: 256 },
    last_name: { type: 'string' as const, maxLength: 256 },
    username: { type: 'string' as const, maxLength: 64 },
    photo_url: { type: 'string' as const, maxLength: 1024 },
    auth_date: { type: 'number' as const },
    hash: { type: 'string' as const, minLength: 64, maxLength: 64 },
  },
  additionalProperties: false,
};

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Telegram login widget verification
  fastify.post<{ Body: TelegramAuth }>('/auth/telegram', {
    schema: { body: telegramAuthSchema },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  } as any, async (request, reply) => {
    const telegramData = request.body;
    
    // Verify Telegram hash
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      reply.status(500);
      return { error: 'Telegram bot token not configured' };
    }

    // Create check string
    const { hash, ...data } = telegramData;
    const checkString = Object.keys(data)
      .sort()
      .map((key) => `${key}=${(data as any)[key]}`)
      .join('\n');

    // Verify hash (simplified - in production use proper Telegram verification)
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'))) {
      reply.status(401);
      return { error: 'Invalid Telegram authentication' };
    }

    // Check auth date (must be within 24 hours)
    const authAge = Date.now() / 1000 - telegramData.auth_date;
    if (authAge > 86400) {
      reply.status(401);
      return { error: 'Authentication expired' };
    }

    // Find or create user
    let user = fastify.context.db.prepare(`
      SELECT * FROM users WHERE telegram_id = ?
    `).get(telegramData.id) as any;

    if (!user) {
      const userId = `user-${crypto.randomUUID()}`;
      fastify.context.db.prepare(`
        INSERT INTO users (id, telegram_id, first_name, last_name, username)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        userId,
        telegramData.id,
        telegramData.first_name,
        telegramData.last_name ?? null,
        telegramData.username ?? null
      );

      user = fastify.context.db.prepare(`
        SELECT * FROM users WHERE id = ?
      `).get(userId) as any;
    }

    // Generate JWT (expiry configured at server level)
    const token = fastify.jwt.sign({
      userId: user.id,
      telegramId: user.telegram_id,
      tier: user.tier,
    });

    return {
      token,
      user: {
        id: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        tier: user.tier,
      },
    };
  });

  // Verify token
  fastify.get('/auth/verify', async (request) => {
    try {
      const decoded = await request.jwtVerify() as { userId: string };

      const user = fastify.context.db.prepare(`
        SELECT * FROM users WHERE id = ?
      `).get(decoded.userId) as any;

      if (!user) {
        return { valid: false };
      }

      // Check onboarding status
      const prefs = fastify.context.db.prepare(`
        SELECT onboarding_complete FROM user_preferences WHERE user_id = ?
      `).get(decoded.userId) as any;

      return {
        valid: true,
        userId: decoded.userId,
        user: {
          id: user.id,
          telegramId: user.telegram_id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          tier: user.tier,
          email: user.email ?? null,
          walletAddress: user.wallet_address ?? null,
          authProvider: user.auth_provider ?? 'telegram',
          createdAt: new Date(user.created_at).toISOString(),
          onboardingComplete: prefs?.onboarding_complete === 1,
        },
      };
    } catch {
      return { valid: false };
    }
  });

  // ========================================================================
  // Google OAuth — verify Google ID token and create/find user
  // ========================================================================
  fastify.post<{ Body: { idToken: string } }>(
    '/auth/google',
    {
      schema: {
        body: {
          type: 'object' as const,
          required: ['idToken'],
          properties: { idToken: { type: 'string' as const } },
        },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    } as any,
    async (request, reply) => {
      const { idToken } = request.body;
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        reply.status(500);
        return { error: 'Google OAuth not configured' };
      }

      const googleUser = await verifyGoogleIdToken(idToken, clientId);
      if (!googleUser) {
        reply.status(401);
        return { error: 'Invalid Google authentication' };
      }

      // Find user by google_id or email
      let user = fastify.context.db.prepare(
        `SELECT * FROM users WHERE google_id = ?`
      ).get(googleUser.sub) as any;

      if (!user) {
        // Try matching by email (link accounts)
        user = fastify.context.db.prepare(
          `SELECT * FROM users WHERE email = ?`
        ).get(googleUser.email) as any;

        if (user) {
          // Link Google to existing account
          fastify.context.db.prepare(
            `UPDATE users SET google_id = ?, email = ?, auth_provider = CASE WHEN auth_provider = 'telegram' THEN 'telegram,google' ELSE auth_provider || ',google' END WHERE id = ?`
          ).run(googleUser.sub, googleUser.email, user.id);
        }
      }

      if (!user) {
        // Create new user — use a negative synthetic telegram_id to satisfy NOT NULL constraint
        const userId = `user-${crypto.randomUUID()}`;
        const syntheticTelegramId = -(Date.now() % 2_000_000_000);
        fastify.context.db.prepare(`
          INSERT INTO users (id, telegram_id, first_name, last_name, google_id, email, auth_provider)
          VALUES (?, ?, ?, ?, ?, ?, 'google')
        `).run(
          userId,
          syntheticTelegramId,
          googleUser.given_name,
          googleUser.family_name ?? null,
          googleUser.sub,
          googleUser.email,
        );

        user = fastify.context.db.prepare(
          `SELECT * FROM users WHERE id = ?`
        ).get(userId) as any;
      }

      const token = fastify.jwt.sign({
        userId: user.id,
        telegramId: user.telegram_id,
        tier: user.tier,
      });

      return {
        token,
        user: {
          id: user.id,
          telegramId: String(user.telegram_id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          tier: user.tier,
          email: user.email,
          walletAddress: user.wallet_address,
          authProvider: user.auth_provider,
        },
      };
    }
  );

  // ========================================================================
  // Solana Wallet Sign-In — nonce-based Ed25519 signature verification
  // ========================================================================

  // Step 1: Get a challenge nonce
  fastify.post<{ Body: { walletAddress: string } }>(
    '/auth/solana/nonce',
    {
      schema: {
        body: {
          type: 'object' as const,
          required: ['walletAddress'],
          properties: { walletAddress: { type: 'string' as const, minLength: 32, maxLength: 44 } },
        },
      },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    } as any,
    async (request) => {
      const { walletAddress } = request.body;
      const nonce = crypto.randomUUID();
      const message = `Sign in to KIN with your Solana wallet.\n\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`;
      nonceStore.set(nonce, {
        walletAddress,
        message,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });
      return { nonce, message };
    }
  );

  // Step 2: Verify signed message
  fastify.post<{ Body: { walletAddress: string; nonce: string; signature: string } }>(
    '/auth/solana',
    {
      schema: {
        body: {
          type: 'object' as const,
          required: ['walletAddress', 'nonce', 'signature'],
          properties: {
            walletAddress: { type: 'string' as const },
            nonce: { type: 'string' as const },
            signature: { type: 'string' as const },
          },
        },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    } as any,
    async (request, reply) => {
      const { walletAddress, nonce, signature } = request.body;

      // Validate nonce
      const nonceData = nonceStore.get(nonce);
      if (!nonceData || nonceData.walletAddress !== walletAddress) {
        reply.status(401);
        return { error: 'Invalid or expired nonce' };
      }
      if (nonceData.expiresAt < Date.now()) {
        nonceStore.delete(nonce);
        reply.status(401);
        return { error: 'Nonce expired' };
      }
      nonceStore.delete(nonce); // Single use

      // Use the exact message that was sent to the client for signing
      const messageBytes = new TextEncoder().encode(nonceData.message);
      const signatureBytes = Buffer.from(signature, 'base64');
      const publicKeyBytes = base58Decode(walletAddress);

      const valid = await verifyEd25519Signature(messageBytes, signatureBytes, publicKeyBytes);

      // For development, allow unsigned requests (Phantom may not be available)
      if (!valid && fastify.context.config.environment !== 'development') {
        reply.status(401);
        return { error: 'Invalid signature' };
      }

      // Find or create user by wallet address
      let user = fastify.context.db.prepare(
        `SELECT * FROM users WHERE wallet_address = ?`
      ).get(walletAddress) as any;

      if (!user) {
        const userId = `user-${crypto.randomUUID()}`;
        const syntheticTelegramId = -(Date.now() % 2_000_000_000 + Math.floor(Math.random() * 1000));
        const shortAddr = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
        fastify.context.db.prepare(`
          INSERT INTO users (id, telegram_id, first_name, wallet_address, auth_provider)
          VALUES (?, ?, ?, ?, 'solana')
        `).run(userId, syntheticTelegramId, shortAddr, walletAddress);

        user = fastify.context.db.prepare(
          `SELECT * FROM users WHERE id = ?`
        ).get(userId) as any;
      }

      const token = fastify.jwt.sign({
        userId: user.id,
        telegramId: user.telegram_id,
        tier: user.tier,
      });

      return {
        token,
        user: {
          id: user.id,
          telegramId: String(user.telegram_id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          tier: user.tier,
          walletAddress: user.wallet_address,
          authProvider: user.auth_provider,
        },
      };
    }
  );

  // ========================================================================
  // Email Registration & Login
  // ========================================================================

  fastify.post<{ Body: { email: string; password: string; firstName: string } }>(
    '/auth/email/register',
    {
      schema: {
        body: {
          type: 'object' as const,
          required: ['email', 'password', 'firstName'],
          properties: {
            email: { type: 'string' as const, format: 'email', maxLength: 320 },
            password: { type: 'string' as const, minLength: 8, maxLength: 128 },
            firstName: { type: 'string' as const, minLength: 1, maxLength: 128 },
          },
        },
      },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    } as any,
    async (request, reply) => {
      const { email, password, firstName } = request.body;
      const normalizedEmail = email.toLowerCase().trim();

      // Check if email already registered
      const existing = fastify.context.db.prepare(
        `SELECT id FROM users WHERE email = ?`
      ).get(normalizedEmail) as any;

      if (existing) {
        reply.status(409);
        return { error: 'An account with this email already exists. Try signing in.' };
      }

      // Hash password with scrypt
      const salt = crypto.randomBytes(16);
      const hash = await new Promise<Buffer>((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        });
      });
      const passwordHash = `${salt.toString('hex')}:${hash.toString('hex')}`;

      const userId = `user-${crypto.randomUUID()}`;
      const syntheticTelegramId = -(Date.now() % 2_000_000_000 + Math.floor(Math.random() * 1000));

      fastify.context.db.prepare(`
        INSERT INTO users (id, telegram_id, first_name, email, password_hash, auth_provider)
        VALUES (?, ?, ?, ?, ?, 'email')
      `).run(userId, syntheticTelegramId, firstName, normalizedEmail, passwordHash);

      const user = fastify.context.db.prepare(
        `SELECT * FROM users WHERE id = ?`
      ).get(userId) as any;

      const token = fastify.jwt.sign({
        userId: user.id,
        telegramId: user.telegram_id,
        tier: user.tier,
      });

      return {
        token,
        user: {
          id: user.id,
          telegramId: String(user.telegram_id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          tier: user.tier,
          email: user.email,
          authProvider: user.auth_provider,
        },
      };
    }
  );

  fastify.post<{ Body: { email: string; password: string } }>(
    '/auth/email/login',
    {
      schema: {
        body: {
          type: 'object' as const,
          required: ['email', 'password'],
          properties: {
            email: { type: 'string' as const, maxLength: 320 },
            password: { type: 'string' as const, maxLength: 128 },
          },
        },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    } as any,
    async (request, reply) => {
      const { email, password } = request.body;
      const normalizedEmail = email.toLowerCase().trim();

      const user = fastify.context.db.prepare(
        `SELECT * FROM users WHERE email = ?`
      ).get(normalizedEmail) as any;

      if (!user || !user.password_hash) {
        reply.status(401);
        return { error: 'Invalid email or password' };
      }

      // Verify password
      const [saltHex, hashHex] = user.password_hash.split(':');
      const salt = Buffer.from(saltHex, 'hex');
      const storedHash = Buffer.from(hashHex, 'hex');

      const derivedKey = await new Promise<Buffer>((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      if (!crypto.timingSafeEqual(storedHash, derivedKey)) {
        reply.status(401);
        return { error: 'Invalid email or password' };
      }

      const token = fastify.jwt.sign({
        userId: user.id,
        telegramId: user.telegram_id,
        tier: user.tier,
      });

      return {
        token,
        user: {
          id: user.id,
          telegramId: String(user.telegram_id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          tier: user.tier,
          email: user.email,
          authProvider: user.auth_provider,
        },
      };
    }
  );

  // ========================================================================
  // X (Twitter) OAuth 2.0 — Authorization Code Flow with PKCE
  // ========================================================================

  // In-memory PKCE verifier store (TTL 10 minutes)
  const xPkceStore = new Map<string, { codeVerifier: string; expiresAt: number }>();

  // Clean expired PKCE entries every 60 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [state, data] of xPkceStore) {
      if (data.expiresAt < now) xPkceStore.delete(state);
    }
  }, 60_000);

  // Step 1: Generate PKCE challenge and return authorize URL
  fastify.post(
    '/auth/x/authorize',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    } as any,
    async () => {
      const clientId = process.env.X_CLIENT_ID;
      if (!clientId) {
        throw new Error('X OAuth not configured');
      }

      // Generate PKCE code_verifier (64 random bytes, base64url)
      const codeVerifier = crypto.randomBytes(64)
        .toString('base64url');

      // Generate code_challenge (SHA-256 of verifier, base64url)
      const codeChallenge = crypto.createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      // Generate state for CSRF protection
      const state = crypto.randomUUID();

      // Store verifier keyed by state
      xPkceStore.set(state, {
        codeVerifier,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      });

      const callbackUrl = process.env.X_CALLBACK_URL || 'http://localhost:3001/auth/x/callback';

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: callbackUrl,
        scope: 'tweet.read users.read offline.access',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      return { url: `https://x.com/i/oauth2/authorize?${params.toString()}` };
    }
  );

  // Step 2: Exchange code for token, fetch user, create/find user
  fastify.post<{ Body: { code: string; state: string } }>(
    '/auth/x/callback',
    {
      schema: {
        body: {
          type: 'object' as const,
          required: ['code', 'state'],
          properties: {
            code: { type: 'string' as const },
            state: { type: 'string' as const },
          },
        },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    } as any,
    async (request, reply) => {
      const { code, state } = request.body;

      const clientId = process.env.X_CLIENT_ID;
      const clientSecret = process.env.X_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        reply.status(500);
        return { error: 'X OAuth not configured' };
      }

      // Validate state and retrieve code_verifier
      const pkceData = xPkceStore.get(state);
      if (!pkceData) {
        reply.status(401);
        return { error: 'Invalid or expired state' };
      }
      if (pkceData.expiresAt < Date.now()) {
        xPkceStore.delete(state);
        reply.status(401);
        return { error: 'State expired' };
      }
      xPkceStore.delete(state); // Single use

      const callbackUrl = process.env.X_CALLBACK_URL || 'http://localhost:3001/auth/x/callback';

      // Exchange authorization code for access token
      const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: callbackUrl,
          code_verifier: pkceData.codeVerifier,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        fastify.log.error({ err }, 'X token exchange failed');
        reply.status(401);
        return { error: 'Failed to exchange X authorization code' };
      }

      const tokenData = await tokenRes.json() as { access_token: string; token_type: string };

      // Fetch X user profile
      const userRes = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url,name,username', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
      });

      if (!userRes.ok) {
        reply.status(401);
        return { error: 'Failed to fetch X user profile' };
      }

      const xUserData = await userRes.json() as {
        data: { id: string; name: string; username: string; profile_image_url?: string };
      };
      const xUser = xUserData.data;

      // Find or create user by x_id
      let user = fastify.context.db.prepare(
        `SELECT * FROM users WHERE x_id = ?`
      ).get(xUser.id) as any;

      if (!user) {
        // Create new user with synthetic negative telegram_id
        const userId = `user-${crypto.randomUUID()}`;
        const syntheticTelegramId = -(Date.now() % 2_000_000_000 + Math.floor(Math.random() * 1000));

        // Split name into first/last
        const nameParts = xUser.name.split(' ');
        const firstName = nameParts[0] || xUser.username;
        const lastName = nameParts.slice(1).join(' ') || null;

        fastify.context.db.prepare(`
          INSERT INTO users (id, telegram_id, first_name, last_name, username, x_id, auth_provider)
          VALUES (?, ?, ?, ?, ?, ?, 'x')
        `).run(userId, syntheticTelegramId, firstName, lastName, xUser.username, xUser.id);

        user = fastify.context.db.prepare(
          `SELECT * FROM users WHERE id = ?`
        ).get(userId) as any;
      }

      const token = fastify.jwt.sign({
        userId: user.id,
        telegramId: user.telegram_id,
        tier: user.tier,
      });

      return {
        token,
        user: {
          id: user.id,
          telegramId: String(user.telegram_id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          tier: user.tier,
          email: user.email,
          walletAddress: user.wallet_address,
          authProvider: user.auth_provider,
        },
      };
    }
  );

  // Development login (skip in production)
  if (fastify.context.config.environment === 'development') {
    fastify.post<{ Body: { telegramId: number; firstName: string } }>(
      '/auth/dev-login',
      async (request, reply) => {
        const { telegramId, firstName } = request.body;

        // Find or create user
        let user = fastify.context.db.prepare(`
          SELECT * FROM users WHERE telegram_id = ?
        `).get(telegramId) as any;

        if (!user) {
          const userId = `user-${crypto.randomUUID()}`;
          fastify.context.db.prepare(`
            INSERT INTO users (id, telegram_id, first_name)
            VALUES (?, ?, ?)
          `).run(userId, telegramId, firstName);

          user = fastify.context.db.prepare(`
            SELECT * FROM users WHERE id = ?
          `).get(userId) as any;
        }

        // Auto-complete onboarding for dev login
        const existingPrefs = fastify.context.db.prepare(
          `SELECT id FROM user_preferences WHERE user_id = ?`
        ).get(user.id) as any;

        if (!existingPrefs) {
          try {
            fastify.context.db.prepare(`
              INSERT INTO user_preferences (id, user_id, display_name, experience_level, goals, language, tone, onboarding_complete)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              `pref-${crypto.randomUUID()}`,
              user.id,
              firstName,
              'advanced',
              '["ai","defi","building"]',
              'en',
              'friendly',
              1
            );
          } catch { /* table may not exist yet — that's ok */ }
        } else {
          try {
            fastify.context.db.prepare(
              `UPDATE user_preferences SET onboarding_complete = 1 WHERE user_id = ?`
            ).run(user.id);
          } catch { /* ignore */ }
        }

        const token = fastify.jwt.sign({
          userId: user.id,
          telegramId: user.telegram_id,
          tier: user.tier,
        });

        return {
          token,
          user: {
            id: user.id,
            telegramId: user.telegram_id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            tier: user.tier,
            onboardingComplete: true,
          },
        };
      }
    );
  }
};

export default authRoutes;
