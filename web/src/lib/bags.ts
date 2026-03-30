// ============================================================================
// Bags.fm Integration — REST API client for token, fee share, and pool data.
// Docs: https://docs.bags.fm/api-reference/introduction
// ============================================================================

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

export const BAGS_APP_URL = 'https://bags.fm';
export const BAGS_TOKEN_ADDRESS = '7r9RJw6gWbj6s1N9pGKrdzzd5H7oK1sauuwkUDVKBAGS';

// ============================================================================
// Types
// ============================================================================

export interface BagsProfile {
  address: string;
  username?: string;
  tokenBalance: number;
}

export interface BagsTokenHolding {
  tokenAddress: string;
  amount: number;
  name: string;
}

export interface BagsPool {
  tokenMint: string;
  poolKey: string;
  status: string;
  volume24h?: number;
  marketCap?: number;
  priceUsd?: number;
}

export interface BagsClaimablePosition {
  tokenMint: string;
  tokenName: string;
  unclaimedAmount: number;
  totalClaimed: number;
}

export interface BagsTokenLifetimeFees {
  totalFeesUsd: number;
  totalFeesSol: number;
  totalClaims: number;
}

// ============================================================================
// API Client
// ============================================================================

async function bagsRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T | null> {
  // SECURITY: Use server-only env var — never NEXT_PUBLIC_ for API keys.
  // Client-side balance checks use Solana RPC (getTokenBalance), not Bags API.
  const apiKey = process.env.BAGS_API_KEY;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(`${BAGS_API_BASE}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.success ? data.response : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Get pool data for the KIN token (or any token by mint address).
 */
export async function getBagsPool(
  tokenMint: string = BAGS_TOKEN_ADDRESS,
): Promise<BagsPool | null> {
  return bagsRequest<BagsPool>(`/pools/${tokenMint}`);
}

/**
 * Get all claimable fee-share positions for a wallet.
 */
export async function getClaimablePositions(
  walletAddress: string,
): Promise<BagsClaimablePosition[]> {
  const result = await bagsRequest<BagsClaimablePosition[]>(
    `/fee-share/claimable/${walletAddress}`,
  );
  return result ?? [];
}

/**
 * Get lifetime fee data for a token.
 */
export async function getTokenLifetimeFees(
  tokenMint: string = BAGS_TOKEN_ADDRESS,
): Promise<BagsTokenLifetimeFees | null> {
  return bagsRequest<BagsTokenLifetimeFees>(
    `/fee-share/lifetime/${tokenMint}`,
  );
}

/**
 * Get a trade quote for swapping tokens.
 */
export async function getTradeQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}): Promise<{ expectedOutput: number; priceImpact: number } | null> {
  const qs = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount.toString(),
    slippageBps: (params.slippageBps ?? 100).toString(),
  });
  return bagsRequest(`/trade/quote?${qs}`);
}

/**
 * Verify that a wallet holds the KIN Bags token.
 * Uses the Solana RPC to check token accounts (no Bags API key needed).
 */
export async function verifyBagsToken(
  walletAddress: string,
): Promise<boolean> {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    'https://api.mainnet-beta.solana.com';

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: BAGS_TOKEN_ADDRESS },
          { encoding: 'jsonParsed' },
        ],
      }),
    });

    const data = await response.json();
    const accounts = data?.result?.value ?? [];

    for (const account of accounts) {
      const amount =
        account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
      if (amount > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get token balance for a wallet (KIN token by default).
 */
export async function getTokenBalance(
  walletAddress: string,
  tokenMint: string = BAGS_TOKEN_ADDRESS,
): Promise<number> {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    'https://api.mainnet-beta.solana.com';

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: tokenMint },
          { encoding: 'jsonParsed' },
        ],
      }),
    });

    const data = await response.json();
    const accounts = data?.result?.value ?? [];

    let total = 0;
    for (const account of accounts) {
      total +=
        account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    }
    return total;
  } catch {
    return 0;
  }
}
