'use client';

// ============================================================================
// TextIntroFallback — Text-based intro form when microphone is unavailable.
//
// Simple form with name, comma-separated interests, and goal checkboxes
// that produces an ExtractedProfile directly without needing the voice API.
// ============================================================================

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import type { ExtractedProfile } from '@/hooks/useVoiceIntro';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TextIntroFallbackProps {
  onComplete: (profile: ExtractedProfile) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Goal options (matching existing onboarding patterns)
// ---------------------------------------------------------------------------

const GOAL_OPTIONS = [
  { id: 'learn', label: 'Learn something new' },
  { id: 'create', label: 'Build or create projects' },
  { id: 'productivity', label: 'Boost productivity' },
  { id: 'brainstorm', label: 'Brainstorm ideas' },
  { id: 'code', label: 'Write or debug code' },
  { id: 'explore', label: 'Explore and have fun' },
];

const EXPERIENCE_OPTIONS: { value: ExtractedProfile['experienceLevel']; label: string }[] = [
  { value: 'beginner', label: 'Just getting started' },
  { value: 'intermediate', label: 'Some experience' },
  { value: 'advanced', label: 'Power user' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TextIntroFallback({ onComplete, onBack }: TextIntroFallbackProps) {
  const [name, setName] = useState('');
  const [interests, setInterests] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<ExtractedProfile['experienceLevel']>('beginner');

  function toggleGoal(goalId: string) {
    setSelectedGoals((prev) =>
      prev.includes(goalId) ? prev.filter((g) => g !== goalId) : [...prev, goalId],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const profile: ExtractedProfile = {
      displayName: name.trim(),
      interests: interests
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      goals: selectedGoals.map((id) => {
        const opt = GOAL_OPTIONS.find((g) => g.id === id);
        return opt?.label ?? id;
      }),
      experienceLevel,
      tone: 'friendly',
    };

    onComplete(profile);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
    >
      <GlassCard className="p-6" hover={false}>
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-xl">
            ✏️
          </div>
          <h3 className="text-base font-semibold text-white">
            Tell us about yourself
          </h3>
          <p className="mt-1 text-xs text-white/40">
            Microphone unavailable — type your intro instead
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="intro-name" className="mb-1.5 block text-xs font-medium text-white/60">
              What should we call you?
            </label>
            <input
              id="intro-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name or nickname"
              className={cn(
                'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5',
                'text-sm text-white placeholder:text-white/20',
                'outline-none transition-colors focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30',
              )}
            />
          </div>

          {/* Interests */}
          <div>
            <label htmlFor="intro-interests" className="mb-1.5 block text-xs font-medium text-white/60">
              What are you interested in?
            </label>
            <input
              id="intro-interests"
              type="text"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="e.g. music, coding, design, gaming"
              className={cn(
                'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5',
                'text-sm text-white placeholder:text-white/20',
                'outline-none transition-colors focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30',
              )}
            />
            <p className="mt-1 text-[10px] text-white/25">Separate with commas</p>
          </div>

          {/* Goals */}
          <div>
            <p className="mb-2 text-xs font-medium text-white/60">
              What do you want to do?
            </p>
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map((goal) => {
                const selected = selectedGoals.includes(goal.id);
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => toggleGoal(goal.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs transition-all duration-200',
                      selected
                        ? 'border-cyan/50 bg-cyan/10 text-cyan'
                        : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/70',
                    )}
                  >
                    {goal.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Experience level */}
          <div>
            <p className="mb-2 text-xs font-medium text-white/60">
              Experience level
            </p>
            <div className="flex gap-2">
              {EXPERIENCE_OPTIONS.map((opt) => {
                const selected = experienceLevel === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExperienceLevel(opt.value)}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-xs transition-all duration-200',
                      selected
                        ? 'border-magenta/50 bg-magenta/10 text-magenta'
                        : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/70',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-4 pt-2">
            <Button variant="ghost" onClick={onBack}>
              Back
            </Button>
            <Button type="submit">
              Continue
            </Button>
          </div>
        </form>
      </GlassCard>
    </motion.div>
  );
}
