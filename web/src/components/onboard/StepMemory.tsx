'use client';

// ============================================================================
// StepMemory - Onboarding Step 4: Teach your companion about yourself.
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
  return tz.replace(/_/g, ' ').replace(/\//g, ' / ');
}

export function StepMemory({
  memories,
  onChange,
  onNext,
  onBack,
}: StepMemoryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center"
    >
      <h1 className="mb-2 text-center font-display text-2xl font-bold text-white sm:text-3xl">
        What Should Your KIN Know?
      </h1>
      <p className="mb-8 max-w-md text-center text-sm text-white/40 leading-relaxed">
        Give your KIN a little context before you meet. A few details here make
        the first conversation feel much more personal.
      </p>

      <div className="mb-8 w-full space-y-5">
        <GlassCard className="p-5" hover={false}>
          <Input
            label="What do you spend your days doing?"
            placeholder="Founder, creative lead, coach, student..."
            value={memories.occupation}
            onChange={(e) => onChange({ occupation: e.target.value })}
          />
        </GlassCard>

        <GlassCard className="p-5" hover={false}>
          <Input
            label="What should your KIN care about with you?"
            placeholder="Your interests, obsessions, or what you keep coming back to"
            value={memories.interests}
            onChange={(e) => onChange({ interests: e.target.value })}
          />
        </GlassCard>

        <GlassCard className="p-5" hover={false}>
          <Input
            label="What matters most right now?"
            placeholder="Launching something new, rebuilding your site, getting organized..."
            value={memories.currentProject}
            onChange={(e) => onChange({ currentProject: e.target.value })}
          />
        </GlassCard>

        <GlassCard className="p-5" hover={false}>
          <label className="mb-1.5 block text-sm font-medium text-white/70">
            Where in the world are you?
          </label>
          <select
            value={memories.timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
            className="w-full rounded-sm border border-white/10 bg-surface px-4 py-2.5 text-sm text-white transition-colors focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/30"
          >
            {TIMEZONES.map((timezone) => (
              <option key={timezone} value={timezone}>
                {formatTimezone(timezone)}
              </option>
            ))}
          </select>
        </GlassCard>

        <GlassCard className="p-5" hover={false}>
          <button
            type="button"
            onClick={() => onChange({ autoLearn: !memories.autoLearn })}
            className="flex w-full items-center justify-between"
          >
            <div className="text-left">
              <p className="text-sm font-medium text-white/80">
                Let my KIN learn as we go
              </p>
              <p className="mt-0.5 text-xs text-white/30">
                It will quietly pick up patterns and context from our conversations
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

      <p className="mb-6 text-center text-[11px] text-white/20">
        You do not need to get this perfect. Your KIN will keep learning with you.
      </p>

      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </motion.div>
  );
}
