/**
 * Weather Skill - Fetches current weather using wttr.in
 *
 * Triggers on weather-related keywords, extracts the location
 * from the user message, and returns formatted conditions.
 * Uses the free wttr.in API (no key required).
 */

import type { KinSkill, SkillContext, SkillResult } from '../types.js';
import { fetchWithTimeout } from '../../../inference/retry.js';

// ============================================================================
// Location Extraction
// ============================================================================

/**
 * Attempts to extract a location string from the user's message.
 *
 * Patterns matched (case-insensitive):
 *   "weather in London"
 *   "weather for New York"
 *   "what's the forecast in Tokyo"
 *   "temperature in Paris"
 *   "weather London"  (keyword followed directly by location)
 */
function extractLocation(message: string): string | null {
  const patterns = [
    /(?:weather|forecast|temperature)\s+(?:in|for|at)\s+(.+?)(?:\?|$)/i,
    /(?:in|for|at)\s+(.+?)\s+(?:weather|forecast|temperature)/i,
    /(?:weather|forecast|temperature)\s+([A-Z][a-zA-Z\s,]+)/,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

// ============================================================================
// wttr.in Response Types
// ============================================================================

interface WttrResponse {
  current_condition?: Array<{
    temp_C?: string;
    temp_F?: string;
    FeelsLikeC?: string;
    FeelsLikeF?: string;
    humidity?: string;
    windspeedKmph?: string;
    winddir16Point?: string;
    weatherDesc?: Array<{ value?: string }>;
  }>;
  nearest_area?: Array<{
    areaName?: Array<{ value?: string }>;
    country?: Array<{ value?: string }>;
    region?: Array<{ value?: string }>;
  }>;
}

// ============================================================================
// Formatting
// ============================================================================

function formatWeather(data: WttrResponse): string {
  const current = data.current_condition?.[0];
  const area = data.nearest_area?.[0];

  if (!current) {
    return 'Weather data is temporarily unavailable. Please try again shortly.';
  }

  const location = area?.areaName?.[0]?.value ?? 'Unknown';
  const country = area?.country?.[0]?.value ?? '';
  const description = current.weatherDesc?.[0]?.value ?? 'Unknown';
  const tempC = current.temp_C ?? '?';
  const tempF = current.temp_F ?? '?';
  const feelsC = current.FeelsLikeC ?? '?';
  const feelsF = current.FeelsLikeF ?? '?';
  const humidity = current.humidity ?? '?';
  const windSpeed = current.windspeedKmph ?? '?';
  const windDir = current.winddir16Point ?? '';

  const locationStr = country ? `${location}, ${country}` : location;

  return [
    `*Weather in ${locationStr}*`,
    '',
    `*Conditions:* ${description}`,
    `*Temperature:* ${tempC} C / ${tempF} F`,
    `*Feels like:* ${feelsC} C / ${feelsF} F`,
    `*Humidity:* ${humidity}%`,
    `*Wind:* ${windSpeed} km/h ${windDir}`,
  ].join('\n');
}

// ============================================================================
// Skill Definition
// ============================================================================

export const weatherSkill: KinSkill = {
  name: 'weather',
  description: 'Fetches current weather conditions for a given location',
  triggers: ['weather', 'forecast', 'temperature'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const location = extractLocation(ctx.message);

    if (!location) {
      return {
        content:
          'I can look up the weather for you! Just tell me the location, like: "weather in London" or "forecast for Tokyo".',
        type: 'text',
      };
    }

    try {
      const encoded = encodeURIComponent(location);
      const response = await fetchWithTimeout(`https://wttr.in/${encoded}?format=j1`, {
        headers: { 'User-Agent': 'KIN-Bot/1.0' },
      }, 10_000);

      if (!response.ok) {
        return {
          content: `Could not fetch weather for "${location}". The service may be temporarily unavailable -- try again in a moment.`,
          type: 'error',
          metadata: { status: response.status },
        };
      }

      const data = (await response.json()) as WttrResponse;
      const formatted = formatWeather(data);

      return {
        content: formatted,
        type: 'markdown',
        metadata: {
          location,
          raw: data.current_condition?.[0],
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        content: `Failed to fetch weather for "${location}": ${message}. Please try again later.`,
        type: 'error',
        metadata: { error: message },
      };
    }
  },
};

export default weatherSkill;
