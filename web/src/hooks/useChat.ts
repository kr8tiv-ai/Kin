'use client';

// ============================================================================
// useChat — Hook for real-time chat with a KIN companion via the API.
// ============================================================================

import { useCallback, useRef, useState } from 'react';
import { kinApi } from '@/lib/api';
import { track } from '@/lib/analytics';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatResponse {
  response: string;
  conversationId: string;
  companionId: string;
  route: string;
  latencyMs: number;
}

interface UseChatOptions {
  companionId?: string;
  conversationId?: string;
  /** Called when a new response arrives */
  onResponse?: (message: ChatMessage) => void;
}

interface UseChatResult {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  /** Send a message and get a companion response */
  sendMessage: (content: string) => Promise<void>;
  /** Clear messages and start fresh */
  clearMessages: () => void;
}

let messageCounter = 0;
function generateId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

export function useChat(options: UseChatOptions = {}): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(
    options.conversationId ?? null,
  );

  const companionIdRef = useRef(options.companionId ?? 'cipher');
  companionIdRef.current = options.companionId ?? 'cipher';

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);

      // Optimistically add user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const result = await kinApi.post<ChatResponse>('/chat', {
          companionId: companionIdRef.current,
          message: content.trim(),
          conversationId,
        });

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: result.response,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setConversationId(result.conversationId);

        // Track for analytics
        track('chat_message_sent', {
          companionId: companionIdRef.current,
          route: result.route,
          latencyMs: result.latencyMs,
        });

        options.onResponse?.(assistantMessage);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to send message';
        setError(message);

        // Remove the optimistic user message on error
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, conversationId, options],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    conversationId,
    sendMessage,
    clearMessages,
  };
}
