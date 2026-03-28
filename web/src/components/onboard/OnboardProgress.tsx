'use client';

// ============================================================================
// OnboardProgress — Step indicator for the 5-step onboarding flow.
// ============================================================================

import { cn } from '@/lib/utils';

interface OnboardProgressProps {
  currentStep: number;
  totalSteps?: number;
}

const STEP_LABELS = ['Welcome', 'Companion', 'Personalize', 'Memory', 'Ready'];

export function OnboardProgress({ currentStep, totalSteps = 5 }: OnboardProgressProps) {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="flex items-center gap-0">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          const isFuture = stepNum > currentStep;

          return (
            <div key={stepNum} className="flex items-center">
              {/* Dot + label */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-3 w-3 items-center justify-center rounded-full transition-all duration-300',
                    (isCompleted || isCurrent) && 'bg-cyan shadow-[0_0_8px_rgba(0,240,255,0.5)]',
                    isFuture && 'border border-white/10 bg-transparent',
                  )}
                />
                <span
                  className={cn(
                    'mt-2 text-[10px] font-medium transition-colors duration-300 whitespace-nowrap',
                    isCurrent && 'text-cyan',
                    isCompleted && 'text-cyan/60',
                    isFuture && 'text-white/20',
                  )}
                >
                  {STEP_LABELS[i]}
                </span>
              </div>

              {/* Connecting line (not after last dot) */}
              {stepNum < totalSteps && (
                <div
                  className={cn(
                    'mx-2 h-[1px] w-8 sm:w-12 transition-colors duration-300',
                    stepNum < currentStep ? 'bg-cyan/60' : 'bg-white/10',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
