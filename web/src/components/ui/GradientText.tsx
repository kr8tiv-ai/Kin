import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

interface GradientTextProps {
  children: ReactNode;
  gradient?: 'cyan' | 'magenta' | 'gold' | 'rainbow';
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div';
  className?: string;
}

const gradientStyles: Record<string, string> = {
  cyan: 'from-cyan via-cyan/80 to-cyan/60',
  magenta: 'from-magenta via-magenta/80 to-magenta/60',
  gold: 'from-gold via-gold/80 to-gold/60',
  rainbow: 'from-cyan via-magenta to-gold',
};

export function GradientText({
  children,
  gradient = 'cyan',
  as = 'span',
  className,
}: GradientTextProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        'bg-gradient-to-r bg-clip-text text-transparent',
        gradientStyles[gradient],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
