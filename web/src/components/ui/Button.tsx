'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
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
  sm: 'px-4 py-1.5 text-sm rounded-sm',
  md: 'px-6 py-2.5 text-sm rounded-md',
  lg: 'px-8 py-3.5 text-base rounded-md',
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
    variantStyles[variant],
    sizeStyles[size],
    disabled && 'pointer-events-none opacity-40',
    className,
  );

  if (href && !disabled) {
    return (
      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
        <Link href={href} className={classes} onClick={onClick}>
          {children}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
    >
      {children}
    </motion.button>
  );
}
