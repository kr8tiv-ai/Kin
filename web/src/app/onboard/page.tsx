'use client';

// ============================================================================
// Onboard Page — Dual-mode onboarding wizard for new KIN users.
//
// Quick mode (default): Welcome → Pick Companion + Voice Intro → Ready
// Detailed mode:        Welcome → Companion → Personalize → Soul → Memory → Ready
// ============================================================================

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { useOnboarding } from '@/hooks/useOnboarding';
import { COMPANIONS } from '@/lib/companions';
import { OnboardProgress } from '@/components/onboard/OnboardProgress';
import { StepWelcome } from '@/components/onboard/StepWelcome';
import { StepChooseCompanion } from '@/components/onboard/StepChooseCompanion';
import { StepPreferences } from '@/components/onboard/StepPreferences';
import { StepSoulAuthor } from '@/components/onboard/StepSoulAuthor';
import { StepMemory } from '@/components/onboard/StepMemory';
import { StepReady } from '@/components/onboard/StepReady';
import { StepQuickIntro } from '@/components/onboard/StepQuickIntro';
import { Sparkle } from '@/components/onboard/Sparkle';
import { CompanionOrbs } from '@/components/onboard/CompanionOrbs';
import type { ExtractedProfile } from '@/hooks/useVoiceIntro';

const COLOR_HEX: Record<string, string> = {
  cyan: '#00f0ff',
  magenta: '#ff00aa',
  gold: '#ffd700',
};

export default function OnboardPage() {
  const router = useRouter();
  const onboarding = useOnboarding();
  const [sparkleTrigger, setSparkleTrigger] = useState(0);

  // Resolve companion color for orbs + sparkle
  const companion = onboarding.selectedCompanionId
    ? COMPANIONS[onboarding.selectedCompanionId]
    : null;
  const companionColor = companion?.color ?? 'cyan';

  // Wrap nextStep to trigger sparkle micro-celebration
  const handleNext = useCallback(() => {
    onboarding.nextStep();
    setSparkleTrigger((t) => t + 1);
  }, [onboarding]);

  const handleComplete = useCallback(async () => {
    try {
      await onboarding.complete();
      router.push('/dashboard/chat');
    } catch {
      // Error is displayed in StepReady via onboarding.error
    }
  }, [onboarding, router]);

  // ── Quick-mode handlers ───────────────────────────────────────────────

  /** Voice intro done → apply profile + advance to Ready */
  const handleVoiceComplete = useCallback((profile: ExtractedProfile) => {
    onboarding.applyVoiceProfile(profile);
    onboarding.nextStep();
    setSparkleTrigger((t) => t + 1);
  }, [onboarding]);

  /** Switch to detailed flow from quick mode */
  const handleSwitchToDetailed = useCallback(() => {
    onboarding.setFlowMode('detailed');
  }, [onboarding]);

  // ── Detailed-mode handlers ────────────────────────────────────────────

  // Quick-start: skip from Welcome directly to Companion selection
  const handleSkipToCompanion = useCallback(() => {
    onboarding.goToStep(2);
  }, [onboarding]);

  // Quick Setup: skip preferences/soul/memory → go straight to Ready (detailed mode)
  const handleQuickSetup = useCallback(() => {
    onboarding.goToStep(6);
    setSparkleTrigger((t) => t + 1);
  }, [onboarding]);

  // ── Rendering ─────────────────────────────────────────────────────────

  const isQuick = onboarding.flowMode === 'quick';

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Floating background orbs — appear once companion is selected */}
      {onboarding.step >= 2 && companion && (
        <CompanionOrbs colorKey={companionColor} />
      )}

      {/* Sparkle burst on step transitions */}
      <Sparkle trigger={sparkleTrigger} color={COLOR_HEX[companionColor]} />

      {/* Progress bar */}
      <OnboardProgress
        currentStep={onboarding.step}
        totalSteps={onboarding.totalSteps}
        flowMode={onboarding.flowMode}
      />

      {/* Step content */}
      <AnimatePresence mode="wait">
        {/* ── QUICK MODE ─────────────────────────────────────────────────── */}
        {isQuick && onboarding.step === 1 && (
          <StepWelcome
            key="quick-welcome"
            onNext={handleNext}
            onSkip={handleSwitchToDetailed}
          />
        )}

        {isQuick && onboarding.step === 2 && (
          <StepQuickIntro
            key="quick-intro"
            selectedId={onboarding.selectedCompanionId}
            onSelect={onboarding.setCompanion}
            onVoiceComplete={handleVoiceComplete}
            onBack={onboarding.prevStep}
          />
        )}

        {isQuick && onboarding.step === 3 && (
          <StepReady
            key="quick-ready"
            selectedCompanionId={onboarding.selectedCompanionId}
            completing={onboarding.completing}
            error={onboarding.error}
            onComplete={handleComplete}
          />
        )}

        {/* ── DETAILED MODE ──────────────────────────────────────────────── */}
        {!isQuick && onboarding.step === 1 && (
          <StepWelcome
            key="welcome"
            onNext={handleNext}
            onSkip={handleSkipToCompanion}
          />
        )}

        {!isQuick && onboarding.step === 2 && (
          <StepChooseCompanion
            key="companion"
            selectedId={onboarding.selectedCompanionId}
            onSelect={onboarding.setCompanion}
            onNext={handleNext}
            onBack={onboarding.prevStep}
            onQuickSetup={handleQuickSetup}
          />
        )}

        {!isQuick && onboarding.step === 3 && (
          <StepPreferences
            key="preferences"
            preferences={onboarding.preferences}
            onChange={onboarding.setPreferences}
            onNext={handleNext}
            onBack={onboarding.prevStep}
          />
        )}

        {!isQuick && onboarding.step === 4 && (
          <StepSoulAuthor
            key="soul"
            selectedCompanionId={onboarding.selectedCompanionId}
            soulConfig={onboarding.soulConfig}
            onChange={onboarding.setSoulConfig}
            onNext={handleNext}
            onBack={onboarding.prevStep}
          />
        )}

        {!isQuick && onboarding.step === 5 && (
          <StepMemory
            key="memory"
            memories={onboarding.memories}
            onChange={onboarding.setMemories}
            onNext={handleNext}
            onBack={onboarding.prevStep}
          />
        )}

        {!isQuick && onboarding.step === 6 && (
          <StepReady
            key="ready"
            selectedCompanionId={onboarding.selectedCompanionId}
            completing={onboarding.completing}
            error={onboarding.error}
            onComplete={handleComplete}
          />
        )}
      </AnimatePresence>

      {/* "Want more control?" link — visible in quick mode steps 1-2 */}
      {isQuick && onboarding.step < 3 && (
        <div className="mt-auto pb-6 text-center">
          <button
            type="button"
            onClick={handleSwitchToDetailed}
            className="text-[11px] text-white/25 hover:text-white/50 transition-colors underline underline-offset-2"
          >
            Want more control? Detailed Setup →
          </button>
        </div>
      )}
    </div>
  );
}
