'use client';

import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: 'cyan' | 'magenta' | 'gold' | 'none';
}

const glowShadows: Record<string, string> = {
  cyan: '0 8px 32px rgba(0, 240, 255, 0.15)',
  magenta: '0 8px 32px rgba(255, 0, 170, 0.15)',
  gold: '0 8px 32px rgba(255, 215, 0, 0.15)',
  none: 'none',
};

export function GlassCard({
  children,
  className,
  hover = true,
  glow = 'none',
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-white/10 bg-white/[0.02] backdrop-blur-[20px]',
        hover && 'transition-all duration-300 hover:-translate-y-1',
        className,
      )}
      style={
        hover
          ? ({
              '--glow-shadow': glowShadows[glow] ?? 'none',
            } as React.CSSProperties)
          : undefined
      }
      onMouseEnter={(e) => {
        if (hover && glow !== 'none') {
          (e.currentTarget as HTMLElement).style.boxShadow =
            glowShadows[glow] ?? 'none';
        }
      }}
      onMouseLeave={(e) => {
        if (hover) {
          (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        }
      }}
    >
      {children}
    </div>
  );
}
