'use client';

// ============================================================================
// UsageMeter — Usage bar with color thresholds and unlimited display.
// ============================================================================

import { ProgressBar } from '@/components/ui/ProgressBar';

interface UsageMeterProps {
  label: string;
  current: number;
  max: number | null; // null = unlimited
  className?: string;
}

function getMeterColor(pct: number): 'cyan' | 'gold' | 'magenta' {
  if (pct < 50) return 'cyan';
  if (pct < 80) return 'gold';
  return 'magenta';
}

export function UsageMeter({ label, current, max, className }: UsageMeterProps) {
  const isUnlimited = max === null;
  const pct = isUnlimited ? 0 : max > 0 ? (current / max) * 100 : 0;
  const color = getMeterColor(pct);

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-white/70">{label}</span>
        <span className="font-mono text-white/50">
          {isUnlimited ? (
            <>{current.toLocaleString()} / Unlimited</>
          ) : (
            <>
              {current.toLocaleString()} / {max.toLocaleString()}
            </>
          )}
        </span>
      </div>
      {isUnlimited ? (
        <div className="h-3 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-cyan/40"
            style={{ width: '100%' }}
          />
        </div>
      ) : (
        <ProgressBar value={pct} color={color} size="md" />
      )}
    </div>
  );
}
