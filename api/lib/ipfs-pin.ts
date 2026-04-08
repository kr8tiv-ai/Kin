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
import type { FastifyBaseLogger } from 'fastify';

const PINATA_PIN_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

/** Minimal logger interface — accepts Fastify's pino logger or a console fallback */
type Logger = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;

const defaultLogger: Logger = {
  info: (obj: unknown, msg?: string) => console.log(msg ?? obj),
  warn: (obj: unknown, msg?: string) => console.warn(msg ?? obj),
  error: (obj: unknown, msg?: string) => console.error(msg ?? obj),
};

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
  log: Logger = defaultLogger,
): Promise<PinResult | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    log.warn({}, 'PINATA_JWT not set — skipping IPFS pin');
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
      log.info({ cid: IpfsHash }, 'pinned to IPFS');
      return result;
    }

    if (res.status === 429) {
      log.warn({ status: 429 }, 'Pinata rate limit hit — skipping pin');
      return null;
    }

    log.warn({ status: res.status }, 'Pinata pin failed');
    return null;
  } catch (err) {
    log.warn({ err }, 'Pinata network error');
    return null;
  }
}
