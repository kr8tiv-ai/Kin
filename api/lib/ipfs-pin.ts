/**
 * IPFS Pin Service — pins arbitrary JSON to IPFS via Pinata.
 *
 * Gracefully returns null when PINATA_JWT is not configured or the
 * Pinata API is unavailable. Follows the same Pinata pattern used in
 * solana/nft.ts uploadMetadata().
 *
 * Required env vars:
 *   PINATA_JWT — Pinata API JWT for pinning
 */

import { fetchWithTimeout } from '../../inference/retry.js';

const PINATA_PIN_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

export interface PinResult {
  /** IPFS content identifier (CIDv0 or CIDv1) */
  cid: string;
  /** Public gateway URL for the pinned content */
  gatewayUrl: string;
}

/**
 * Pin arbitrary JSON data to IPFS via Pinata.
 *
 * @param data  — any JSON-serialisable value
 * @param name  — optional human-readable name for the pin (shown in Pinata dashboard)
 * @returns PinResult on success, null on any failure or missing config
 */
export async function pinJSON(
  data: unknown,
  name?: string,
): Promise<PinResult | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    console.warn('[TraitAnchor] PINATA_JWT not set — skipping IPFS pin');
    return null;
  }

  try {
    const res = await fetchWithTimeout(PINATA_PIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: data,
        pinataMetadata: { name: name ?? 'kin-trait-snapshot' },
      }),
    }, 15_000);

    if (res.ok) {
      const { IpfsHash } = (await res.json()) as { IpfsHash: string };
      const result: PinResult = {
        cid: IpfsHash,
        gatewayUrl: `${PINATA_GATEWAY}/${IpfsHash}`,
      };
      console.log(`[TraitAnchor] Pinned to IPFS: ${result.gatewayUrl}`);
      return result;
    }

    if (res.status === 429) {
      console.warn('[TraitAnchor] Pinata rate limit hit (429) — skipping pin');
      return null;
    }

    console.warn(
      `[TraitAnchor] Pinata pin failed: ${res.status} ${await res.text()}`,
    );
    return null;
  } catch (err) {
    console.warn('[TraitAnchor] Pinata network error:', err);
    return null;
  }
}
