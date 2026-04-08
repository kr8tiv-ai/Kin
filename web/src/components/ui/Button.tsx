'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-magenta text-white hover:brightness-110 active:brightness-90 shadow-[0_0_20px_rgba(255,0,170,0.3)]',
  outline:
    'border border-cyan text-cyan hover:bg-cyan/10 active:bg-cyan/20',
  ghost:
    'text-white/70 hover:text-white hover:bg-white/5 active:bg-white/10',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-5 py-2 text-sm rounded-pill',
  md: 'px-8 py-3 text-sm rounded-pill',
  lg: 'px-10 py-4 text-base rounded-pill',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  onClick,
  disabled = false,
  className,
  type = 'button',
}: ButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center font-body font-medium transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
    'transition-transform hover:scale-[1.03] active:scale-[0.97]',
    variantStyles[variant],
    sizeStyles[size],
    disabled && 'pointer-events-none opacity-40',
    className,
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={classes} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
