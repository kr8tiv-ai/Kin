'use client';

// ============================================================================
// useOnboarding — Multi-step onboarding state management hook.
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import { kinApi } from '@/lib/api';
import { track } from '@/lib/analytics';
import type {
  UserPreferences,
  SoulConfig,
  StarterConversation,
} from '@/lib/types';
import { DEFAULT_SOUL_CONFIG } from '@/lib/types';
import type { ExtractedProfile } from '@/hooks/useVoiceIntro';

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

export type FlowMode = 'quick' | 'detailed';

interface OnboardingState {
  step: number;
  flowMode: FlowMode;
  selectedCompanionId: string | null;
  preferences: OnboardingPreferences;
  soulConfig: SoulConfig;
  memories: OnboardingMemories;
  completing: boolean;
  error: string | null;
}

const DETAILED_STEPS = 6;
const QUICK_STEPS = 3;

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
    flowMode: 'quick',
    selectedCompanionId: null,
    preferences: DEFAULT_PREFERENCES,
    soulConfig: { ...DEFAULT_SOUL_CONFIG },
    memories: DEFAULT_MEMORIES,
    completing: false,
    error: null,
  });

  const totalSteps = state.flowMode === 'quick' ? QUICK_STEPS : DETAILED_STEPS;

  const setFlowMode = useCallback((mode: FlowMode) => {
    track('onboarding_flow_mode', { mode });
    setState((prev) => ({ ...prev, flowMode: mode, step: 1 }));
  }, []);

  /** Map extracted voice profile into preferences + memories. */
  const applyVoiceProfile = useCallback((profile: ExtractedProfile) => {
    track('onboarding_voice_profile_applied', {
      hasName: !!profile.displayName,
      interestCount: profile.interests.length,
      goalCount: profile.goals.length,
    });
    setState((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        displayName: profile.displayName || prev.preferences.displayName,
        experienceLevel: profile.experienceLevel || prev.preferences.experienceLevel,
        goals: profile.goals.length > 0 ? profile.goals : prev.preferences.goals,
        tone: profile.tone || prev.preferences.tone,
      },
      memories: {
        ...prev.memories,
        interests: profile.interests.length > 0
          ? profile.interests.join(', ')
          : prev.memories.interests,
      },
    }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => {
      const max = prev.flowMode === 'quick' ? QUICK_STEPS : DETAILED_STEPS;
      const next = Math.min(prev.step + 1, max);
      track('onboarding_step', { from: prev.step, to: next, flowMode: prev.flowMode });
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
    setState((prev) => {
      const max = prev.flowMode === 'quick' ? QUICK_STEPS : DETAILED_STEPS;
      return { ...prev, step: Math.max(1, Math.min(step, max)) };
    });
  }, []);

  const complete = useCallback(async (): Promise<StarterConversation> => {
    if (!state.selectedCompanionId) {
      setState((prev) => ({ ...prev, error: 'Please select a companion' }));
      throw new Error('Please select a companion');
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

      const starterConversation = await kinApi.post<StarterConversation>(
        '/first-message',
        {
          companionId: state.selectedCompanionId,
        },
      );

      track('onboarding_completed', {
        companionId: state.selectedCompanionId,
        experienceLevel: state.preferences.experienceLevel,
        goals: state.preferences.goals.join(','),
        memoryCount: memoryEntries.length,
      });

      setState((prev) => ({ ...prev, completing: false }));
      return starterConversation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setState((prev) => ({ ...prev, completing: false, error: message }));
      throw err;
    }
  }, [state.selectedCompanionId, state.preferences, state.soulConfig, state.memories]);

  return {
    step: state.step,
    totalSteps,
    flowMode: state.flowMode,
    selectedCompanionId: state.selectedCompanionId,
    preferences: state.preferences,
    soulConfig: state.soulConfig,
    memories: state.memories,
    completing: state.completing,
    error: state.error,
    nextStep,
    prevStep,
    goToStep,
    setFlowMode,
    setCompanion,
    setPreferences,
    setSoulConfig,
    setMemories,
    applyVoiceProfile,
    complete,
  };
}
