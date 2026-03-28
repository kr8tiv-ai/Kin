import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  color?: 'cyan' | 'magenta' | 'gold' | 'muted';
  className?: string;
}

const colorStyles: Record<string, string> = {
  cyan: 'bg-cyan/15 text-cyan border-cyan/20',
  magenta: 'bg-magenta/15 text-magenta border-magenta/20',
  gold: 'bg-gold/15 text-gold border-gold/20',
  muted: 'bg-white/5 text-white/60 border-white/10',
};

export function Badge({ children, color = 'cyan', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-2.5 py-0.5 text-xs font-medium',
        colorStyles[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
