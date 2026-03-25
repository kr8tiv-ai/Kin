/**
 * React hook for support chat interactions.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface ChatMessage {
  message_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    kb_article?: string;
    confidence?: number;
  };
}

export interface UseSupportChatOptions {
  ownerId?: string;
  onEscalationNeeded?: () => void;
}

export interface UseSupportChatReturn {
  sessionId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  escalate: (reason: string, priority?: 'low' | 'medium' | 'high' | 'urgent') => Promise<boolean>;
  suggestedQuestions: string[];
  closeSession: () => Promise<void>;
}

export function useSupportChat(
  options: UseSupportChatOptions = {}
): UseSupportChatReturn {
  const { ownerId, onEscalationNeeded } = options;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);

  const sendMessage = useCallback(async (message: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          session_id: sessionId,
          owner_id: ownerId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }

      const data = await response.json();

      setSessionId(data.session_id);
      setMessages(prev => [
        ...prev,
        { message_id: `user-${Date.now()}`, role: 'user', content: message, timestamp: new Date().toISOString() },
        data.message,
      ]);

      if (data.suggested_questions) {
        setSuggestedQuestions(data.suggested_questions);
      }

      if (data.escalation_needed && onEscalationNeeded) {
        onEscalationNeeded();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [sessionId, ownerId, onEscalationNeeded]);

  const escalate = useCallback(async (
    reason: string,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
  ): Promise<boolean> => {
    if (!sessionId) return false;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/support/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, reason, priority }),
      });

      if (!response.ok) {
        throw new Error(`Failed to escalate: ${response.status}`);
      }

      const data = await response.json();

      // Add system message about escalation
      setMessages(prev => [
        ...prev,
        {
          message_id: `sys-${Date.now()}`,
          role: 'system',
          content: `Your request has been escalated to human support. Queue position: ${data.escalation?.escalation_id || 'pending'}`,
          timestamp: new Date().toISOString(),
        },
      ]);

      return data.success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const closeSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      await fetch(`/api/support/sessions/${sessionId}/close`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Error closing session:', err);
    }
  }, [sessionId]);

  return {
    sessionId,
    messages,
    loading,
    error,
    sendMessage,
    escalate,
    suggestedQuestions,
    closeSession,
  };
}

export default useSupportChat;
