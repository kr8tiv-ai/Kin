// ============================================================================
// Solana Constants — Network config, RPC, and KIN-specific addresses.
// NFT minting powered by 3D Anvil (CC0) — https://github.com/ToxSam/3d-anvil
// ============================================================================

export const SOLANA_NETWORK =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (SOLANA_NETWORK === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com');

export const SOLANA_WS_URL =
  process.env.NEXT_PUBLIC_SOLANA_WS_URL ||
  (SOLANA_NETWORK === 'mainnet-beta'
    ? 'wss://api.mainnet-beta.solana.com'
    : 'wss://api.devnet.solana.com');

/** KIN token address on Bags.fm */
export const KIN_TOKEN_ADDRESS =
  '7r9RJw6gWbj6s1N9pGKrdzzd5H7oK1sauuwkUDVKBAGS';

/** KIN companion collection mint — set after Candy Machine deployment */
export const KIN_COLLECTION_MINT =
  process.env.NEXT_PUBLIC_KIN_COLLECTION_MINT || '';

/** Per-companion Candy Machine addresses — set after deployment */
export const COMPANION_CANDY_MACHINES: Record<string, string> = {
  cipher: process.env.NEXT_PUBLIC_CM_CIPHER || '',
  mischief: process.env.NEXT_PUBLIC_CM_MISCHIEF || '',
  vortex: process.env.NEXT_PUBLIC_CM_VORTEX || '',
  forge: process.env.NEXT_PUBLIC_CM_FORGE || '',
  aether: process.env.NEXT_PUBLIC_CM_AETHER || '',
  catalyst: process.env.NEXT_PUBLIC_CM_CATALYST || '',
};

/** Arweave gateway for resolving uploaded assets */
export const ARWEAVE_GATEWAY = 'https://arweave.net';

/** Irys gateway (alternative, often faster) */
export const IRYS_GATEWAY = 'https://gateway.irys.xyz';

/** Resolve Arweave URLs through Irys gateway for better reliability */
export function resolveArweaveUrl(
  url: string | undefined | null,
): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return undefined;
  } catch {
    return undefined;
  }
  if (url.includes('arweave.net')) {
    return url.replace('https://arweave.net/', `${IRYS_GATEWAY}/`);
  }
  return url;
}
