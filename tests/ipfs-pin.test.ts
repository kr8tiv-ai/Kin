/**
 * Unit tests for api/lib/ipfs-pin.ts
 *
 * Mocks global fetch to simulate Pinata API responses.
 * Tests: success, 429 rate limit, network error, missing env var.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to control process.env.PINATA_JWT per test
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  // Ensure clean env for each test
  delete process.env.PINATA_JWT;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('pinJSON', () => {
  it('returns cid and gatewayUrl on successful Pinata response', async () => {
    process.env.PINATA_JWT = 'test-jwt-token';

    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ IpfsHash: 'QmTestHash123abc' }),
      text: async () => '',
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse as unknown as Response,
    );

    const { pinJSON } = await import('../api/lib/ipfs-pin.js');
    const result = await pinJSON({ trait: 'brave', level: 5 }, 'cipher-traits');

    expect(result).toEqual({
      cid: 'QmTestHash123abc',
      gatewayUrl: 'https://gateway.pinata.cloud/ipfs/QmTestHash123abc',
    });

    // Verify correct Pinata API call
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.pinata.cloud/pinning/pinJSONToIPFS');
    expect(opts?.method).toBe('POST');
    expect(opts?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-jwt-token',
      }),
    );

    // Verify body shape
    const body = JSON.parse(opts?.body as string);
    expect(body.pinataContent).toEqual({ trait: 'brave', level: 5 });
    expect(body.pinataMetadata.name).toBe('cipher-traits');
  });

  it('uses default pin name when none provided', async () => {
    process.env.PINATA_JWT = 'test-jwt';

    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ IpfsHash: 'QmDefault' }),
      text: async () => '',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse as unknown as Response,
    );

    const { pinJSON } = await import('../api/lib/ipfs-pin.js');
    const result = await pinJSON({ key: 'value' });

    expect(result).not.toBeNull();

    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1]?.body as string),
    );
    expect(body.pinataMetadata.name).toBe('kin-trait-snapshot');
  });

  it('returns null on 429 rate limit', async () => {
    process.env.PINATA_JWT = 'test-jwt';

    const mockResponse = {
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => 'Rate limit exceeded',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse as unknown as Response,
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { pinJSON } = await import('../api/lib/ipfs-pin.js');
    const result = await pinJSON({ data: 1 });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('rate limit'),
    );
  });

  it('returns null on network error', async () => {
    process.env.PINATA_JWT = 'test-jwt';

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('ECONNREFUSED'),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { pinJSON } = await import('../api/lib/ipfs-pin.js');
    const result = await pinJSON({ data: 1 });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('network error'),
      expect.any(Error),
    );
  });

  it('returns null on non-200 non-429 response', async () => {
    process.env.PINATA_JWT = 'test-jwt';

    const mockResponse = {
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'Internal Server Error',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse as unknown as Response,
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { pinJSON } = await import('../api/lib/ipfs-pin.js');
    const result = await pinJSON({ data: 1 });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('pin failed'),
    );
  });

  it('returns null when PINATA_JWT is not set', async () => {
    // PINATA_JWT explicitly not set (deleted in beforeEach)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { pinJSON } = await import('../api/lib/ipfs-pin.js');
    const result = await pinJSON({ data: 1 });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('PINATA_JWT not set'),
    );
  });
});
