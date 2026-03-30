'use client';

// ============================================================================
// ChatWindow — Real-time chat interface for talking to your KIN companion.
// Features: markdown rendering, typewriter effect, copy-to-clipboard,
// message reactions, quick-reply chips, enhanced typing indicator.
// ============================================================================

import { useRef, useEffect, useState, useCallback, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { ChatMarkdown } from '@/components/dashboard/ChatMarkdown';
import { useChat, type ChatMessage } from '@/hooks/useChat';
import { COMPANIONS, type CompanionData } from '@/lib/companions';
import { cn } from '@/lib/utils';
import { kinApi } from '@/lib/api';

// ============================================================================
// Quick-reply suggestions per companion
// ============================================================================

const QUICK_REPLIES: Record<string, string[]> = {
  cipher: ['Help me design a UI', 'Review my code', 'Brainstorm an idea', 'Teach me something'],
  mischief: ['Help with social media', 'Family activity ideas', 'Build my brand', 'Tell me something fun'],
  vortex: ['Analyze my content', 'Brand voice check', 'Strategy for growth', 'Explain analytics'],
  forge: ['Review this code', 'Debug an issue', 'Architecture advice', 'Best practices'],
  aether: ['Help me write', 'Edit my prose', 'Story ideas', 'Creative feedback'],
  catalyst: ['Budget tips', 'Build a habit', 'Life optimization', 'Goal setting'],
};

const REACTION_EMOJIS = ['❤️', '🔥', '💡', '😂', '🎯'];

const THINKING_PHRASES = [
  'is thinking',
  'is crafting a response',
  'is pondering',
  'is working on it',
];

// ============================================================================
// Typewriter hook — reveals text character by character
// ============================================================================

function useTypewriter(text: string, enabled: boolean, speed = 18) {
  const [displayed, setDisplayed] = useState('');
  const [isDone, setIsDone] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      setIsDone(true);
      return;
    }

    setDisplayed('');
    setIsDone(false);
    let i = 0;

    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setIsDone(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, enabled, speed]);

  return { displayed, isDone };
}

// ============================================================================
// ChatWindow
// ============================================================================

interface ChatWindowProps {
  companionId: string;
  className?: string;
}

export function ChatWindow({ companionId, className }: ChatWindowProps) {
  const companion: CompanionData = COMPANIONS[companionId] ?? COMPANIONS['cipher']!;
  const { messages, isLoading, error, sendMessage, clearMessages } = useChat({
    companionId,
  });
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [newestAssistantId, setNewestAssistantId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Track the newest assistant message for typewriter effect
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant') {
      setNewestAssistantId(lastMsg.id);
    }
  }, [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim()) return;
      const message = input;
      setInput('');
      await sendMessage(message);
      inputRef.current?.focus();
    },
    [input, sendMessage],
  );

  const handleQuickReply = useCallback(
    async (text: string) => {
      await sendMessage(text);
      inputRef.current?.focus();
    },
    [sendMessage],
  );

  const handleVoiceToggle = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 1000) return; // Too short

        setIsTranscribing(true);
        try {
          // Send to transcription endpoint — falls back to text input on error
          const formData = new FormData();
          formData.append('audio', audioBlob, 'voice.webm');
          formData.append('companionId', companionId);

          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/voice`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });

          if (res.ok) {
            const data = await res.json();
            if (data.transcription) {
              // Send transcribed text through normal chat flow
              await sendMessage(data.transcription);
            }
          }
        } catch (err) {
          console.error('Voice transcription failed:', err);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      // Microphone permission denied — silently ignore
    }
  }, [isRecording, companionId, sendMessage]);

  const quickReplies = QUICK_REPLIES[companionId] ?? QUICK_REPLIES['cipher']!;
  const showQuickReplies = messages.length === 0 && !isLoading;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="text-2xl" aria-hidden="true">
              {companion.emoji}
            </span>
            {/* Online indicator */}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-black" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              {companion.name}
            </h2>
            <p
              className="text-xs font-mono"
              style={{ color: `var(--color-${companion.color})` }}
            >
              {companion.species}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Memory indicator */}
          {messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.02] px-2.5 py-1"
              title={`${companion.name} has ${messages.length} messages in memory`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan/50">
                <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z" strokeLinecap="round" />
                <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-mono text-white/30">
                {Math.ceil(messages.length / 2)} exchanges
              </span>
            </motion.div>
          )}

          <button
            type="button"
            onClick={clearMessages}
            className="rounded-lg px-3 py-1.5 text-xs text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
          >
            New chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Empty state */}
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <motion.span
              className="text-5xl mb-4 block"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              {companion.emoji}
            </motion.span>
            <p className="text-white/60 text-sm max-w-sm mb-6">
              Start chatting with {companion.name}. Ask anything about{' '}
              {companion.tagline.toLowerCase()}.
            </p>

            {/* Quick-reply chips */}
            {showQuickReplies && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="flex flex-wrap justify-center gap-2 max-w-md"
              >
                {quickReplies.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => handleQuickReply(text)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/60 transition-all duration-200 hover:border-cyan/30 hover:bg-cyan/5 hover:text-cyan"
                  >
                    {text}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              companion={companion}
              isNewest={msg.id === newestAssistantId}
            />
          ))}
        </AnimatePresence>

        {/* Enhanced typing indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan/10 text-cyan text-sm">
              {companion.emoji}
            </div>
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <span className="font-medium text-white/50">{companion.name}</span>
              <span>{THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]}</span>
              <span className="inline-flex gap-0.5">
                <span className="typing-dot" />
                <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
                <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
              </span>
            </div>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-400"
          >
            {error}
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-white/10 px-4 py-3"
      >
        <div className="flex gap-2">
          {/* Voice button */}
          <button
            type="button"
            onClick={handleVoiceToggle}
            disabled={isLoading || isTranscribing}
            aria-label={isRecording ? 'Stop recording' : 'Voice message'}
            className={cn(
              'rounded-lg border p-2.5 text-sm transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center',
              isRecording
                ? 'bg-magenta/20 border-magenta/40 text-magenta animate-pulse'
                : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60',
              (isLoading || isTranscribing) && 'opacity-30 cursor-not-allowed',
            )}
          >
            {isTranscribing ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isRecording ? 'Listening...' : `Message ${companion.name}...`}
            disabled={isLoading || isRecording}
            maxLength={4000}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-cyan/50 focus:outline-none focus:ring-1 focus:ring-cyan/50 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
            className="rounded-lg bg-cyan/10 border border-cyan/20 p-2.5 text-sm font-medium text-cyan transition-all duration-200 hover:bg-cyan/20 hover:shadow-[0_0_20px_rgba(0,240,255,0.15)] disabled:opacity-30 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// ChatBubble — Individual message with markdown, copy, and reactions
// ============================================================================

function ChatBubble({
  message,
  companion,
  isNewest,
}: {
  message: ChatMessage;
  companion: CompanionData;
  isNewest: boolean;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const [copied, setCopied] = useState(false);
  const [reactions, setReactions] = useState<string[]>([]);
  const [showReactions, setShowReactions] = useState(false);

  // Typewriter for newest assistant message
  const { displayed, isDone } = useTypewriter(
    message.content,
    isAssistant && isNewest,
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const toggleReaction = useCallback((emoji: string) => {
    setReactions((prev) =>
      prev.includes(emoji) ? prev.filter((r) => r !== emoji) : [...prev, emoji],
    );
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('group flex gap-3', isUser && 'flex-row-reverse')}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm',
          isUser ? 'bg-white/10 text-white/60' : 'bg-cyan/10 text-cyan',
        )}
      >
        {isUser ? '👤' : companion.emoji}
      </div>

      {/* Bubble + actions */}
      <div className={cn('max-w-[80%]', isUser && 'flex flex-col items-end')}>
        <GlassCard
          hover={false}
          className={cn(
            'px-4 py-2.5 relative',
            isUser ? 'bg-cyan/5 border-cyan/10' : 'bg-white/[0.03]',
          )}
        >
          {/* Message content */}
          {isUser ? (
            <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          ) : (
            <ChatMarkdown
              content={isAssistant ? displayed : message.content}
              className="text-sm leading-relaxed"
            />
          )}

          {/* Typewriter cursor */}
          {isAssistant && isNewest && !isDone && (
            <span className="inline-block w-0.5 h-4 bg-cyan/60 animate-pulse ml-0.5 align-middle" />
          )}

          {/* Timestamp */}
          <p className="mt-1.5 text-[10px] text-white/20">
            {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>

          {/* Copy button (assistant only) */}
          {isAssistant && isDone && (
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 rounded-md p-1 text-white/0 transition-all duration-200 group-hover:text-white/30 hover:!text-white/60 hover:bg-white/5"
              title="Copy message"
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          )}
        </GlassCard>

        {/* Reaction bar (assistant only) */}
        {isAssistant && isDone && (
          <div className="flex items-center gap-1 mt-1 ml-1">
            {/* Existing reactions */}
            {reactions.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => toggleReaction(emoji)}
                className="rounded-full bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs transition-all hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}

            {/* Add reaction button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowReactions(!showReactions)}
                className="rounded-full p-1 text-white/0 transition-all duration-200 group-hover:text-white/20 hover:!text-white/40 hover:bg-white/5"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </button>

              {/* Reaction picker popover */}
              <AnimatePresence>
                {showReactions && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-1 flex gap-0.5 rounded-full border border-white/10 bg-surface/90 backdrop-blur-lg px-2 py-1 shadow-xl"
                  >
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          toggleReaction(emoji);
                          setShowReactions(false);
                        }}
                        className="rounded-full p-1 text-sm transition-transform hover:scale-125"
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
