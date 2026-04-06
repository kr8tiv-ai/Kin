'use client';

// ============================================================================
// useOnboarding — Multi-step onboarding state management hook.
// ============================================================================

import { useCallback, useState } from 'react';
import { kinApi } from '@/lib/api';
import { track } from '@/lib/analytics';
import type { UserPreferences, SoulConfig } from '@/lib/types';
import { DEFAULT_SOUL_CONFIG } from '@/lib/types';

export interface OnboardingPreferences {
  displayName: string;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  goals: string[];
  language: string;
  tone: 'friendly' | 'professional' | 'casual' | 'technical';
  privacyMode: 'private' | 'shared';
}

export interface OnboardingMemories {
  occupation: string;
  interests: string;
  currentProject: string;
  timezone: string;
  autoLearn: boolean;
}

interface OnboardingState {
  step: number;
  selectedCompanionId: string | null;
  preferences: OnboardingPreferences;
  soulConfig: SoulConfig;
  memories: OnboardingMemories;
  completing: boolean;
  error: string | null;
}

const TOTAL_STEPS = 6;

const DEFAULT_PREFERENCES: OnboardingPreferences = {
  displayName: '',
  experienceLevel: 'beginner',
  goals: [],
  language: 'en',
  tone: 'friendly',
  privacyMode: 'private',
};

const DEFAULT_MEMORIES: OnboardingMemories = {
  occupation: '',
  interests: '',
  currentProject: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  autoLearn: true,
};

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>({
    step: 1,
    selectedCompanionId: null,
    preferences: DEFAULT_PREFERENCES,
    soulConfig: { ...DEFAULT_SOUL_CONFIG },
    memories: DEFAULT_MEMORIES,
    completing: false,
    error: null,
  });

  const nextStep = useCallback(() => {
    setState((prev) => {
      const next = Math.min(prev.step + 1, TOTAL_STEPS);
      track('onboarding_step', { from: prev.step, to: next });
      return { ...prev, step: next };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: Math.max(prev.step - 1, 1),
    }));
  }, []);

  const setCompanion = useCallback((companionId: string) => {
    track('onboarding_companion_selected', { companionId });
    setState((prev) => ({ ...prev, selectedCompanionId: companionId }));
  }, []);

  const setPreferences = useCallback((prefs: Partial<OnboardingPreferences>) => {
    setState((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, ...prefs },
    }));
  }, []);

  const setSoulConfig = useCallback((soul: Partial<SoulConfig>) => {
    setState((prev) => ({
      ...prev,
      soulConfig: { ...prev.soulConfig, ...soul },
    }));
  }, []);

  const setMemories = useCallback((mems: Partial<OnboardingMemories>) => {
    setState((prev) => ({
      ...prev,
      memories: { ...prev.memories, ...mems },
    }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setState((prev) => ({ ...prev, step: Math.max(1, Math.min(step, TOTAL_STEPS)) }));
  }, []);

  const complete = useCallback(async () => {
    if (!state.selectedCompanionId) {
      setState((prev) => ({ ...prev, error: 'Please select a companion' }));
      return;
    }

    setState((prev) => ({ ...prev, completing: true, error: null }));

    try {
      // 1. Claim companion
      await kinApi.post('/kin/claim', {
        companionId: state.selectedCompanionId,
      });

      // 2. Save preferences with onboardingComplete flag
      await kinApi.put<UserPreferences>('/preferences', {
        displayName: state.preferences.displayName || null,
        experienceLevel: state.preferences.experienceLevel,
        goals: state.preferences.goals,
        language: state.preferences.language,
        tone: state.preferences.tone,
        privacyMode: state.preferences.privacyMode,
        onboardingComplete: true,
      });

      // 3. Save soul config
      await kinApi.put(`/soul/${state.selectedCompanionId}`, state.soulConfig);

      // 4. Save initial memories (only non-empty fields)
      const memoryEntries: { type: string; content: string }[] = [];

      if (state.memories.occupation.trim()) {
        memoryEntries.push({
          type: 'personal',
          content: `Occupation/Industry: ${state.memories.occupation.trim()}`,
        });
      }
      if (state.memories.interests.trim()) {
        memoryEntries.push({
          type: 'preference',
          content: `Interests: ${state.memories.interests.trim()}`,
        });
      }
      if (state.memories.currentProject.trim()) {
        memoryEntries.push({
          type: 'context',
          content: `Currently working on: ${state.memories.currentProject.trim()}`,
        });
      }
      if (state.memories.timezone) {
        memoryEntries.push({
          type: 'preference',
          content: `Timezone: ${state.memories.timezone}`,
        });
      }

      // Post memory entries in parallel for speed
      await Promise.all(
        memoryEntries.map((entry) =>
          kinApi.post('/memories', {
            companionId: state.selectedCompanionId,
            type: entry.type,
            content: entry.content,
            importance: 0.8,
            isTransferable: true,
          }),
        ),
      );

      track('onboarding_completed', {
        companionId: state.selectedCompanionId,
        experienceLevel: state.preferences.experienceLevel,
        goals: state.preferences.goals.join(','),
        memoryCount: memoryEntries.length,
      });

      setState((prev) => ({ ...prev, completing: false }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setState((prev) => ({ ...prev, completing: false, error: message }));
      throw err;
    }
  }, [state.selectedCompanionId, state.preferences, state.soulConfig, state.memories]);

  return {
    step: state.step,
    totalSteps: TOTAL_STEPS,
    selectedCompanionId: state.selectedCompanionId,
    preferences: state.preferences,
    soulConfig: state.soulConfig,
    memories: state.memories,
    completing: state.completing,
    error: state.error,
    nextStep,
    prevStep,
    goToStep,
    setCompanion,
    setPreferences,
    setSoulConfig,
    setMemories,
    complete,
  };
}
