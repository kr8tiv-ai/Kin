/**
 * Tests for Ollama web search integration:
 * - Web search client (ollamaWebSearch, ollamaWebFetch, isWebSearchAvailable)
 * - Tool-call loop in supervisor's executeLocal path
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ============================================================================
// Web Search Client Tests
// ============================================================================

describe('Web Search Client', () => {
  // Use vi.importActual to get real functions despite the vi.mock below
  let ollamaWebSearch: typeof import('../inference/web-search.js')['ollamaWebSearch'];
  let ollamaWebFetch: typeof import('../inference/web-search.js')['ollamaWebFetch'];
  let isWebSearchAvailable: typeof import('../inference/web-search.js')['isWebSearchAvailable'];
  let WEB_SEARCH_TOOL: typeof import('../inference/web-search.js')['WEB_SEARCH_TOOL'];

  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    const actual = await vi.importActual<typeof import('../inference/web-search.js')>('../inference/web-search.js');
    ollamaWebSearch = actual.ollamaWebSearch;
    ollamaWebFetch = actual.ollamaWebFetch;
    isWebSearchAvailable = actual.isWebSearchAvailable;
    WEB_SEARCH_TOOL = actual.WEB_SEARCH_TOOL;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  describe('ollamaWebSearch()', () => {
    it('sends correct URL, auth header, and body', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      };
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse as unknown as Response);

      await ollamaWebSearch('test query', 'test-api-key');

      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe('https://ollama.com/api/web_search');
      expect((init as RequestInit).method).toBe('POST');
      expect((init as RequestInit).headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
        }),
      );
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toEqual({ query: 'test query' });
    });

    it('parses response correctly', async () => {
      const mockResults = {
        results: [
          { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1' },
          { title: 'Result 2', url: 'https://example.com/2', content: 'Content 2' },
        ],
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      } as unknown as Response);

      const result = await ollamaWebSearch('test', 'key');
      expect(result.results).toHaveLength(2);
      expect(result.results[0]!.title).toBe('Result 1');
      expect(result.results[1]!.url).toBe('https://example.com/2');
    });

    it('throws on non-200 response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as unknown as Response);

      await expect(ollamaWebSearch('test', 'key')).rejects.toThrow(
        'Ollama web search failed: HTTP 500',
      );
    });

    it('returns empty results array on malformed response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ unexpected: 'shape' }),
      } as unknown as Response);

      const result = await ollamaWebSearch('test', 'key');
      expect(result.results).toEqual([]);
    });
  });

  describe('ollamaWebFetch()', () => {
    it('sends correct URL, auth header, and body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: 'page content' }),
      } as unknown as Response);

      await ollamaWebFetch('https://example.com', 'test-key');

      const [url, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe('https://ollama.com/api/web_fetch');
      expect((init as RequestInit).headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer test-key' }),
      );
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toEqual({ url: 'https://example.com' });
    });

    it('returns content string from response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: 'Hello world' }),
      } as unknown as Response);

      const content = await ollamaWebFetch('https://example.com', 'key');
      expect(content).toBe('Hello world');
    });

    it('throws on non-200 response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as unknown as Response);

      await expect(ollamaWebFetch('https://example.com', 'key')).rejects.toThrow(
        'Ollama web fetch failed: HTTP 403',
      );
    });
  });

  describe('isWebSearchAvailable()', () => {
    it('returns false when OLLAMA_API_KEY is unset', () => {
      delete process.env.OLLAMA_API_KEY;
      expect(isWebSearchAvailable('shared')).toBe(false);
    });

    it('returns false when privacyMode is private', () => {
      vi.stubEnv('OLLAMA_API_KEY', 'test-key');
      expect(isWebSearchAvailable('private')).toBe(false);
    });

    it('returns true when key is set AND privacyMode is shared', () => {
      vi.stubEnv('OLLAMA_API_KEY', 'test-key');
      expect(isWebSearchAvailable('shared')).toBe(true);
    });

    it('returns true when key is set AND privacyMode is undefined', () => {
      vi.stubEnv('OLLAMA_API_KEY', 'test-key');
      expect(isWebSearchAvailable(undefined)).toBe(true);
    });

    it('returns false when key is empty string', () => {
      vi.stubEnv('OLLAMA_API_KEY', '');
      expect(isWebSearchAvailable('shared')).toBe(false);
    });
  });

  describe('WEB_SEARCH_TOOL constant', () => {
    it('has correct structure for Ollama tool calling', () => {
      expect(WEB_SEARCH_TOOL.type).toBe('function');
      expect(WEB_SEARCH_TOOL.function.name).toBe('web_search');
      expect(WEB_SEARCH_TOOL.function.description).toBeTruthy();
      expect(WEB_SEARCH_TOOL.function.parameters).toBeDefined();
    });
  });
});

// ============================================================================
// Tool-Call Loop Tests (supervisor executeLocal path)
// ============================================================================

describe('Tool-Call Loop in executeLocal', () => {
  // Mock modules before imports — these are hoisted by Vitest
  vi.mock('../inference/local-llm.js', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../inference/local-llm.js')>();
    const mockClient = {
      chat: vi.fn(),
    };
    return {
      ...orig,
      getOllamaClient: () => mockClient,
      isLocalLlmAvailable: vi.fn().mockResolvedValue(true),
      __mockClient: mockClient,
    };
  });

  vi.mock('../inference/web-search.js', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../inference/web-search.js')>();
    return {
      ...orig,
      ollamaWebSearch: vi.fn(),
      isWebSearchAvailable: vi.fn(),
    };
  });

  // Mock other supervisor dependencies to prevent import errors
  vi.mock('../inference/fallback-handler.js', () => ({
    FallbackHandler: vi.fn(),
  }));
  vi.mock('../companions/config.js', () => ({
    getCompanionConfig: vi.fn().mockReturnValue({
      companionId: 'cipher',
      localModel: 'llama3.2',
      frontierProvider: 'groq',
      frontierModelId: 'llama-3.3-70b-versatile',
      frontierModelName: 'Llama 3.3 70B',
      escalationLevel: 'medium',
      escalationKeywords: [],
      supervisorContextWindow: 10,
    }),
  }));
  vi.mock('../bot/utils/personality-check.js', () => ({
    checkPersonality: vi.fn().mockReturnValue({ passed: true, severity: 'ok', issues: [] }),
    patchResponse: vi.fn((c: string) => c),
  }));
  vi.mock('../inference/providers/index.js', () => ({
    getProvider: vi.fn().mockReturnValue(null),
  }));
  vi.mock('../inference/providers/circuit-breaker.js', () => ({
    isProviderHealthy: vi.fn().mockReturnValue(true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  }));
  vi.mock('../inference/trajectory.js', () => ({
    getTrajectoryLogger: vi.fn().mockReturnValue({ log: vi.fn().mockResolvedValue(undefined) }),
  }));
  vi.mock('../inference/metrics.js', () => ({
    getMetricsCollector: vi.fn().mockReturnValue({ record: vi.fn() }),
  }));
  vi.mock('../inference/memory/supermemory.js', () => ({
    getSupermemoryClient: vi.fn().mockReturnValue(null),
  }));
  vi.mock('../inference/observation-extractor.js', () => ({
    extractObservations: vi.fn().mockReturnValue([]),
  }));
  vi.mock('../inference/training-data.js', () => ({
    getTrainingDataCollector: vi.fn().mockReturnValue({ collect: vi.fn().mockResolvedValue(undefined) }),
  }));

  let supervisedChat: typeof import('../inference/supervisor.js').supervisedChat;
  let mockClient: { chat: ReturnType<typeof vi.fn> };
  let mockOllamaWebSearch: ReturnType<typeof vi.fn>;
  let mockIsWebSearchAvailable: ReturnType<typeof vi.fn>;
  let mockFallback: { executeWithFallback: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    const supervisorMod = await import('../inference/supervisor.js');
    supervisedChat = supervisorMod.supervisedChat;

    const llmMod = await import('../inference/local-llm.js');
    mockClient = (llmMod as unknown as { __mockClient: { chat: ReturnType<typeof vi.fn> } }).__mockClient;

    const webSearchMod = await import('../inference/web-search.js');
    mockOllamaWebSearch = webSearchMod.ollamaWebSearch as unknown as ReturnType<typeof vi.fn>;
    mockIsWebSearchAvailable = webSearchMod.isWebSearchAvailable as unknown as ReturnType<typeof vi.fn>;

    mockFallback = { executeWithFallback: vi.fn() };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns content directly when model returns no tool_calls', async () => {
    mockIsWebSearchAvailable.mockReturnValue(true);
    mockClient.chat.mockResolvedValueOnce({
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content: 'Direct answer without search' },
      done: true,
    });

    const result = await supervisedChat(
      [{ role: 'user', content: 'hello' }],
      'cipher',
      mockFallback as any,
      { forceLocal: true, privacyMode: 'shared' },
    );

    expect(result.content).toBe('Direct answer without search');
    expect(mockClient.chat).toHaveBeenCalledOnce();
    expect(mockOllamaWebSearch).not.toHaveBeenCalled();
  });

  it('executes web search when model requests web_search tool', async () => {
    mockIsWebSearchAvailable.mockReturnValue(true);
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');

    // First call: model requests web_search
    mockClient.chat.mockResolvedValueOnce({
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'web_search', arguments: { query: 'latest news' } } }],
      },
      done: true,
    });

    // Mock web search response
    mockOllamaWebSearch.mockResolvedValueOnce({
      results: [{ title: 'News', url: 'https://news.com', content: 'Breaking news content' }],
    });

    // Second call: model returns final answer
    mockClient.chat.mockResolvedValueOnce({
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content: 'Based on the search results, here is the news.' },
      done: true,
    });

    const result = await supervisedChat(
      [{ role: 'user', content: 'what is the latest news?' }],
      'cipher',
      mockFallback as any,
      { forceLocal: true, privacyMode: 'shared' },
    );

    expect(result.content).toBe('Based on the search results, here is the news.');
    expect(mockClient.chat).toHaveBeenCalledTimes(2);
    expect(mockOllamaWebSearch).toHaveBeenCalledWith('latest news', 'test-key');
  });

  it('caps tool-call loop at 3 iterations', async () => {
    mockIsWebSearchAvailable.mockReturnValue(true);
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');

    // Model keeps requesting web_search on every call
    const toolCallResponse = {
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: 'partial',
        tool_calls: [{ function: { name: 'web_search', arguments: { query: 'more info' } } }],
      },
      done: true,
    };

    mockClient.chat.mockResolvedValue(toolCallResponse);
    mockOllamaWebSearch.mockResolvedValue({ results: [{ title: 'R', url: 'u', content: 'c' }] });

    const result = await supervisedChat(
      [{ role: 'user', content: 'deep research' }],
      'cipher',
      mockFallback as any,
      { forceLocal: true, privacyMode: 'shared' },
    );

    // Should cap at MAX_TOOL_CALL_ITERATIONS (3) + 1 initial = 4 chat calls max
    expect(mockClient.chat.mock.calls.length).toBeLessThanOrEqual(4);
    expect(result.content).toBe('partial');
  });

  it('returns not-available response when OLLAMA_API_KEY is missing', async () => {
    mockIsWebSearchAvailable.mockReturnValue(false);
    delete process.env.OLLAMA_API_KEY;

    // Model requests web_search but no API key
    mockClient.chat.mockResolvedValueOnce({
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'web_search', arguments: { query: 'test' } } }],
      },
      done: true,
    });

    // After getting "not available" tool response, model answers from training data
    mockClient.chat.mockResolvedValueOnce({
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content: 'Answer from training data' },
      done: true,
    });

    const result = await supervisedChat(
      [{ role: 'user', content: 'search something' }],
      'cipher',
      mockFallback as any,
      { forceLocal: true, privacyMode: 'shared' },
    );

    expect(result.content).toBe('Answer from training data');
    expect(mockOllamaWebSearch).not.toHaveBeenCalled();
  });

  it('does not pass tools when privacyMode is private', async () => {
    mockIsWebSearchAvailable.mockReturnValue(false);

    mockClient.chat.mockResolvedValueOnce({
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content: 'Private mode answer' },
      done: true,
    });

    const result = await supervisedChat(
      [{ role: 'user', content: 'hello' }],
      'cipher',
      mockFallback as any,
      { privacyMode: 'private' },
    );

    expect(result.content).toBe('Private mode answer');
    // Verify the chat call did NOT include tools
    const chatCallArgs = mockClient.chat.mock.calls[0]![0] as Record<string, unknown>;
    expect(chatCallArgs.tools).toBeUndefined();
  });

  it('handles web search API error gracefully', async () => {
    mockIsWebSearchAvailable.mockReturnValue(true);
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');

    // Model requests web_search
    mockClient.chat.mockResolvedValueOnce({
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'web_search', arguments: { query: 'test' } } }],
      },
      done: true,
    });

    // Web search fails
    mockOllamaWebSearch.mockRejectedValueOnce(new Error('Ollama web search failed: HTTP 500'));

    // Model answers after getting failure response
    mockClient.chat.mockResolvedValueOnce({
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content: 'Fallback answer without search' },
      done: true,
    });

    const result = await supervisedChat(
      [{ role: 'user', content: 'search something' }],
      'cipher',
      mockFallback as any,
      { forceLocal: true, privacyMode: 'shared' },
    );

    expect(result.content).toBe('Fallback answer without search');
    expect(mockClient.chat).toHaveBeenCalledTimes(2);
  });

  it('ignores unknown tool names gracefully', async () => {
    mockIsWebSearchAvailable.mockReturnValue(true);
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');

    // Model requests an unknown tool
    mockClient.chat.mockResolvedValueOnce({
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'unknown_tool', arguments: { foo: 'bar' } } }],
      },
      done: true,
    });

    // Model answers after getting "not available" tool response
    mockClient.chat.mockResolvedValueOnce({
      model: 'llama3.2',
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content: 'OK no tool then' },
      done: true,
    });

    const result = await supervisedChat(
      [{ role: 'user', content: 'do something' }],
      'cipher',
      mockFallback as any,
      { forceLocal: true, privacyMode: 'shared' },
    );

    expect(result.content).toBe('OK no tool then');
    expect(mockOllamaWebSearch).not.toHaveBeenCalled();
  });
});
