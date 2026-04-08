import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupermemoryClient } from '../inference/memory/supermemory';

describe('SupermemoryClient.searchMemories', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the search payload using q instead of query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const client = new SupermemoryClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.test',
    });

    await client.searchMemories('launch plan', 'user-1', 'cipher', 5);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          q: 'launch plan',
          limit: 5,
        }),
      }),
    );
  });
});
