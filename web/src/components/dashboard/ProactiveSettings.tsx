'use client';

// ============================================================================
// ProactiveSettings — Controls for proactive companion: toggle, quiet hours,
// max daily, and calendar connection.
// ============================================================================

import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { kinApi } from '@/lib/api';
import type { ProactiveSettings as ProactiveSettingsType } from '@/lib/types';

interface ProactiveSettingsProps {
  settings: ProactiveSettingsType;
  onUpdate: (patch: Partial<ProactiveSettingsType>) => Promise<void>;
  onRefresh: () => void;
}

export function ProactiveSettings({
  settings,
  onUpdate,
  onRefresh,
}: ProactiveSettingsProps) {
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const handleCalendarConnect = useCallback(async () => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const result = await kinApi.get<{ url: string }>('/auth/calendar/authorize');
      if (result.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start calendar connection';
      setCalendarError(message);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  const handleCalendarDisconnect = useCallback(async () => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      await kinApi.delete('/proactive/calendar');
      onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect calendar';
      setCalendarError(message);
    } finally {
      setCalendarLoading(false);
    }
  }, [onRefresh]);

  return (
    <div className="space-y-6">
      {/* Proactive Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/70">
            Proactive Suggestions
          </p>
          <p className="text-xs text-white/40">
            Your companion will reach out when it notices something relevant.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.proactiveEnabled}
          onClick={() => onUpdate({ proactiveEnabled: !settings.proactiveEnabled })}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ${
            settings.proactiveEnabled ? 'bg-cyan' : 'bg-white/10'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
              settings.proactiveEnabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Quiet Hours */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-white/70">
          Quiet Hours
        </p>
        <p className="mb-2 text-xs text-white/40">
          No suggestions during this window.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="quiet-start" className="text-xs text-white/50">
              From
            </label>
            <input
              id="quiet-start"
              type="number"
              min={0}
              max={23}
              value={settings.quietStart ?? ''}
              placeholder="22"
              onChange={(e) => {
                const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                onUpdate({ quietStart: val });
              }}
              className="w-16 rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-white transition-colors focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/30"
            />
          </div>
          <span className="text-white/30">—</span>
          <div className="flex items-center gap-2">
            <label htmlFor="quiet-end" className="text-xs text-white/50">
              To
            </label>
            <input
              id="quiet-end"
              type="number"
              min={0}
              max={23}
              value={settings.quietEnd ?? ''}
              placeholder="8"
              onChange={(e) => {
                const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                onUpdate({ quietEnd: val });
              }}
              className="w-16 rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-white transition-colors focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/30"
            />
          </div>
          <span className="text-xs text-white/30">(0–23, 24h format)</span>
        </div>
      </div>

      {/* Max Daily */}
      <div>
        <label
          htmlFor="max-daily"
          className="mb-1.5 block text-sm font-medium text-white/70"
        >
          Max Daily Suggestions
        </label>
        <input
          id="max-daily"
          type="number"
          min={1}
          max={20}
          value={settings.maxDaily}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (val >= 1 && val <= 20) {
              onUpdate({ maxDaily: val });
            }
          }}
          className="w-20 rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-white transition-colors focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/30"
        />
        <p className="mt-1 text-xs text-white/30">
          Between 1 and 20 suggestions per day.
        </p>
      </div>

      {/* Calendar Connection */}
      <div className="border-t border-white/5 pt-4">
        <p className="mb-1 text-sm font-medium text-white/70">
          Google Calendar
        </p>
        <p className="mb-3 text-xs text-white/40">
          Connect your calendar so your companion can notice upcoming events.
        </p>
        {settings.calendarConnected ? (
          <div className="flex items-center gap-3">
            <Badge color="cyan">Connected ✓</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCalendarDisconnect}
              disabled={calendarLoading}
              className="text-white/50 hover:text-white"
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCalendarConnect}
            disabled={calendarLoading}
          >
            {calendarLoading ? 'Connecting…' : 'Connect Calendar'}
          </Button>
        )}
        {calendarError && (
          <p className="mt-2 text-xs text-red-400">{calendarError}</p>
        )}
      </div>
    </div>
  );
}
