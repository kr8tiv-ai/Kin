/**
 * TunnelManager unit tests — mocks global fetch to test Cloudflare v4 API calls.
 *
 * K001/K019 skip guard: these tests do not require better-sqlite3,
 * so no native module guard is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TunnelManager,
  CloudflareApiError,
  type TunnelManagerConfig,
} from '../fleet/tunnel-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG: TunnelManagerConfig = {
  apiToken: 'test-token-abc',
  accountId: 'acct-123',
  zoneId: 'zone-456',
  baseDomain: 'kin.kr8tiv.ai',
};

function cfOk<T>(result: T) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, result }),
  } as unknown as Response;
}

function cfErr(status: number, errors: Array<{ code: number; message: string }> = []) {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, errors }),
  } as unknown as Response;
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  // Suppress console.info / console.warn from TunnelManager
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TunnelManager', () => {
  describe('createTunnel', () => {
    it('sends POST to cfd_tunnel and returns tunnelId + token', async () => {
      fetchSpy.mockResolvedValueOnce(
        cfOk({ id: 'tun-001', token: 'tok-secret' }),
      );

      const tm = new TunnelManager(TEST_CONFIG);
      const result = await tm.createTunnel('alice-tunnel');

      expect(result).toEqual({ tunnelId: 'tun-001', token: 'tok-secret' });

      // Verify request shape
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('/accounts/acct-123/cfd_tunnel');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.name).toBe('alice-tunnel');
      expect(typeof body.tunnel_secret).toBe('string');
    });

    it('throws CloudflareApiError on non-2xx', async () => {
      fetchSpy.mockResolvedValueOnce(
        cfErr(403, [{ code: 1000, message: 'Forbidden' }]),
      );

      const tm = new TunnelManager(TEST_CONFIG);

      try {
        await tm.createTunnel('fail');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CloudflareApiError);
        expect((e as CloudflareApiError).status).toBe(403);
        expect((e as CloudflareApiError).errors[0].message).toBe('Forbidden');
      }
    });
  });

  describe('configureTunnel', () => {
    it('sends PUT with ingress rules', async () => {
      fetchSpy.mockResolvedValueOnce(cfOk({}));

      const tm = new TunnelManager(TEST_CONFIG);
      await tm.configureTunnel('tun-001', 'ollama.alice.kin.kr8tiv.ai', 'http://localhost:11434');

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('/cfd_tunnel/tun-001/configurations');
      expect(init.method).toBe('PUT');
      const body = JSON.parse(init.body);
      expect(body.config.ingress).toHaveLength(2);
      expect(body.config.ingress[0].hostname).toBe('ollama.alice.kin.kr8tiv.ai');
      expect(body.config.ingress[0].service).toBe('http://localhost:11434');
      expect(body.config.ingress[1].service).toBe('http_status:404');
    });
  });

  describe('createDnsRecord', () => {
    it('creates a CNAME record and returns recordId', async () => {
      fetchSpy.mockResolvedValueOnce(cfOk({ id: 'dns-rec-789' }));

      const tm = new TunnelManager(TEST_CONFIG);
      const result = await tm.createDnsRecord('ollama.alice.kin.kr8tiv.ai', 'tun-001');

      expect(result).toEqual({ recordId: 'dns-rec-789' });

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('/zones/zone-456/dns_records');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.type).toBe('CNAME');
      expect(body.content).toBe('tun-001.cfargotunnel.com');
      expect(body.proxied).toBe(true);
    });
  });

  describe('getTunnelStatus', () => {
    it('returns parsed tunnel status with connections', async () => {
      fetchSpy.mockResolvedValueOnce(
        cfOk({
          id: 'tun-001',
          name: 'alice-tunnel',
          status: 'healthy',
          connections: [
            { id: 'conn-1', client_version: '2024.1.0', origin_ip: '192.168.1.1' },
          ],
        }),
      );

      const tm = new TunnelManager(TEST_CONFIG);
      const result = await tm.getTunnelStatus('tun-001');

      expect(result.id).toBe('tun-001');
      expect(result.name).toBe('alice-tunnel');
      expect(result.status).toBe('healthy');
      expect(result.connections).toHaveLength(1);
      expect(result.connections[0].clientVersion).toBe('2024.1.0');
      expect(result.connections[0].originIp).toBe('192.168.1.1');
    });

    it('handles tunnels with no connections', async () => {
      fetchSpy.mockResolvedValueOnce(
        cfOk({ id: 'tun-002', name: 'idle', status: 'inactive', connections: [] }),
      );

      const tm = new TunnelManager(TEST_CONFIG);
      const result = await tm.getTunnelStatus('tun-002');
      expect(result.connections).toHaveLength(0);
      expect(result.status).toBe('inactive');
    });
  });

  describe('deleteTunnel', () => {
    it('sends DELETE to cfd_tunnel endpoint', async () => {
      fetchSpy.mockResolvedValueOnce(cfOk({}));

      const tm = new TunnelManager(TEST_CONFIG);
      await tm.deleteTunnel('tun-001');

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('/cfd_tunnel/tun-001');
      expect(init.method).toBe('DELETE');
    });
  });

  describe('deleteDnsRecord', () => {
    it('sends DELETE to dns_records endpoint', async () => {
      fetchSpy.mockResolvedValueOnce(cfOk({}));

      const tm = new TunnelManager(TEST_CONFIG);
      await tm.deleteDnsRecord('dns-rec-789');

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('/zones/zone-456/dns_records/dns-rec-789');
      expect(init.method).toBe('DELETE');
    });
  });

  describe('error handling', () => {
    it('includes Cloudflare error codes in thrown error', async () => {
      fetchSpy.mockResolvedValueOnce(
        cfErr(400, [
          { code: 1001, message: 'Invalid request' },
          { code: 1002, message: 'Missing field' },
        ]),
      );

      const tm = new TunnelManager(TEST_CONFIG);
      try {
        await tm.deleteTunnel('bad-id');
        expect.unreachable('Should throw');
      } catch (e) {
        const err = e as CloudflareApiError;
        expect(err.status).toBe(400);
        expect(err.errors).toHaveLength(2);
        expect(err.message).toContain('1001');
        expect(err.message).toContain('Invalid request');
      }
    });

    it('throws on network failure', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

      const tm = new TunnelManager(TEST_CONFIG);
      try {
        await tm.createTunnel('net-fail');
        expect.unreachable('Should throw');
      } catch (e) {
        const err = e as CloudflareApiError;
        expect(err.status).toBe(0);
        expect(err.message).toContain('Network error');
        expect(err.message).toContain('fetch failed');
      }
    });
  });
});
