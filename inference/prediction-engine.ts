/**
 * Predictive Companion Engine
 * 
 * Learns user patterns and preemptively prepares responses based on:
 * - Time-based patterns (7am weather queries)
 * - Conversation rhythm (typing speed, message frequency)
 * - Contextual pre-fetching
 */

import { getOllamaClient } from './local-llm.js';

interface UserPattern {
  userId: string;
  timePatterns: Map<number, string[]>;
  conversationStarts: string[];
  responseExpectations: Map<string, number>;
  lastUpdated: number;
}

export interface Prediction {
  id: string;
  userId: string;
  predictedIntent: string;
  prefetchPrompt: string;
  confidence: number;
  createdAt: number;
  triggered: boolean;
}

interface ConversationContext {
  userId: string;
  timeOfDay: number;
  dayOfWeek: number;
  recentMessages: string[];
  conversationStart: boolean;
}

class PredictionEngine {
  private patterns: Map<string, UserPattern> = new Map();
  private predictions: Map<string, Prediction[]> = new Map();
  private ollama = getOllamaClient();

  analyzePattern(userId: string, message: string, responseCount: number): void {
    let pattern = this.patterns.get(userId);
    if (!pattern) {
      pattern = {
        userId,
        timePatterns: new Map(),
        conversationStarts: [],
        responseExpectations: new Map(),
        lastUpdated: Date.now(),
      };
      this.patterns.set(userId, pattern);
    }

    const hour = new Date().getHours();
    const existing = pattern.timePatterns.get(hour) ?? [];
    existing.push(message);
    if (existing.length > 20) existing.shift();
    pattern.timePatterns.set(hour, existing);

    if (pattern.conversationStarts.length < 5 || responseCount <= 1) {
      pattern.conversationStarts.push(message);
      if (pattern.conversationStarts.length > 20) {
        pattern.conversationStarts.shift();
      }
    }

    const existingExpectations = pattern.responseExpectations.get(message) ?? 0;
    pattern.responseExpectations.set(message, existingExpectations + responseCount);
    pattern.lastUpdated = Date.now();
  }

  predict(userId: string, currentMessage: string, context: ConversationContext): Prediction[] {
    const pattern = this.patterns.get(userId);
    if (!pattern) return [];

    const predictions: Prediction[] = [];
    const hour = context.timeOfDay;

    const timePrompts = pattern.timePatterns.get(hour);
    if (timePrompts && timePrompts.length >= 3) {
      const commonPrompt = timePrompts[Math.floor(Math.random() * timePrompts.length)] ?? '';
      if (commonPrompt !== currentMessage) {
        predictions.push({
          id: `pred-${Date.now()}-time`,
          userId,
          predictedIntent: 'time-based',
          prefetchPrompt: commonPrompt,
          confidence: 0.7,
          createdAt: Date.now(),
          triggered: false,
        });
      }
    }

    if (context.conversationStart && pattern.conversationStarts.length > 0) {
      predictions.push({
        id: `pred-${Date.now()}-start`,
        userId,
        predictedIntent: 'conversation-start',
        prefetchPrompt: pattern.conversationStarts[0] ?? 'Hello',
        confidence: 0.5,
        createdAt: Date.now(),
        triggered: false,
      });
    }

    const keywords = ['weather', 'news', 'remind', 'schedule', 'email'];
    for (const keyword of keywords) {
      if (currentMessage.toLowerCase().includes(keyword)) {
        predictions.push({
          id: `pred-${Date.now()}-${keyword}`,
          userId,
          predictedIntent: keyword,
          prefetchPrompt: `Prefetch ${keyword} data for user`,
          confidence: 0.8,
          createdAt: Date.now(),
          triggered: false,
        });
      }
    }

    const existing = this.predictions.get(userId) ?? [];
    this.predictions.set(userId, [...predictions, ...existing].slice(0, 10));

    return predictions.slice(0, 3);
  }

  async prefetchResponse(prediction: Prediction): Promise<string | null> {
    if (prediction.confidence < 0.6) return null;

    try {
      const response = await this.ollama.chat({
        model: 'qwen3:32b',
        messages: [
          { role: 'system', content: 'You are pre-fetching a response. Keep it brief.' },
          { role: 'user', content: prediction.prefetchPrompt },
        ],
      });
      return response.message?.content ?? null;
    } catch {
      return null;
    }
  }

  markTriggered(predictionId: string, userId: string): void {
    const preds = this.predictions.get(userId);
    if (preds) {
      const pred = preds.find(p => p.id === predictionId);
      if (pred) pred.triggered = true;
    }
  }

  getPatterns(userId: string): UserPattern | undefined {
    return this.patterns.get(userId);
  }

  getActivePredictions(userId: string): Prediction[] {
    return (this.predictions.get(userId) ?? []).filter(p => !p.triggered);
  }

  clearPatterns(userId: string): void {
    this.patterns.delete(userId);
    this.predictions.delete(userId);
  }
}

let engine: PredictionEngine | null = null;

export function getPredictionEngine(): PredictionEngine {
  if (!engine) {
    engine = new PredictionEngine();
  }
  return engine;
}

export type { UserPattern, ConversationContext };
