'use client';

// ============================================================================
// Billing Success — Post-checkout confirmation with auto-redirect.
// ============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

export default function BillingSuccessPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/dashboard/billing');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <GlassCard className="p-8 text-center" glow="magenta" hover={false}>
          {/* Confetti-like decorative dots */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute h-2 w-2 rounded-full"
                style={{
                  background: ['#00F0FF', '#FF00AA', '#FFD700'][i % 3],
                  left: `${10 + (i * 7) % 80}%`,
                  top: `${5 + (i * 11) % 70}%`,
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 0.6, 0], scale: [0, 1, 0.5] }}
                transition={{
                  duration: 2,
                  delay: i * 0.15,
                  repeat: Infinity,
                  repeatDelay: 1,
                }}
              />
            ))}
          </div>

          {/* Success icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-magenta/20"
          >
            <svg
              className="h-8 w-8 text-magenta"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </motion.div>

          <h1 className="font-display text-2xl font-bold text-white">
            Welcome to Pro!
          </h1>
          <p className="mt-2 text-white/60">
            Your upgrade is complete. Enjoy unlimited messages, more companions,
            and all Pro features.
          </p>

          <div className="mt-6 space-y-3">
            <Button href="/dashboard/billing" className="w-full">
              Go to Billing
            </Button>
            <Button href="/dashboard" variant="ghost" className="w-full">
              Back to Dashboard
            </Button>
          </div>

          <p className="mt-4 text-xs text-white/30">
            Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}...
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
