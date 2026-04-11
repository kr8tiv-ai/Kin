'use client';

// ============================================================================
// ChatWindow — Real-time chat interface for talking to your KIN companion.
// Features: markdown rendering, typewriter effect, copy-to-clipboard,
// message reactions, quick-reply chips, enhanced typing indicator.
// ============================================================================

import { useRef, useEffect, useState, useCallback, memo, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { GlassCard } from '@/components/ui/GlassCard';
import { ChatMarkdown } from '@/components/dashboard/ChatMarkdown';
import { MediaPlayer } from '@/components/dashboard/MediaPlayer';
import { useChat, type ChatMessage } from '@/hooks/useChat';
import { useTTS } from '@/hooks/useTTS';
import { useVoiceSession, type VoiceSessionState } from '@/hooks/useVoiceSession';
import { COMPANIONS, type CompanionData } from '@/lib/companions';
import { getApiBase, withAuthHeaders } from '@/lib/auth';
import { cn } from '@/lib/utils';

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
  const { messages, isLoading, isStreaming, error, sendMessage, retryLastMessage, clearMessages, historyLoading, addMessage } = useChat({
    companionId,
  });
  const tts = useTTS();
  const t = useTranslations('chat');
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [newestAssistantId, setNewestAssistantId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);

  // ── Voice session ───────────────────────────────────────────────────
  const voiceSession = useVoiceSession({
    companionId,
    onTranscription: (text) => {
      addMessage('user', text);
    },
    onResponse: (text) => {
      addMessage('assistant', text);
    },
    onError: (msg) => {
      // Show error briefly, then auto-dismiss
      setVoiceError(msg);
      if (voiceErrorTimerRef.current) clearTimeout(voiceErrorTimerRef.current);
      voiceErrorTimerRef.current = setTimeout(() => setVoiceError(null), 5000);
    },
  });

  // Clean up error timer on unmount
  useEffect(() => {
    return () => {
      if (voiceErrorTimerRef.current) clearTimeout(voiceErrorTimerRef.current);
    };
  }, []);

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

  // ── Voice button handler ──────────────────────────────────────────────
  const handleVoiceToggle = useCallback(() => {
    if (voiceSession.isActive) {
      if (voiceSession.state === 'recording') {
        // Stop recording (push-to-talk release)
        voiceSession.toggleRecording();
      } else {
        // Stop the entire voice session
        voiceSession.stopSession();
      }
    } else {
      if (wakeWordEnabled && voiceSession.wakeWordAvailable) {
        // Start wake-word listening session
        voiceSession.startSession();
      } else {
        // Push-to-talk: toggle recording directly
        voiceSession.toggleRecording();
      }
    }
  }, [voiceSession, wakeWordEnabled]);

  // ── Wake word toggle handler ────────────────────────────────────────
  const handleWakeWordToggle = useCallback(() => {
    const next = !wakeWordEnabled;
    setWakeWordEnabled(next);
    if (next && voiceSession.wakeWordAvailable) {
      voiceSession.startSession();
    } else if (!next && voiceSession.state === 'listening') {
      voiceSession.stopSession();
    }
  }, [wakeWordEnabled, voiceSession]);

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
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-cyan ring-2 ring-black" />
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
                {t('exchanges', { count: Math.ceil(messages.length / 2) })}
              </span>
            </motion.div>
          )}

          <button
            type="button"
            onClick={clearMessages}
            className="rounded-lg px-3 py-1.5 text-xs text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
          >
            {t('newChat')}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" aria-live="polite" aria-label="Chat messages">
        {/* History loading */}
        {historyLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-white/30 text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              {t('loadingConversation')}
            </div>
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && !isLoading && !historyLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <motion.span
              className="text-5xl mb-4 block"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              {companion.emoji}
            </motion.span>
            <p className="text-white/60 text-sm max-w-sm mb-6">
              {t('emptyState', { name: companion.name, tagline: companion.tagline.toLowerCase() })}
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
              tts={tts}
              t={t}
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

        {/* Error with retry */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg bg-magenta/10 border border-magenta/20 px-4 py-3 text-sm text-magenta flex items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={retryLastMessage}
              className="shrink-0 rounded-md border border-magenta/30 bg-magenta/10 px-3 py-1 text-xs font-medium text-magenta transition-colors hover:bg-magenta/20"
            >
              Retry
            </button>
          </motion.div>
        )}

        {/* Voice error toast */}
        {voiceError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            className="rounded-lg bg-magenta/10 border border-magenta/20 px-4 py-2 text-xs text-magenta flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{voiceError}</span>
            <button type="button" onClick={() => setVoiceError(null)} className="ml-auto text-magenta/60 hover:text-magenta">✕</button>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-white/10 px-4 py-3"
      >
        {/* Voice status bar — shown when voice session is active */}
        {voiceSession.isActive && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <VoiceStateIndicator state={voiceSession.state} companionName={companion.name} t={t} />
            <button
              type="button"
              onClick={() => voiceSession.stopSession()}
              className="ml-auto rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/40 hover:bg-white/10 hover:text-white/60 transition-colors"
            >
              {t('voice.endVoice')}
            </button>
          </div>
        )}

        <div className="flex gap-2">
          {/* Voice button */}
          <button
            type="button"
            onClick={handleVoiceToggle}
            disabled={isLoading || voiceSession.state === 'processing'}
            aria-label={voiceButtonAriaLabelI18n(voiceSession.state, t)}
            title={voiceButtonTooltipI18n(voiceSession.state, wakeWordEnabled, t)}
            className={cn(
              'rounded-lg border p-2.5 text-sm transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center',
              voiceButtonStyles(voiceSession.state),
              (isLoading || voiceSession.state === 'processing') && 'opacity-30 cursor-not-allowed',
            )}
          >
            <VoiceButtonIcon state={voiceSession.state} />
          </button>

          {/* Wake word toggle — only shown when available */}
          {voiceSession.wakeWordAvailable && (
            <button
              type="button"
              onClick={handleWakeWordToggle}
              disabled={voiceSession.state === 'recording' || voiceSession.state === 'processing'}
              aria-label={wakeWordEnabled ? t('voice.disableWakeWord') : t('voice.enableWakeWord')}
              title={wakeWordEnabled ? t('voice.wakeWordActiveTitle') : t('voice.enableWakeWordTitle')}
              className={cn(
                'rounded-lg border p-2 text-xs transition-all duration-200 min-w-[36px] min-h-[44px] flex items-center justify-center',
                wakeWordEnabled
                  ? 'bg-cyan/10 border-cyan/30 text-cyan'
                  : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10 hover:text-white/50',
              )}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voiceInputPlaceholderI18n(voiceSession.state, companion.name, t)}
            disabled={isLoading || voiceSession.state === 'recording' || voiceSession.state === 'processing'}
            maxLength={4000}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-cyan/50 focus:outline-none focus:ring-1 focus:ring-cyan/50 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label={t('sendMessage')}
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
// Voice UI helpers — pure functions for voice session state → UI mapping
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFn = (key: string, values?: Record<string, string | number>) => any;

function voiceButtonAriaLabelI18n(state: VoiceSessionState, t: TranslationFn): string {
  switch (state) {
    case 'recording': return t('voice.stopRecording');
    case 'listening': return t('voice.wakeWordActive');
    case 'processing': return t('voice.processingVoice');
    case 'playing': return t('voice.playingResponse');
    default: return t('voice.voiceMessage');
  }
}

function voiceButtonTooltipI18n(state: VoiceSessionState, wakeWordEnabled: boolean, t: TranslationFn): string {
  switch (state) {
    case 'recording': return t('voice.clickToStop');
    case 'listening': return t('voice.listeningForWakeWord');
    case 'processing': return t('voice.processingYourVoice');
    case 'playing': return t('voice.playingCompanionResponse');
    default: return wakeWordEnabled ? t('voice.startVoiceSession') : t('voice.pushToTalk');
  }
}

function voiceInputPlaceholderI18n(state: VoiceSessionState, companionName: string, t: TranslationFn): string {
  switch (state) {
    case 'recording': return t('voice.listening');
    case 'listening': return t('voice.waitingForWakeWord');
    case 'processing': return t('voice.processing');
    case 'playing': return t('voice.speaking', { name: companionName });
    default: return t('placeholder', { name: companionName });
  }
}

function voiceButtonAriaLabel(state: VoiceSessionState): string {
  switch (state) {
    case 'recording': return 'Stop recording';
    case 'listening': return 'Recording — wake word active';
    case 'processing': return 'Processing voice...';
    case 'playing': return 'Playing response';
    default: return 'Voice message';
  }
}

function voiceButtonTooltip(state: VoiceSessionState, wakeWordEnabled: boolean): string {
  switch (state) {
    case 'recording': return 'Click to stop recording';
    case 'listening': return 'Listening for wake word...';
    case 'processing': return 'Processing your voice...';
    case 'playing': return 'Playing companion response';
    default: return wakeWordEnabled ? 'Start voice session' : 'Push to talk';
  }
}

function voiceButtonStyles(state: VoiceSessionState): string {
  switch (state) {
    case 'recording':
      return 'bg-magenta/20 border-magenta/40 text-magenta animate-pulse';
    case 'listening':
      return 'bg-cyan/15 border-cyan/30 text-cyan animate-pulse';
    case 'processing':
      return 'bg-gold/15 border-gold/30 text-gold';
    case 'playing':
      return 'bg-cyan/10 border-cyan/20 text-cyan';
    default:
      return 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60';
  }
}

function voiceInputPlaceholder(state: VoiceSessionState, companionName: string): string {
  switch (state) {
    case 'recording': return 'Listening...';
    case 'listening': return 'Waiting for wake word...';
    case 'processing': return 'Processing...';
    case 'playing': return `${companionName} is speaking...`;
    default: return `Message ${companionName}...`;
  }
}

/** Inline SVG icon that reflects the current voice state. */
function VoiceButtonIcon({ state }: { state: VoiceSessionState }) {
  switch (state) {
    case 'recording':
      // Red pulsing circle
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
    case 'listening':
      // Sound-wave / ear icon
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      );
    case 'processing':
      // Spinner
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      );
    case 'playing':
      // Speaker icon with animated waves
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      );
    default:
      // Default microphone icon
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      );
  }
}

/** Status bar showing the active voice session state. */
function VoiceStateIndicator({ state, companionName, t }: { state: VoiceSessionState; companionName: string; t: TranslationFn }) {
  const labels: Record<VoiceSessionState, string> = {
    idle: '',
    listening: t('voice.listeningIndicator'),
    recording: t('voice.recordingIndicator'),
    processing: t('voice.processingIndicator'),
    playing: t('voice.respondingIndicator', { name: companionName }),
  };

  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-xs text-white/50 font-mono"
    >
      {labels[state]}
    </motion.span>
  );
}

// ============================================================================
// ChatBubble — Individual message with markdown, copy, and reactions
// ============================================================================

const ChatBubble = memo(function ChatBubble({
  message,
  companion,
  isNewest,
  tts,
  t,
}: {
  message: ChatMessage;
  companion: CompanionData;
  isNewest: boolean;
  tts?: { speak: (id: string, text: string, companionId: string) => Promise<void>; stop: () => void; playingId: string | null; loading: boolean };
  t: TranslationFn;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const [copied, setCopied] = useState(false);
  const [reactions, setReactions] = useState<string[]>([]);
  const [showReactions, setShowReactions] = useState(false);

  // Use real streaming content directly — no fake typewriter needed.
  // isNewest with isStreaming means tokens are arriving in real-time.
  const displayed = message.content;
  const isDone = !(message as any).isStreaming;

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

          {/* Inline media player for generated video/audio */}
          {message.mediaUrl && message.mediaType && (
            <div className="mt-2">
              <MediaPlayer url={message.mediaUrl} type={message.mediaType} />
            </div>
          )}

          {/* Typewriter cursor */}
          {isAssistant && isNewest && !isDone && (
            <span className="inline-block w-0.5 h-4 bg-cyan/60 animate-pulse ml-0.5 align-middle" />
          )}

          {/* Timestamp */}
          <time
            dateTime={message.timestamp.toISOString()}
            className="mt-1.5 block text-[10px] text-white/20 font-mono"
          >
            {message.timestamp.toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </time>

          {/* TTS + Copy buttons (assistant only) */}
          {isAssistant && isDone && (
            <div className="absolute top-2 right-2 flex gap-0.5">
            {tts && (
              <button
                type="button"
                onClick={() => tts.playingId === message.id ? tts.stop() : tts.speak(message.id, message.content, companion.id)}
                disabled={tts.loading}
                className={cn(
                  'rounded-md p-1 transition-all duration-200',
                  tts.playingId === message.id
                    ? 'text-cyan animate-pulse'
                    : 'text-white/0 group-hover:text-white/30 hover:!text-white/60 hover:bg-white/5',
                  tts.loading && 'opacity-50 cursor-wait',
                )}
                title={tts.playingId === message.id ? t('stopPlayback') : t('listen')}
              >
                {tts.playingId === message.id ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md p-1 text-white/0 transition-all duration-200 group-hover:text-white/30 hover:!text-white/60 hover:bg-white/5"
              title={t('copyMessage')}
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
            </div>
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
});

ChatBubble.displayName = 'ChatBubble';
