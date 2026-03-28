'use client';

// ============================================================================
// StepPreferences — Onboarding Step 3: Personalization settings.
// ============================================================================

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { OnboardingPreferences } from '@/hooks/useOnboarding';

interface StepPreferencesProps {
  preferences: OnboardingPreferences;
  onChange: (prefs: Partial<OnboardingPreferences>) => void;
  onNext: () => void;
  onBack: () => void;
}

const EXPERIENCE_LEVELS = [
  { value: 'beginner' as const, label: 'Beginner', desc: 'New to this' },
  { value: 'intermediate' as const, label: 'Intermediate', desc: 'Some experience' },
  { value: 'advanced' as const, label: 'Advanced', desc: 'Expert level' },
];

const TONES = [
  { value: 'friendly' as const, label: 'Friendly' },
  { value: 'professional' as const, label: 'Professional' },
  { value: 'casual' as const, label: 'Casual' },
  { value: 'technical' as const, label: 'Technical' },
];

const GOAL_OPTIONS = [
  'Learn to Code',
  'Build a Website',
  'Grow My Brand',
  'Manage Finances',
  'Get Creative',
  'Daily Companion',
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
];

export function StepPreferences({
  preferences,
  onChange,
  onNext,
  onBack,
}: StepPreferencesProps) {
  const toggleGoal = (goal: string) => {
    const current = preferences.goals;
    const next = current.includes(goal)
      ? current.filter((g) => g !== goal)
      : [...current, goal];
    onChange({ goals: next });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center"
    >
      <h1 className="mb-2 text-center font-display text-2xl font-bold text-white sm:text-3xl">
        Personalize Your Experience
      </h1>
      <p className="mb-8 text-center text-sm text-white/40">
        Help your companion understand you better.
      </p>

      <div className="mb-8 w-full space-y-5">
        {/* Display name */}
        <GlassCard className="p-5" hover={false}>
          <Input
            label="What should your companion call you?"
            placeholder="Enter your name or nickname"
            value={preferences.displayName}
            onChange={(e) => onChange({ displayName: e.target.value })}
          />
        </GlassCard>

        {/* Experience level */}
        <GlassCard className="p-5" hover={false}>
          <label className="mb-3 block text-sm font-medium text-white/70">
            Experience level
          </label>
          <div className="grid grid-cols-3 gap-2">
            {EXPERIENCE_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => onChange({ experienceLevel: level.value })}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-center transition-all duration-200',
                  preferences.experienceLevel === level.value
                    ? 'border-cyan bg-cyan/10 text-cyan'
                    : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/20 hover:text-white/70',
                )}
              >
                <p className="text-xs font-semibold">{level.label}</p>
                <p className="mt-0.5 text-[10px] opacity-60">{level.desc}</p>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Communication tone */}
        <GlassCard className="p-5" hover={false}>
          <label className="mb-3 block text-sm font-medium text-white/70">
            Communication tone
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TONES.map((tone) => (
              <button
                key={tone.value}
                type="button"
                onClick={() => onChange({ tone: tone.value })}
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200',
                  preferences.tone === tone.value
                    ? 'border-magenta bg-magenta/10 text-magenta'
                    : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/20 hover:text-white/70',
                )}
              >
                {tone.label}
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Goals */}
        <GlassCard className="p-5" hover={false}>
          <label className="mb-3 block text-sm font-medium text-white/70">
            What are your goals?
          </label>
          <div className="flex flex-wrap gap-2">
            {GOAL_OPTIONS.map((goal) => {
              const isSelected = preferences.goals.includes(goal);
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => toggleGoal(goal)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200',
                    isSelected
                      ? 'border-cyan bg-cyan/15 text-cyan'
                      : 'border-white/10 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/60',
                  )}
                >
                  {goal}
                </button>
              );
            })}
          </div>
        </GlassCard>

        {/* Language */}
        <GlassCard className="p-5" hover={false}>
          <label className="mb-3 block text-sm font-medium text-white/70">
            Preferred language
          </label>
          <select
            value={preferences.language}
            onChange={(e) => onChange({ language: e.target.value })}
            className="w-full rounded-sm border border-white/10 bg-surface px-4 py-2.5 text-sm text-white transition-colors focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/30"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </GlassCard>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </motion.div>
  );
}
