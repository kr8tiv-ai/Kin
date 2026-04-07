'use client';

import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: 'cyan' | 'magenta' | 'gold' | 'none';
  onClick?: (e: React.MouseEvent) => void;
}

const glowShadows: Record<string, string> = {
  cyan: '0 8px 32px rgba(0, 240, 255, 0.2), 0 0 60px rgba(0, 240, 255, 0.08)',
  magenta: '0 8px 32px rgba(255, 0, 170, 0.2), 0 0 60px rgba(255, 0, 170, 0.08)',
  gold: '0 8px 32px rgba(255, 215, 0, 0.2), 0 0 60px rgba(255, 215, 0, 0.08)',
  none: 'none',
};

export function GlassCard({
  children,
  className,
  hover = true,
  glow = 'none',
  onClick,
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-white/[0.15] bg-white/[0.02] backdrop-blur-[20px]',
        hover && 'transition-all duration-300 ease-out hover:-translate-y-1',
        hover && glow !== 'none' && 'hover:scale-[1.02]',
        className,
      )}
      onClick={onClick}
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
