/**
 * OllamaClient URL detection tests — verifies the baseUrl construction
 * handles both bare hostnames and full URL-format OLLAMA_HOST values.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaClient } from '../inference/local-llm.js';

afterEach(() => {
  vi.restoreAllMocks();
  // Clean env overrides
  delete process.env.OLLAMA_HOST;
  delete process.env.OLLAMA_PORT;
});

/**
 * Access the private baseUrl via a health check request that reveals the URL.
 * We mock fetch to capture the URL it's called with.
 */
function captureBaseUrl(client: OllamaClient): Promise<string> {
  return new Promise((resolve) => {
    vi.stubGlobal('fetch', async (url: string) => {
      resolve(url);
      return { ok: true, json: async () => ({ version: '0.0.0' }) };
    });
    client.checkHealth();
  });
}

describe('OllamaClient URL detection', () => {
  it('uses https URL directly when OLLAMA_HOST starts with https://', async () => {
    process.env.OLLAMA_HOST = 'https://ollama.alice.kin.kr8tiv.ai';

    const client = new OllamaClient();
    const url = await captureBaseUrl(client);

    expect(url).toBe('https://ollama.alice.kin.kr8tiv.ai/api/version');
  });

  it('uses http URL directly when OLLAMA_HOST starts with http://', async () => {
    process.env.OLLAMA_HOST = 'http://custom:8080';

    const client = new OllamaClient();
    const url = await captureBaseUrl(client);

    expect(url).toBe('http://custom:8080/api/version');
  });

  it('constructs http://host:port when OLLAMA_HOST is a bare hostname', async () => {
    process.env.OLLAMA_HOST = '127.0.0.1';

    const client = new OllamaClient();
    const url = await captureBaseUrl(client);

    expect(url).toBe('http://127.0.0.1:11434/api/version');
  });

  it('defaults to 127.0.0.1:11434 with no env vars', async () => {
    const client = new OllamaClient();
    const url = await captureBaseUrl(client);

    expect(url).toBe('http://127.0.0.1:11434/api/version');
  });

  it('strips trailing slash from URL-format host', async () => {
    process.env.OLLAMA_HOST = 'https://ollama.alice.kin.kr8tiv.ai/';

    const client = new OllamaClient();
    const url = await captureBaseUrl(client);

    expect(url).toBe('https://ollama.alice.kin.kr8tiv.ai/api/version');
  });

  it('respects config.host over env var when URL-format', async () => {
    process.env.OLLAMA_HOST = 'http://should-not-use:9999';

    const client = new OllamaClient({ host: 'https://config-host.example.com' });
    const url = await captureBaseUrl(client);

    expect(url).toBe('https://config-host.example.com/api/version');
  });

  it('respects config.host + config.port for bare hostnames', async () => {
    const client = new OllamaClient({ host: '10.0.0.5', port: 9999 });
    const url = await captureBaseUrl(client);

    expect(url).toBe('http://10.0.0.5:9999/api/version');
  });

  it('ignores port config when host is a full URL', async () => {
    const client = new OllamaClient({
      host: 'https://ollama.tunnel.example.com',
      port: 9999,
    });
    const url = await captureBaseUrl(client);

    // Port is embedded in the URL or absent — config.port is ignored
    expect(url).toBe('https://ollama.tunnel.example.com/api/version');
  });
});
