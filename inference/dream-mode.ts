/**
 * Zero-Input Voice Dream Mode
 * 
 * The companion initiates conversations when you're idle.
 * Like a Tamagotchi that actually has personality.
 * Uses activity detection + ambient awareness.
 */

import { getOllamaClient } from './local-llm.js';
import { getVoicePipeline } from '../voice/pipeline.js';

export interface DreamConfig {
  enabled: boolean;
  checkIntervalMs: number;
  idleThresholdMinutes: number;
  personalityIntensity: number; // 0-1, how "needy" the companion is
  maxDreamsPerDay: number;
}

export interface DreamState {
  userId: string;
  lastActive: number;
  dreamsToday: number;
  lastDreamAt: number | null;
  activeDream: boolean;
}

interface DreamTopic {
  id: string;
  prompt: string;
  category: 'checkin' | 'insight' | 'memory' | 'fun' | 'support';
}

const DREAM_TOPICS: DreamTopic[] = [
  { id: 'd1', prompt: "Hey! I've been thinking about something interesting...", category: 'checkin' },
  { id: 'd2', prompt: "I had a thought about our last conversation...", category: 'memory' },
  { id: 'd3', prompt: "Fun fact time! Did you know...", category: 'fun' },
  { id: 'd4', prompt: "I noticed something about your patterns today...", category: 'insight' },
  { id: 'd5', prompt: "Just checking in — how are you feeling?", category: 'support' },
  { id: 'd6', prompt: "I've been working on something I'd like to share...", category: 'insight' },
];

class DreamModeEngine {
  private configs: Map<string, DreamConfig> = new Map();
  private states: Map<string, DreamState> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private ollama = getOllamaClient();

  configure(userId: string, config: Partial<DreamConfig>): void {
    const defaults: DreamConfig = {
      enabled: false,
      checkIntervalMs: 60000,
      idleThresholdMinutes: 30,
      personalityIntensity: 0.5,
      maxDreamsPerDay: 5,
    };
    this.configs.set(userId, { ...defaults, ...config });
  }

  start(userId: string, onDream: (message: string) => void): void {
    const config = this.configs.get(userId) ?? {
      enabled: true,
      checkIntervalMs: 60000,
      idleThresholdMinutes: 30,
      personalityIntensity: 0.5,
      maxDreamsPerDay: 5,
    };

    if (!config.enabled) return;

    let state = this.states.get(userId);
    if (!state) {
      state = {
        userId,
        lastActive: Date.now(),
        dreamsToday: 0,
        lastDreamAt: null,
        activeDream: false,
      };
      this.states.set(userId, state);
    }

    const interval = setInterval(async () => {
      if (state!.activeDream) return;

      const idleTime = Date.now() - state!.lastActive;
      const idleMinutes = idleTime / 60000;

      if (idleMinutes < config.idleThresholdMinutes) return;
      if (state!.dreamsToday >= config.maxDreamsPerDay) return;

      const hoursSinceLastDream = state!.lastDreamAt
        ? (Date.now() - state!.lastDreamAt) / 3600000
        : 24;
      if (hoursSinceLastDream < 2) return;

      state!.activeDream = true;

      const dream = await this.generateDream(userId, config.personalityIntensity);
      
      if (dream) {
        onDream(dream);
        state!.dreamsToday++;
        state!.lastDreamAt = Date.now();
      }

      state!.activeDream = false;
    }, config.checkIntervalMs);

    this.intervals.set(userId, interval);
  }

  stop(userId: string): void {
    const interval = this.intervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(userId);
    }
    // Clean up state and config to prevent unbounded growth
    this.states.delete(userId);
    this.configs.delete(userId);
  }

  private async generateDream(userId: string, intensity: number): Promise<string | null> {
    const topic = DREAM_TOPICS[Math.floor(Math.random() * DREAM_TOPICS.length)] ?? DREAM_TOPICS[0];
    
    const systemPrompt = intensity > 0.7
      ? "You're an eager, playful companion who really wants to connect with your human. Be warm and slightly enthusiastic."
      : intensity > 0.3
      ? "You're a calm, thoughtful companion who checks in casually. Be friendly but not overbearing."
      : "You're a chill companion who only shares something when it's genuinely interesting. Be brief and cool.";

    try {
      const response = await this.ollama.chat({
        model: 'qwen3:32b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${topic!.prompt} Keep it short (2-3 sentences), natural, and not robotic.` },
        ],
      });
      return response.message?.content ?? null;
    } catch {
      return null;
    }
  }

  recordActivity(userId: string): void {
    const state = this.states.get(userId);
    if (state) {
      state.lastActive = Date.now();
    }
  }

  getState(userId: string): DreamState | undefined {
    return this.states.get(userId);
  }

  resetDaily(userId: string): void {
    const state = this.states.get(userId);
    if (state) {
      state.dreamsToday = 0;
    }
  }

  getConfig(userId: string): DreamConfig | undefined {
    return this.configs.get(userId);
  }
}

let engine: DreamModeEngine | null = null;

export function getDreamModeEngine(): DreamModeEngine {
  if (!engine) {
    engine = new DreamModeEngine();
  }
  return engine;
}

export type { DreamTopic };
