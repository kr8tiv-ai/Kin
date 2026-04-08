/**
 * Token-Gating Middleware — Bags.fm $KR8TIV token verification
 *
 * Enforces token-gated access to premium routes.
 * Checks the user's wallet for $KR8TIV token balance via Solana RPC.
 *
 * Usage:
 *   fastify.get('/premium-route', { preHandler: [requireTokenBalance(1)] }, handler)
 *
 * Returns 403 with clear message when user doesn't hold enough tokens.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { fetchWithTimeout } from '../../inference/retry.js';

// $KR8TIV token mint address on Solana
const KR8TIV_TOKEN_MINT = '7r9RJw6gWbj6s1N9pGKrdzzd5H7oK1sauuwkUDVKBAGS';

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// In-memory cache: walletAddress -> { balance, expiresAt }
const balanceCache = new Map<string, { balance: number; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

// Cleanup expired cache entries every 5 minutes
const tokenCacheCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of balanceCache) {
    if (entry.expiresAt < now) balanceCache.delete(key);
  }
}, 5 * 60_000);
tokenCacheCleanupInterval.unref();

/**
 * Fetch $KR8TIV token balance for a wallet via Solana RPC.
 */
async function getTokenBalance(walletAddress: string): Promise<number> {
  const cached = balanceCache.get(walletAddress);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.balance;
  }

  try {
    const response = await fetchWithTimeout(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: KR8TIV_TOKEN_MINT },
          { encoding: 'jsonParsed' },
        ],
      }),
    }, 10_000);

    const data = await response.json() as any;
    const accounts = data?.result?.value ?? [];

    let total = 0;
    for (const account of accounts) {
      total +=
        account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    }

    balanceCache.set(walletAddress, {
      balance: total,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return total;
  } catch {
    return 0;
  }
}

/**
 * Middleware factory: require minimum $KR8TIV token balance.
 *
 * @param minBalance Minimum token balance required (default: 1)
 */
export function requireTokenBalance(minBalance = 1) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { userId: string })?.userId;
    if (!userId) {
      reply.status(401);
      return reply.send({ error: 'Authentication required' });
    }

    // Look up wallet address from DB
    const db = (request.server as any).context?.db;
    if (!db) {
      // If DB not available, allow through (development fallback)
      return;
    }

    const user = db.prepare(
      'SELECT wallet_address FROM users WHERE id = ?',
    ).get(userId) as { wallet_address: string | null } | undefined;

    if (!user?.wallet_address) {
      reply.status(403);
      return reply.send({
        error: 'Connect a Solana wallet to access premium features',
        code: 'NO_WALLET',
      });
    }

    const balance = await getTokenBalance(user.wallet_address);

    if (balance < minBalance) {
      reply.status(403);
      return reply.send({
        error: `Hold at least ${minBalance} $KR8TIV token${minBalance !== 1 ? 's' : ''} to access this feature`,
        code: 'INSUFFICIENT_TOKENS',
        required: minBalance,
        current: balance,
        buyUrl: 'https://bags.fm',
      });
    }

    // Token gate passed — continue to handler
  };
}

/**
 * Middleware factory: check if user is an NFT holder (any companion).
 * Allows access if user has at least one NFT in nft_ownership table.
 */
export function requireNFTOwnership() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { userId: string })?.userId;
    if (!userId) {
      reply.status(401);
      return reply.send({ error: 'Authentication required' });
    }

    const db = (request.server as any).context?.db;
    if (!db) return;

    const nft = db.prepare(
      'SELECT 1 FROM nft_ownership WHERE user_id = ? LIMIT 1',
    ).get(userId);

    if (!nft) {
      reply.status(403);
      return reply.send({
        error: 'Mint a KIN companion NFT to access this feature',
        code: 'NO_NFT',
      });
    }
  };
}

export { getTokenBalance, KR8TIV_TOKEN_MINT };
