'use client';

// ============================================================================
// useChat — Hook for real-time chat with a KIN companion via the API.
//
// Features:
//   - Loads conversation history on mount (from GET /conversations/:id/messages)
//   - Real-time SSE streaming via POST /chat/stream
//   - Falls back to POST /chat if streaming fails
//   - Persists active conversationId per companion in sessionStorage
//   - Retry support for failed messages
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { kinApi } from '@/lib/api';
import { track } from '@/lib/analytics';
import Cookies from 'js-cookie';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Set to true while the assistant message is still streaming */
  isStreaming?: boolean;
  /** Set when a user message failed to send */
  failed?: boolean;
}

interface StreamEvent {
  content: string;
  done: boolean;
  conversationId?: string;
  companionId?: string;
  route?: string;
  latencyMs?: number;
  error?: string;
}

interface UseChatOptions {
  companionId?: string;
  conversationId?: string;
  /** Called when a new response arrives (after streaming completes) */
  onResponse?: (message: ChatMessage) => void;
}

interface UseChatResult {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  conversationId: string | null;
  historyLoading: boolean;
  /** Send a message and get a streaming companion response */
  sendMessage: (content: string) => Promise<void>;
  /** Retry the last failed message */
  retryLastMessage: () => Promise<void>;
  /** Clear messages and start fresh */
  clearMessages: () => void;
}

let messageCounter = 0;
function generateId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

// Persist active conversation per companion in sessionStorage
function getStoredConversationId(companionId: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(`kin_convo_${companionId}`);
}

function storeConversationId(companionId: string, convoId: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (convoId) {
    sessionStorage.setItem(`kin_convo_${companionId}`, convoId);
  } else {
    sessionStorage.removeItem(`kin_convo_${companionId}`);
  }
}

export function useChat(options: UseChatOptions = {}): UseChatResult {
  const companionId = options.companionId ?? 'cipher';
  const initialConvoId =
    options.conversationId ?? getStoredConversationId(companionId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConvoId,
  );
  const [historyLoading, setHistoryLoading] = useState(false);

  const companionIdRef = useRef(companionId);
  companionIdRef.current = companionId;
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const abortRef = useRef<AbortController | null>(null);
  const lastFailedContent = useRef<string | null>(null);

  // ── Load conversation history on mount / companionId change ─────────
  useEffect(() => {
    const convoId =
      options.conversationId ?? getStoredConversationId(companionId);
    if (!convoId) return;

    let cancelled = false;
    setHistoryLoading(true);

    kinApi
      .get<{ messages: Array<{ id: string; role: string; content: string; timestamp: string }> }>(
        `/conversations/${convoId}/messages?limit=50`,
      )
      .then((data) => {
        if (cancelled) return;
        const loaded: ChatMessage[] = (data.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.timestamp),
        }));
        setMessages(loaded);
        setConversationId(convoId);
      })
      .catch(() => {
        // Conversation may have been deleted — start fresh
        if (!cancelled) {
          storeConversationId(companionId, null);
          setConversationId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companionId, options.conversationId]);

  // ── Persist conversationId when it changes ──────────────────────────
  useEffect(() => {
    storeConversationId(companionIdRef.current, conversationId);
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // ── Send message with SSE streaming ──────────────────────────────────
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);
      lastFailedContent.current = null;

      // Optimistically add user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // Create placeholder for streaming assistant response
      const assistantId = generateId();

      try {
        // Attempt SSE streaming via POST /chat/stream
        const controller = new AbortController();
        abortRef.current = controller;

        const token = Cookies.get('kin_token');
        const apiBase = typeof window !== 'undefined' ? '/api' : (process.env.NEXT_PUBLIC_API_URL ?? '/api');

        const response = await fetch(`${apiBase}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            companionId: companionIdRef.current,
            message: content.trim(),
            conversationId: conversationIdRef.current,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream failed: ${response.status}`);
        }

        // Add streaming assistant bubble
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true },
        ]);
        setIsStreaming(true);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let finalConvoId: string | null = null;
        let route = 'streaming';
        let latencyMs = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json) continue;

            try {
              const event: StreamEvent = JSON.parse(json);

              if (event.error) {
                throw new Error(event.error);
              }

              if (event.content) {
                fullContent += event.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: fullContent }
                      : m,
                  ),
                );
              }

              if (event.done) {
                finalConvoId = event.conversationId ?? null;
                route = event.route ?? 'streaming';
                latencyMs = event.latencyMs ?? 0;
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== json) {
                throw parseErr;
              }
            }
          }
        }

        // Finalize streaming message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: fullContent, isStreaming: false }
              : m,
          ),
        );
        setIsStreaming(false);

        if (finalConvoId) {
          setConversationId(finalConvoId);
        }

        // Track for analytics
        track('chat_message_sent', {
          companionId: companionIdRef.current,
          route,
          latencyMs,
          streaming: true,
        });

        const finalMsg: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: fullContent,
          timestamp: new Date(),
        };
        options.onResponse?.(finalMsg);
      } catch (err) {
        // If streaming failed, fall back to non-streaming POST /chat
        if ((err as Error).name === 'AbortError') {
          setIsLoading(false);
          setIsStreaming(false);
          return;
        }

        try {
          // Remove streaming placeholder if it exists
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          setIsStreaming(false);

          const result = await kinApi.post<{
            response: string;
            conversationId: string;
            companionId: string;
            route: string;
            latencyMs: number;
          }>('/chat', {
            companionId: companionIdRef.current,
            message: content.trim(),
            conversationId: conversationIdRef.current,
          });

          const assistantMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: result.response,
            timestamp: new Date(),
          };

          setMessages((prev) => [...prev, assistantMessage]);
          setConversationId(result.conversationId);

          track('chat_message_sent', {
            companionId: companionIdRef.current,
            route: result.route,
            latencyMs: result.latencyMs,
            streaming: false,
          });

          options.onResponse?.(assistantMessage);
        } catch (fallbackErr) {
          const message =
            fallbackErr instanceof Error ? fallbackErr.message : 'Failed to send message';
          setError(message);
          lastFailedContent.current = content.trim();

          // Mark user message as failed instead of removing it
          setMessages((prev) =>
            prev
              .filter((m) => m.id !== assistantId)
              .map((m) =>
                m.id === userMessage.id ? { ...m, failed: true } : m,
              ),
          );
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [isLoading, options],
  );

  // ── Retry last failed message ───────────────────────────────────────
  const retryLastMessage = useCallback(async () => {
    if (!lastFailedContent.current) return;
    const content = lastFailedContent.current;
    // Remove the failed user message before retrying
    setMessages((prev) => prev.filter((m) => !m.failed));
    setError(null);
    await sendMessage(content);
  }, [sendMessage]);

  // ── Clear and start new conversation ─────────────────────────────────
  const clearMessages = useCallback(() => {
    // Abort any in-flight stream
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setError(null);
    setIsStreaming(false);
    lastFailedContent.current = null;
    storeConversationId(companionIdRef.current, null);
  }, []);

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    conversationId,
    historyLoading,
    sendMessage,
    retryLastMessage,
    clearMessages,
  };
}
