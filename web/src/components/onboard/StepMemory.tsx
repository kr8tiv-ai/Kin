'use client';

// ============================================================================
// StepMemory — Onboarding Step 4: Teach your companion about yourself.
// ============================================================================

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { OnboardingMemories } from '@/hooks/useOnboarding';

interface StepMemoryProps {
  memories: OnboardingMemories;
  onChange: (mems: Partial<OnboardingMemories>) => void;
  onNext: () => void;
  onBack: () => void;
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
];

function formatTimezone(tz: string): string {
  // Turn "America/New_York" into "America / New York"
  return tz.replace(/_/g, ' ').replace(/\//g, ' / ');
}

export function StepMemory({ memories, onChange, onNext, onBack }: StepMemoryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center"
    >
      <h1 className="mb-2 text-center font-display text-2xl font-bold text-white sm:text-3xl">
        Teach Your Companion
      </h1>
      <p className="mb-8 max-w-md text-center text-sm text-white/40 leading-relaxed">
        Your companion remembers what matters to you. Share a few things to get
        started &mdash; you can always add more later.
      </p>

      <div className="mb-8 w-full space-y-5">
        {/* Occupation */}
        <GlassCard className="p-5" hover={false}>
          <Input
            label="What do you do?"
            placeholder="e.g. Software engineer, Designer, Student..."
            value={memories.occupation}
            onChange={(e) => onChange({ occupation: e.target.value })}
          />
        </GlassCard>

        {/* Interests */}
        <GlassCard className="p-5" hover={false}>
          <Input
            label="What are you interested in?"
            placeholder="e.g. AI, fitness, photography, cooking..."
            value={memories.interests}
            onChange={(e) => onChange({ interests: e.target.value })}
          />
        </GlassCard>

        {/* Current project */}
        <GlassCard className="p-5" hover={false}>
          <Input
            label="What are you working on?"
            placeholder="e.g. Building a mobile app, Learning Spanish..."
            value={memories.currentProject}
            onChange={(e) => onChange({ currentProject: e.target.value })}
          />
        </GlassCard>

        {/* Timezone */}
        <GlassCard className="p-5" hover={false}>
          <label className="mb-1.5 block text-sm font-medium text-white/70">
            Your timezone
          </label>
          <select
            value={memories.timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
            className="w-full rounded-sm border border-white/10 bg-surface px-4 py-2.5 text-sm text-white transition-colors focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/30"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {formatTimezone(tz)}
              </option>
            ))}
          </select>
        </GlassCard>

        {/* Auto-learn toggle */}
        <GlassCard className="p-5" hover={false}>
          <button
            type="button"
            onClick={() => onChange({ autoLearn: !memories.autoLearn })}
            className="flex w-full items-center justify-between"
          >
            <div className="text-left">
              <p className="text-sm font-medium text-white/80">
                Let my companion learn about me over time
              </p>
              <p className="mt-0.5 text-xs text-white/30">
                Your companion gets smarter the more you chat
              </p>
            </div>
            <div
              className={cn(
                'relative ml-4 flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200',
                memories.autoLearn ? 'bg-cyan' : 'bg-white/10',
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
                  memories.autoLearn ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </div>
          </button>
        </GlassCard>
      </div>

      {/* Info note */}
      <p className="mb-6 text-center text-[11px] text-white/20">
        Powered by intelligent memory &mdash; your companion gets smarter the more you chat.
      </p>

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
