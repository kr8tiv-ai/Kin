'use client';

import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  color?: 'cyan' | 'magenta' | 'gold';
  size?: 'sm' | 'md';
  label?: string;
  showPercent?: boolean;
  className?: string;
}

const colorClasses: Record<string, { bar: string; glow: string }> = {
  cyan: {
    bar: 'bg-cyan',
    glow: 'shadow-[0_0_12px_rgba(0,240,255,0.5)]',
  },
  magenta: {
    bar: 'bg-magenta',
    glow: 'shadow-[0_0_12px_rgba(255,0,170,0.5)]',
  },
  gold: {
    bar: 'bg-gold',
    glow: 'shadow-[0_0_12px_rgba(255,215,0,0.5)]',
  },
};

function getAutoColor(value: number): 'cyan' | 'gold' | 'magenta' {
  if (value < 50) return 'cyan';
  if (value <= 75) return 'gold';
  return 'magenta';
}

const sizeClasses: Record<string, string> = {
  sm: 'h-1.5',
  md: 'h-3',
};

export function ProgressBar({
  value,
  color,
  size = 'md',
  label,
  showPercent = false,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const resolvedColor = color ?? getAutoColor(clamped);
  const colorStyle = colorClasses[resolvedColor];

  return (
    <div className={cn('w-full', className)}>
      {(label || showPercent) && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          {label && <span className="text-white/70">{label}</span>}
          {showPercent && (
            <span className="font-mono text-white/50">
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          'w-full overflow-hidden rounded-pill bg-white/5',
          sizeClasses[size],
        )}
      >
        <div
          className={cn(
            'h-full rounded-pill transition-all duration-500 ease-out',
            colorStyle.bar,
            colorStyle.glow,
          )}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label ?? 'Progress'}
        />
      </div>
    </div>
  );
}
