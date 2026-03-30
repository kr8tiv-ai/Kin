'use client';

// ============================================================================
// Dashboard Template — Smooth page transition wrapper.
// template.tsx re-mounts on every route change (unlike layout.tsx).
// ============================================================================

import { motion } from 'framer-motion';

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}
