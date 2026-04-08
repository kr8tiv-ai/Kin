'use client';

// ============================================================================
// VoiceIntroRecorder — Onboarding voice intro step with visual feedback.
//
// Shows a large animated microphone button with pulsing ring during recording,
// a 30-second countdown timer, processing animation, extracted preference
// confirmation, and graceful fallback to TextIntroFallback when mic is
// unavailable.
//
// Uses framer-motion for all transitions matching existing onboard step
// animations and the dark-premium design system.
// ============================================================================

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useVoiceIntro, type ExtractedProfile, type VoiceIntroResult } from '@/hooks/useVoiceIntro';
import { TextIntroFallback } from './TextIntroFallback';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceIntroRecorderProps {
  companionId: string;
  onComplete: (profile: ExtractedProfile) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/** SVG circular progress ring for the countdown. */
function CountdownRing({
  secondsLeft,
  totalSeconds,
  size = 180,
  strokeWidth = 4,
}: {
  secondsLeft: number;
  totalSeconds: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = secondsLeft / totalSeconds;
  const dashOffset = circumference * (1 - progress);

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90"
      viewBox={`0 0 ${size} ${size}`}
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#countdown-gradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        className="transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
      <defs>
        <linearGradient id="countdown-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00F0FF" />
          <stop offset="100%" stopColor="#FF00AA" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Pulsing concentric rings behind the mic button during recording. */
function PulseRings() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {[0, 0.5, 1].map((delay, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-cyan/20"
          initial={{ width: 60, height: 60, opacity: 0.6 }}
          animate={{
            width: [60, 160],
            height: [60, 160],
            opacity: [0.4, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}

/** Microphone icon SVG. */
function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="1" width="6" height="13" rx="3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

/** Stop icon SVG. */
function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/** Processing spinner animation. */
function ProcessingSpinner() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-4"
    >
      <div className="relative h-16 w-16">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-transparent border-t-magenta"
          animate={{ rotate: -360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      <p className="text-sm text-white/60">Processing your intro…</p>
    </motion.div>
  );
}

/** Editable preference chips shown after extraction. */
function ProfileConfirmation({
  result,
  onConfirm,
  onRetry,
}: {
  result: VoiceIntroResult;
  onConfirm: (profile: ExtractedProfile) => void;
  onRetry: () => void;
}) {
  const [profile, setProfile] = useState<ExtractedProfile>(result.profile);

  function removeInterest(index: number) {
    setProfile((prev) => ({
      ...prev,
      interests: prev.interests.filter((_, i) => i !== index),
    }));
  }

  function removeGoal(index: number) {
    setProfile((prev) => ({
      ...prev,
      goals: prev.goals.filter((_, i) => i !== index),
    }));
  }

  const hasContent = profile.displayName || profile.interests.length > 0 || profile.goals.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full"
    >
      <GlassCard className="p-5" hover={false}>
        {/* Transcript */}
        <div className="mb-4">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-white/30">
            What we heard
          </p>
          <p className="text-xs text-white/50 leading-relaxed italic">
            &ldquo;{result.transcript}&rdquo;
          </p>
        </div>

        {hasContent ? (
          <>
            {/* Name */}
            {profile.displayName && (
              <div className="mb-3">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-white/30">
                  Name
                </p>
                <p className="text-sm text-white">{profile.displayName}</p>
              </div>
            )}

            {/* Interests */}
            {profile.interests.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/30">
                  Interests
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.interests.map((interest, i) => (
                    <span
                      key={`${interest}-${i}`}
                      className="group inline-flex items-center gap-1 rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-1 text-xs text-cyan"
                    >
                      {interest}
                      <button
                        type="button"
                        onClick={() => removeInterest(i)}
                        className="ml-0.5 text-cyan/40 transition-colors hover:text-cyan"
                        aria-label={`Remove ${interest}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Goals */}
            {profile.goals.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/30">
                  Goals
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.goals.map((goal, i) => (
                    <span
                      key={`${goal}-${i}`}
                      className="group inline-flex items-center gap-1 rounded-full border border-magenta/30 bg-magenta/10 px-2.5 py-1 text-xs text-magenta"
                    >
                      {goal}
                      <button
                        type="button"
                        onClick={() => removeGoal(i)}
                        className="ml-0.5 text-magenta/40 transition-colors hover:text-magenta"
                        aria-label={`Remove ${goal}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Experience + Tone */}
            <div className="mb-4 flex gap-3">
              <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs text-gold">
                {profile.experienceLevel}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/50">
                {profile.tone} tone
              </span>
            </div>
          </>
        ) : (
          <div className="mb-4">
            <p className="text-xs text-white/40">
              We couldn&apos;t extract much from that — try again or continue with defaults.
            </p>
          </div>
        )}

        {/* Confidence indicator */}
        <div className="mb-4 flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan to-magenta"
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(result.confidence * 100)}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[10px] font-mono text-white/30">
            {Math.round(result.confidence * 100)}% confidence
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try Again
          </Button>
          <Button size="sm" onClick={() => onConfirm(profile)}>
            Looks Good
          </Button>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VoiceIntroRecorder({
  companionId,
  onComplete,
  onBack,
}: VoiceIntroRecorderProps) {
  const {
    state,
    micAvailable,
    secondsLeft,
    startRecording,
    stopRecording,
    result,
    error,
    reset,
  } = useVoiceIntro({ maxDurationSec: 30 });

  const totalSeconds = 30;

  // If mic is unavailable, show the text fallback
  if (!micAvailable) {
    return <TextIntroFallback onComplete={onComplete} onBack={onBack} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center"
    >
      <h1 className="mb-2 text-center font-display text-2xl font-bold text-white sm:text-3xl">
        Introduce Yourself
      </h1>
      <p className="mb-8 text-center text-sm text-white/40 max-w-sm">
        Tell your companion about yourself — your name, interests, and what
        you&apos;d like to do together. 30 seconds is plenty.
      </p>

      <AnimatePresence mode="wait">
        {/* ── Idle state: show mic button ─────────────────────────────────── */}
        {state === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-6"
          >
            <motion.button
              type="button"
              onClick={startRecording}
              className={cn(
                'relative flex h-[180px] w-[180px] items-center justify-center',
                'rounded-full border border-white/10 bg-white/[0.04]',
                'transition-colors hover:border-cyan/30 hover:bg-cyan/[0.06]',
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <MicIcon className="h-12 w-12 text-cyan" />
            </motion.button>
            <p className="text-xs text-white/30">Tap to start recording</p>
          </motion.div>
        )}

        {/* ── Permission state: brief loading ────────────────────────────── */}
        {state === 'permission' && (
          <motion.div
            key="permission"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="h-[180px] w-[180px] flex items-center justify-center">
              <motion.div
                className="h-12 w-12 rounded-full border-2 border-transparent border-t-cyan"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
            </div>
            <p className="text-xs text-white/40">Requesting microphone access…</p>
          </motion.div>
        )}

        {/* ── Recording state: pulsing mic with countdown ────────────────── */}
        {state === 'recording' && (
          <motion.div
            key="recording"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="relative flex h-[180px] w-[180px] items-center justify-center">
              <PulseRings />
              <CountdownRing
                secondsLeft={secondsLeft}
                totalSeconds={totalSeconds}
              />
              <motion.button
                type="button"
                onClick={stopRecording}
                className={cn(
                  'relative z-10 flex h-16 w-16 items-center justify-center',
                  'rounded-full bg-cyan/20 border border-cyan/40',
                  'transition-colors hover:bg-cyan/30',
                )}
                whileTap={{ scale: 0.9 }}
              >
                <StopIcon className="h-6 w-6 text-cyan" />
              </motion.button>
            </div>

            {/* Timer text */}
            <div className="text-center">
              <p className="text-2xl font-mono font-bold text-white">
                {String(Math.floor(secondsLeft / 60)).padStart(1, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
              </p>
              <p className="mt-1 text-xs text-white/30">Tap stop when you&apos;re done</p>
            </div>
          </motion.div>
        )}

        {/* ── Processing state ───────────────────────────────────────────── */}
        {state === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-8"
          >
            <ProcessingSpinner />
          </motion.div>
        )}

        {/* ── Done state: show extracted preferences ─────────────────────── */}
        {state === 'done' && result && (
          <motion.div key="done" className="w-full max-w-md">
            <ProfileConfirmation
              result={result}
              onConfirm={onComplete}
              onRetry={reset}
            />
          </motion.div>
        )}

        {/* ── Error state ────────────────────────────────────────────────── */}
        {state === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center gap-4"
          >
            <GlassCard className="p-5" hover={false}>
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <p className="text-sm font-medium text-white">Something went wrong</p>
                  <p className="mt-1 text-xs text-white/40">{error}</p>
                </div>
              </div>
            </GlassCard>
            <div className="flex gap-3">
              <Button variant="ghost" size="sm" onClick={onBack}>
                Back
              </Button>
              <Button size="sm" onClick={reset}>
                Try Again
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation — shown for idle/recording states only */}
      {(state === 'idle' || state === 'recording') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-8 flex items-center gap-4"
        >
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <button
            type="button"
            onClick={() => {
              // Skip voice intro — use text fallback instead
              // Simulate mic unavailable by calling onComplete with defaults directly
              onComplete({
                displayName: '',
                interests: [],
                goals: [],
                experienceLevel: 'beginner',
                tone: 'friendly',
              });
            }}
            className="text-[11px] text-white/30 underline underline-offset-2 transition-colors hover:text-white/50"
          >
            Skip — I&apos;ll type instead
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
