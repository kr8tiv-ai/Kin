'use client';

// ============================================================================
// Onboard Page — 5-step onboarding wizard for new KIN users.
// ============================================================================

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { useOnboarding } from '@/hooks/useOnboarding';
import { OnboardProgress } from '@/components/onboard/OnboardProgress';
import { StepWelcome } from '@/components/onboard/StepWelcome';
import { StepChooseCompanion } from '@/components/onboard/StepChooseCompanion';
import { StepPreferences } from '@/components/onboard/StepPreferences';
import { StepMemory } from '@/components/onboard/StepMemory';
import { StepReady } from '@/components/onboard/StepReady';

export default function OnboardPage() {
  const router = useRouter();
  const onboarding = useOnboarding();

  const handleComplete = useCallback(async () => {
    try {
      await onboarding.complete();
      router.push('/dashboard/chat');
    } catch {
      // Error is displayed in StepReady via onboarding.error
    }
  }, [onboarding, router]);

  return (
    <div className="flex flex-col">
      {/* Progress bar */}
      <OnboardProgress currentStep={onboarding.step} totalSteps={onboarding.totalSteps} />

      {/* Step content */}
      <AnimatePresence mode="wait">
        {onboarding.step === 1 && (
          <StepWelcome
            key="welcome"
            onNext={onboarding.nextStep}
          />
        )}

        {onboarding.step === 2 && (
          <StepChooseCompanion
            key="companion"
            selectedId={onboarding.selectedCompanionId}
            onSelect={onboarding.setCompanion}
            onNext={onboarding.nextStep}
            onBack={onboarding.prevStep}
          />
        )}

        {onboarding.step === 3 && (
          <StepPreferences
            key="preferences"
            preferences={onboarding.preferences}
            onChange={onboarding.setPreferences}
            onNext={onboarding.nextStep}
            onBack={onboarding.prevStep}
          />
        )}

        {onboarding.step === 4 && (
          <StepMemory
            key="memory"
            memories={onboarding.memories}
            onChange={onboarding.setMemories}
            onNext={onboarding.nextStep}
            onBack={onboarding.prevStep}
          />
        )}

        {onboarding.step === 5 && (
          <StepReady
            key="ready"
            selectedCompanionId={onboarding.selectedCompanionId}
            completing={onboarding.completing}
            error={onboarding.error}
            onComplete={handleComplete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
