'use client';

import { motion } from 'framer-motion';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] px-8 py-16 text-center backdrop-blur-[20px] ${className}`}
    >
      <span className="mb-4 text-5xl">{icon}</span>
      <h3 className="font-display text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-white/50">{description}</p>
      {actionLabel && (actionHref || onAction) && (
        <div className="mt-6">
          {actionHref ? (
            <Button href={actionHref} variant="primary" size="md">
              {actionLabel}
            </Button>
          ) : (
            <Button variant="primary" size="md" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
