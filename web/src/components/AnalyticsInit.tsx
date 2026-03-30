'use client';

import { useEffect } from 'react';
import { initAnalytics } from '@/lib/analytics';

/**
 * Client component that initializes PostHog analytics on mount.
 * Render once in the root layout.
 */
export function AnalyticsInit() {
  useEffect(() => {
    initAnalytics();
  }, []);
  return null;
}
