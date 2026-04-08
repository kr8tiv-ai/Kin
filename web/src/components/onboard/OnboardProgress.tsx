'use client';

// ============================================================================
// OnboardProgress — Animated step indicator with time estimates.
// ============================================================================

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { FlowMode } from '@/hooks/useOnboarding';

interface OnboardProgressProps {
  currentStep: number;
  totalSteps?: number;
  flowMode?: FlowMode;
}

const DETAILED_STEPS = [
  { label: 'Welcome', time: '30s' },
  { label: 'Companion', time: '1 min' },
  { label: 'Personalize', time: '1 min' },
  { label: 'Soul', time: '1 min' },
  { label: 'Memory', time: '30s' },
  { label: 'Ready', time: '' },
];

const QUICK_STEPS = [
  { label: 'Welcome', time: '15s' },
  { label: 'Meet Your Friend', time: '45s' },
  { label: 'Ready', time: '' },
];

export function OnboardProgress({ currentStep, totalSteps = 6, flowMode = 'detailed' }: OnboardProgressProps) {
  const STEPS = flowMode === 'quick' ? QUICK_STEPS : DETAILED_STEPS;
  return (
    <div className="flex flex-col items-center py-8">
      {/* Step dots and lines */}
      <div className="flex items-center gap-0">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          const isFuture = stepNum > currentStep;
          const step = STEPS[i]!;

          return (
            <div key={stepNum} className="flex items-center">
              {/* Dot + label */}
              <div className="flex flex-col items-center">
                <motion.div
                  className={cn(
                    'flex h-3 w-3 items-center justify-center rounded-full transition-all duration-300',
                    (isCompleted || isCurrent) && 'bg-cyan shadow-[0_0_8px_rgba(0,240,255,0.5)]',
                    isFuture && 'border border-white/10 bg-transparent',
                  )}
                  animate={
                    isCurrent
                      ? { scale: [1, 1.3, 1], boxShadow: ['0 0 8px rgba(0,240,255,0.5)', '0 0 16px rgba(0,240,255,0.8)', '0 0 8px rgba(0,240,255,0.5)'] }
                      : {}
                  }
                  transition={
                    isCurrent
                      ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                      : undefined
                  }
                >
                  {isCompleted && (
                    <motion.svg
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="h-2 w-2 text-black"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={4}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </motion.svg>
                  )}
                </motion.div>
                <span
                  className={cn(
                    'mt-2 text-[10px] font-medium transition-colors duration-300 whitespace-nowrap',
                    isCurrent && 'text-cyan',
                    isCompleted && 'text-cyan/60',
                    isFuture && 'text-white/20',
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connecting line (not after last dot) */}
              {stepNum < totalSteps && (
                <div className="relative mx-2 h-[1px] w-8 sm:w-12 bg-white/10">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-cyan/60"
                    initial={{ width: isCompleted ? '100%' : '0%' }}
                    animate={{ width: isCompleted ? '100%' : '0%' }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Time estimate */}
      <motion.p
        key={currentStep}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-4 text-[10px] text-white/20 font-mono"
      >
        Step {currentStep} of {totalSteps}
        {STEPS[currentStep - 1]?.time ? ` · ~${STEPS[currentStep - 1].time}` : ''}
      </motion.p>
    </div>
  );
}
