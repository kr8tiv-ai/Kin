/**
 * Local LLM Client - Ollama API integration
 *
 * Provides a TypeScript client for Ollama local inference with:
 * - Streaming response support
 * - Error handling and retries
 * - Connection health checks
 * - Model management utilities
 *
 * @module inference/local-llm
 */

// ============================================================================
// Types
// ============================================================================

export interface OllamaConfig {
  /** Ollama API host (default: 127.0.0.1) */
  host?: string;
  /** Ollama API port (default: 11434) */
  port?: number;
  /** Default model to use */
  defaultModel?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Base delay between retries in milliseconds */
  retryDelay?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // Base64 encoded images
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: 'json' | 'text';
  options?: ModelOptions;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  format?: 'json' | 'text';
  options?: ModelOptions;
}

export interface ModelOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_ctx?: number;
  num_predict?: number;
  stop?: string[];
  seed?: number;
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface GenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface ChatResponse {
  model: string;
  created_at: string;
  message: ChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface ModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface ModelDetails {
  modelfile: string;
  parameters: string;
  template: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
  model_info: Record<string, unknown>;
}

export interface HealthStatus {
  healthy: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

export type StreamCallback = (chunk: string, done: boolean) => void;

// ============================================================================
// Ollama Client
// ============================================================================

/**
 * Ollama API client for local LLM inference
 */
export class OllamaClient {
  private baseUrl: string;
  private defaultModel: string;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;

  constructor(config: OllamaConfig = {}) {
    const host = config.host ?? process.env.OLLAMA_HOST ?? '127.0.0.1';
    const port = config.port ?? parseInt(process.env.OLLAMA_PORT ?? '11434', 10);
    
    this.baseUrl = `http://${host}:${port}`;
    this.defaultModel = config.defaultModel ?? process.env.OLLAMA_MODEL ?? 'llama3.2';
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
  }

  // ==========================================================================
  // Health & Status
  // ==========================================================================

  /**
   * Check if Ollama service is healthy and responsive
   */
  async checkHealth(): Promise<HealthStatus> {
    const start = performance.now();
    
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/version`, {
        method: 'GET',
      });
      
      const latencyMs = performance.now() - start;
      
      if (response.ok) {
        const data = await response.json();
        return {
          healthy: true,
          latencyMs,
          version: data.version,
        };
      }
      
      return {
        healthy: false,
        latencyMs,
        error: `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: performance.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if the service is available within a timeout
   */
  async isAvailable(timeoutMs: number = 5000): Promise<boolean> {
    try {
      const health = await Promise.race([
        this.checkHealth(),
        new Promise<HealthStatus>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeoutMs)
        ),
      ]);
      return health.healthy;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Chat API
  // ==========================================================================

  /**
   * Send a chat completion request
   */
  async chat(request: Partial<ChatRequest>): Promise<ChatResponse> {
    const fullRequest: ChatRequest = {
      model: request.model ?? this.defaultModel,
      messages: request.messages ?? [],
      stream: false,
      ...request,
    };

    return this.withRetry(async () => {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullRequest),
      });

      if (!response.ok) {
        throw new OllamaError(`Chat request failed: ${response.status}`, response.status);
      }

      return response.json();
    });
  }

  /**
   * Send a chat request with streaming response
   */
  async chatStream(
    request: Partial<ChatRequest>,
    onChunk: StreamCallback
  ): Promise<ChatResponse> {
    const fullRequest: ChatRequest = {
      model: request.model ?? this.defaultModel,
      messages: request.messages ?? [],
      stream: true,
      ...request,
    };

    return this.withRetry(async () => {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullRequest),
      });

      if (!response.ok) {
        throw new OllamaError(`Chat stream request failed: ${response.status}`, response.status);
      }

      return this.processStream(response, onChunk);
    });
  }

  // ==========================================================================
  // Generate API
  // ==========================================================================

  /**
   * Send a generate completion request
   */
  async generate(request: Partial<GenerateRequest>): Promise<GenerateResponse> {
    const fullRequest: GenerateRequest = {
      model: request.model ?? this.defaultModel,
      prompt: request.prompt ?? '',
      stream: false,
      ...request,
    };

    return this.withRetry(async () => {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullRequest),
      });

      if (!response.ok) {
        throw new OllamaError(`Generate request failed: ${response.status}`, response.status);
      }

      return response.json();
    });
  }

  /**
   * Send a generate request with streaming response
   */
  async generateStream(
    request: Partial<GenerateRequest>,
    onChunk: StreamCallback
  ): Promise<GenerateResponse> {
    const fullRequest: GenerateRequest = {
      model: request.model ?? this.defaultModel,
      prompt: request.prompt ?? '',
      stream: true,
      ...request,
    };

    return this.withRetry(async () => {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullRequest),
      });

      if (!response.ok) {
        throw new OllamaError(`Generate stream request failed: ${response.status}`, response.status);
      }

      return this.processStream(response, onChunk);
    });
  }

  // ==========================================================================
  // Model Management
  // ==========================================================================

  /**
   * List available models
   */
  async listModels(): Promise<ModelInfo[]> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new OllamaError(`List models failed: ${response.status}`, response.status);
    }

    const data = await response.json();
    return data.models ?? [];
  }

  /**
   * Get details for a specific model
   */
  async getModelInfo(model: string): Promise<ModelDetails> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
    });

    if (!response.ok) {
      throw new OllamaError(`Get model info failed: ${response.status}`, response.status);
    }

    return response.json();
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(model: string, onProgress?: (status: string) => void): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });

    if (!response.ok) {
      throw new OllamaError(`Pull model failed: ${response.status}`, response.status);
    }

    // Process streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new OllamaError('No response body', 500);
    }

    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (onProgress && data.status) {
            onProgress(data.status);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  /**
   * Create a model from a Modelfile content string.
   *
   * Calls POST /api/create with streaming NDJSON progress — same pattern as
   * pullModel(). The Ollama API returns {"status": "..."} lines during
   * processing, then {"status": "success"} on completion.
   */
  async createModel(
    name: string,
    modelfileContent: string,
    onProgress?: (status: string) => void,
  ): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, modelfile: modelfileContent, stream: true }),
    });

    if (!response.ok) {
      throw new OllamaError(`Create model failed: ${response.status}`, response.status);
    }

    // Process NDJSON streaming response (same as pullModel)
    const reader = response.body?.getReader();
    if (!reader) {
      throw new OllamaError('No response body', 500);
    }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (onProgress && data.status) {
            onProgress(data.status);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  /**
   * Delete a model from the local Ollama instance
   */
  async deleteModel(model: string): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
    });

    if (!response.ok) {
      throw new OllamaError(`Delete model failed: ${response.status}`, response.status);
    }
  }

  /**
   * Check if a specific model is available
   */
  async hasModel(model: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(m => m.name === model || m.name.startsWith(model + ':'));
  }

  // ==========================================================================
  // Embeddings API
  // ==========================================================================

  /**
   * Generate embeddings for text
   */
  async embeddings(prompt: string, model?: string): Promise<number[]> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model ?? this.defaultModel,
        prompt,
      }),
    });

    if (!response.ok) {
      throw new OllamaError(`Embeddings request failed: ${response.status}`, response.status);
    }

    const data = await response.json();
    return data.embedding;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Process streaming response
   */
  private async processStream<T extends { done: boolean }>(
    response: Response,
    onChunk: StreamCallback
  ): Promise<T> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new OllamaError('No response body', 500);
    }

    const decoder = new TextDecoder();
    let finalResult: T | null = null;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const data = JSON.parse(line) as T & { response?: string; message?: ChatMessage };
          finalResult = data;

          // Extract content based on response type
          const content = data.response ?? (data as { message?: ChatMessage }).message?.content ?? '';
          if (content) {
            onChunk(content, data.done);
          }
        } catch {
          // Ignore parse errors for individual chunks
        }
      }
    }

    if (!finalResult) {
      throw new OllamaError('No response received', 500);
    }

    return finalResult;
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on certain errors
        if (error instanceof OllamaError && error.status === 400) {
          throw error;
        }

        // Wait before retrying
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error('Retry failed');
  }
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Custom error for Ollama API errors
 */
export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultClient: OllamaClient | null = null;

/**
 * Get the default Ollama client instance
 */
export function getOllamaClient(config?: OllamaConfig): OllamaClient {
  if (!defaultClient || config) {
    defaultClient = new OllamaClient(config);
  }
  return defaultClient;
}

/**
 * Create a new Ollama client with custom config
 */
export function createOllamaClient(config: OllamaConfig): OllamaClient {
  return new OllamaClient(config);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick chat completion
 */
export async function chat(
  messages: ChatMessage[],
  options?: Partial<ChatRequest> & { model?: string }
): Promise<string> {
  const client = getOllamaClient();
  const response = await client.chat({
    messages,
    model: options?.model,
    options: options?.options,
  });
  return response.message.content;
}

/**
 * Quick chat completion with streaming
 */
export async function chatStream(
  messages: ChatMessage[],
  onChunk: StreamCallback,
  options?: Partial<ChatRequest> & { model?: string }
): Promise<string> {
  const client = getOllamaClient();
  let fullContent = '';

  await client.chatStream(
    {
      messages,
      model: options?.model,
      options: options?.options,
    },
    (chunk) => {
      fullContent += chunk;
      onChunk(chunk, false);
    }
  );

  return fullContent;
}

/**
 * Quick generate completion
 */
export async function generate(
  prompt: string,
  options?: Partial<GenerateRequest> & { model?: string }
): Promise<string> {
  const client = getOllamaClient();
  const response = await client.generate({
    prompt,
    model: options?.model,
    options: options?.options,
  });
  return response.response;
}

/**
 * Check if local LLM is available
 */
export async function isLocalLlmAvailable(): Promise<boolean> {
  const client = getOllamaClient();
  return client.isAvailable(5000);
}

// ============================================================================
// Exports
// ============================================================================

export default OllamaClient;
