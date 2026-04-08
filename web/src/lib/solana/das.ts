'use client';

// ============================================================================
// DAS (Digital Asset Standard) — Query Solana NFTs via Helius-compatible RPCs.
// Adapted from 3D Anvil (CC0) — https://github.com/ToxSam/3d-anvil
// ============================================================================

import { SOLANA_RPC_URL, KIN_COLLECTION_MINT } from './constants';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DASAsset {
  id: string;
  content?: {
    json_uri?: string;
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      attributes?: Array<{ trait_type?: string; value?: string }>;
    };
    links?: {
      image?: string;
      animation_url?: string;
    };
    files?: Array<{ uri?: string; mime?: string }>;
  };
  grouping?: Array<{ group_key: string; group_value: string }>;
  ownership?: {
    owner: string;
    delegate?: string;
    frozen: boolean;
  };
  creators?: Array<{ address: string; share: number; verified: boolean }>;
}

export interface DASSearchResult {
  total: number;
  limit: number;
  page: number;
  items: DASAsset[];
}

// ── Simple in-memory cache ─────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; expires: number }>();

/** Max cache entries before full eviction. */
const MAX_DAS_CACHE_SIZE = 500;

function cached<T>(key: string, fn: () => Promise<T>, ttlSeconds: number): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expires > now) return Promise.resolve(entry.data as T);
  return fn().then((data) => {
    // Evict all when cache grows beyond bounds — entries have TTL so
    // only fresh fetches survive, and the RPC is the source of truth.
    if (cache.size >= MAX_DAS_CACHE_SIZE) {
      cache.clear();
    }
    cache.set(key, { data, expires: now + ttlSeconds * 1000 });
    return data;
  });
}

// ── Core RPC helper ────────────────────────────────────────────────────────

async function dasRPC<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `das-${method}`,
        method,
        params,
      }),
    });
    const data = await res.json();
    if (data.error) {
      console.warn(`[DAS] ${method} error:`, data.error);
      return null;
    }
    return data.result as T;
  } catch (err) {
    console.warn(`[DAS] ${method} failed:`, err);
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get all NFTs owned by a wallet. Cached 60s.
 */
export async function getAssetsByOwner(
  ownerAddress: string,
  page = 1,
  limit = 100,
): Promise<DASSearchResult | null> {
  return cached(
    `das:owner:${ownerAddress}:${page}:${limit}`,
    () =>
      dasRPC<DASSearchResult>('getAssetsByOwner', {
        ownerAddress,
        page,
        limit,
      }),
    60,
  );
}

/**
 * Get all NFTs in a collection. Cached 2 minutes.
 */
export async function getCollectionAssets(
  collectionMint: string,
  page = 1,
  limit = 50,
): Promise<DASSearchResult | null> {
  return cached(
    `das:collection:${collectionMint}:${page}:${limit}`,
    () =>
      dasRPC<DASSearchResult>('getAssetsByGroup', {
        groupKey: 'collection',
        groupValue: collectionMint,
        page,
        limit,
      }),
    120,
  );
}

/**
 * Get a single asset by mint address. Cached 5 minutes.
 */
export async function getAsset(
  mintAddress: string,
): Promise<DASAsset | null> {
  return cached(
    `das:asset:${mintAddress}`,
    () => dasRPC<DASAsset>('getAsset', { id: mintAddress }),
    300,
  );
}

// ── KIN-specific helpers ───────────────────────────────────────────────────

/**
 * Get all KIN companion NFTs owned by a wallet.
 * Filters by the KIN collection mint address.
 */
export async function getKinCompanionsByOwner(
  ownerAddress: string,
): Promise<DASAsset[]> {
  if (!KIN_COLLECTION_MINT) {
    // Collection not deployed yet — return empty
    return [];
  }

  const result = await getAssetsByOwner(ownerAddress, 1, 1000);
  if (!result?.items) return [];

  return result.items.filter((asset) =>
    asset.grouping?.some(
      (g) =>
        g.group_key === 'collection' &&
        g.group_value === KIN_COLLECTION_MINT,
    ),
  );
}

/**
 * Check if a wallet owns a specific companion NFT.
 * Returns the mint address if found, null otherwise.
 */
export async function checkCompanionOwnership(
  ownerAddress: string,
  companionId: string,
): Promise<string | null> {
  const companions = await getKinCompanionsByOwner(ownerAddress);

  const match = companions.find((asset) => {
    const name = asset.content?.metadata?.name?.toLowerCase() ?? '';
    return name.includes(companionId.toLowerCase());
  });

  return match?.id ?? null;
}

/**
 * Get the GLB model URL from a KIN companion NFT's metadata.
 */
export function getCompanionModelUrl(asset: DASAsset): string | null {
  // Check animation_url first (standard for 3D models)
  const animUrl = asset.content?.links?.animation_url;
  if (animUrl) return animUrl;

  // Check files array for GLB
  const glbFile = asset.content?.files?.find(
    (f) => f.mime === 'model/gltf-binary' || f.uri?.endsWith('.glb'),
  );
  return glbFile?.uri ?? null;
}

/**
 * Get collection-level stats. Cached 3 minutes.
 */
export async function getKinCollectionStats(): Promise<{
  totalMinted: number;
  uniqueHolders: number;
} | null> {
  if (!KIN_COLLECTION_MINT) return null;

  return cached(
    `das:kin-stats`,
    async () => {
      const result = await getCollectionAssets(KIN_COLLECTION_MINT, 1, 1000);
      if (!result?.items) return { totalMinted: 0, uniqueHolders: 0 };

      const owners = new Set<string>();
      for (const item of result.items) {
        if (item.ownership?.owner) owners.add(item.ownership.owner);
      }

      return {
        totalMinted: result.total || result.items.length,
        uniqueHolders: owners.size,
      };
    },
    180,
  );
}
