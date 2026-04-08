'use client';

// ============================================================================
// StepReady — Onboarding final step: Complete + first companion message.
//
// After onboarding.complete() succeeds, fetches a real personalized first
// message from the companion via POST /kin/first-message. Shows a typing
// animation then the actual response in a chat bubble.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCompanion, getCompanionColor } from '@/lib/companions';
import { kinApi } from '@/lib/api';
import { track } from '@/lib/analytics';
import { CompanionViewer } from '@/components/3d/CompanionViewer';
import { Button } from '@/components/ui/Button';

interface StepReadyProps {
  selectedCompanionId: string | null;
  completing: boolean;
  error: string | null;
  onComplete: () => void;
  /** User profile data from onboarding for the first-message endpoint */
  userProfile?: {
    displayName?: string;
    interests?: string[];
    goals?: string[];
  };
  /** Current onboarding flow mode for analytics */
  flowMode?: 'quick' | 'detailed';
}

// Decorative dots with companion-accent coloring
function ConfettiDots({ color }: { color: string }) {
  const dots = [
    { size: 6, x: '10%', y: '20%', delay: 0 },
    { size: 4, x: '85%', y: '15%', delay: 0.2 },
    { size: 8, x: '75%', y: '70%', delay: 0.4 },
    { size: 5, x: '15%', y: '75%', delay: 0.1 },
    { size: 3, x: '90%', y: '45%', delay: 0.3 },
    { size: 7, x: '5%', y: '50%', delay: 0.5 },
    { size: 4, x: '50%', y: '5%', delay: 0.15 },
    { size: 6, x: '60%', y: '90%', delay: 0.35 },
  ];

  return (
    <>
      {dots.map((dot, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: dot.size,
            height: dot.size,
            left: dot.x,
            top: dot.y,
            backgroundColor: color,
            opacity: 0.3,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1.2, 1],
            opacity: [0, 0.5, 0.3],
          }}
          transition={{
            duration: 0.6,
            delay: 0.4 + dot.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </>
  );
}

// ============================================================================
// TypingIndicator — Animated dots shown while generating the first message
// ============================================================================

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 bg-white/[0.04] rounded-2xl rounded-tl-sm px-3 py-2 w-fit">
      {[0, 0.15, 0.3].map((delay, i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// CompanionMessage — The companion's real first message in a chat bubble
// ============================================================================

function CompanionMessage({
  emoji,
  name,
  message,
}: {
  emoji: string;
  name: string;
  message: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-start gap-2"
    >
      <span className="mt-1 text-base flex-shrink-0">{emoji}</span>
      <div>
        <span className="text-[10px] text-white/30 mb-1 block">{name}</span>
        <div className="max-w-sm rounded-2xl rounded-tl-sm bg-white/[0.04] border border-white/5 px-4 py-3 text-sm text-white/80 leading-relaxed">
          {message}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// StepReady — Main component
// ============================================================================

type ReadyPhase = 'initial' | 'completing' | 'generating' | 'done' | 'error';

export function StepReady({
  selectedCompanionId,
  completing,
  error,
  onComplete,
  userProfile,
  flowMode = 'detailed',
}: StepReadyProps) {
  const companion = selectedCompanionId ? getCompanion(selectedCompanionId) : null;
  const companionColor = selectedCompanionId
    ? getCompanionColor(selectedCompanionId)
    : '#00f0ff';

  const [phase, setPhase] = useState<ReadyPhase>('initial');
  const [firstMessage, setFirstMessage] = useState<string | null>(null);
  const [firstMessageError, setFirstMessageError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Fetch first companion message after onboarding completes
  const fetchFirstMessage = useCallback(async () => {
    if (!selectedCompanionId || fetchedRef.current) return;
    fetchedRef.current = true;
    setPhase('generating');

    try {
      const result = await kinApi.post<{
        message: string;
        companionId: string;
        route: string;
        latencyMs: number;
      }>('/kin/first-message', {
        companionId: selectedCompanionId,
        userProfile: userProfile ?? {},
      });

      setFirstMessage(result.message);
      setPhase('done');

      track('onboarding_first_message', {
        companionId: selectedCompanionId,
        flowMode,
        route: result.route,
        latencyMs: result.latencyMs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get first message';
      setFirstMessageError(msg);
      // Still allow the user to proceed — the first message is a nice-to-have
      setPhase('done');
    }
  }, [selectedCompanionId, userProfile, flowMode]);

  async function handleComplete() {
    setPhase('completing');
    track('onboarding_completed', { companionId: selectedCompanionId ?? 'unknown' });
    onComplete();
  }

  // When completing transitions to false (success), trigger first message fetch
  useEffect(() => {
    if (phase === 'completing' && !completing && !error) {
      fetchFirstMessage();
    }
    // If parent set completing=true before mount (edge case), stay synced
    if (completing && phase === 'initial') {
      setPhase('completing');
    }
  }, [completing, error, phase, fetchFirstMessage]);

  // Reset on error
  useEffect(() => {
    if (error && phase === 'completing') {
      setPhase('error');
    }
  }, [error, phase]);

  const showFirstMessage = phase === 'done' || phase === 'generating';
  const isLoading = phase === 'completing' || phase === 'generating';

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="relative flex flex-col items-center"
    >
      {/* Confetti decoration */}
      <ConfettiDots color={companionColor} />

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-2 text-center font-display text-3xl font-bold sm:text-4xl"
      >
        <span className="bg-gradient-to-r from-cyan via-magenta to-gold bg-clip-text text-transparent">
          {showFirstMessage ? 'Meet Your Companion' : "You're Almost There!"}
        </span>
      </motion.h1>

      {showFirstMessage && companion && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-6 text-center text-sm text-white/40"
        >
          {companion.emoji} {companion.name} has something to say...
        </motion.p>
      )}

      {/* Companion viewer */}
      {companion && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="my-6"
        >
          <div className="relative mx-auto h-48 w-48 overflow-hidden rounded-2xl border border-white/10">
            <CompanionViewer
              fallbackImage={companion.images[0]}
              alt={companion.name}
              className="h-full w-full"
              modelReady={false}
            />
          </div>

          {!showFirstMessage && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-4 text-center text-base font-medium text-white"
            >
              {companion.emoji} {companion.name} is ready to meet you!
            </motion.p>
          )}
        </motion.div>
      )}

      {/* First message area — shown after onboarding completes */}
      <AnimatePresence>
        {showFirstMessage && companion && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full max-w-md mx-auto mb-6"
          >
            {phase === 'generating' && !firstMessage && (
              <div className="flex items-start gap-2">
                <span className="mt-1 text-base flex-shrink-0">{companion.emoji}</span>
                <div>
                  <span className="text-[10px] text-white/30 mb-1 block">{companion.name}</span>
                  <TypingIndicator />
                </div>
              </div>
            )}

            {firstMessage && (
              <CompanionMessage
                emoji={companion.emoji}
                name={companion.name}
                message={firstMessage}
              />
            )}

            {firstMessageError && !firstMessage && (
              <p className="text-center text-xs text-white/20">
                {companion.name} is warming up — they&apos;ll greet you in chat!
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {(error || (phase === 'error' && error)) && (
        <div className="mb-4 w-full rounded-lg border border-magenta/30 bg-magenta/10 px-4 py-3 text-center text-sm text-magenta">
          {error}
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        {!showFirstMessage ? (
          /* Before completion — show "Complete Setup" */
          <Button
            size="lg"
            onClick={handleComplete}
            disabled={isLoading || completing}
          >
            {completing || phase === 'completing' ? 'Setting up...' : 'Complete Setup'}
          </Button>
        ) : (
          /* After completion — show "Start Chatting →" */
          <Button
            size="lg"
            href="/dashboard/chat"
            disabled={phase === 'generating'}
          >
            {phase === 'generating' ? 'Almost ready...' : 'Start Chatting →'}
          </Button>
        )}

        {showFirstMessage && (
          <Button
            variant="outline"
            size="lg"
            href="/dashboard"
          >
            Explore Dashboard
          </Button>
        )}
      </div>

      <p className="mt-6 text-center text-[11px] text-white/20">
        Chat with your companion on Telegram anytime at{' '}
        <a
          href="https://t.me/KinCompanionBot"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan/50 underline underline-offset-2 hover:text-cyan/70"
        >
          @KinCompanionBot
        </a>
      </p>
    </motion.div>
  );
}
