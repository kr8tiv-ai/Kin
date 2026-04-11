'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

const steps = [
  {
    number: '01',
    title: 'Sign Up',
    description: 'Create your free account using Telegram, Google, or email.',
    href: '/login',
    cta: 'Create Account',
  },
  {
    number: '02',
    title: 'Personalize Your KIN',
    description:
      'Complete a quick onboarding flow to give your KIN its name, personality, and voice.',
    href: '/onboard',
    cta: 'Start Onboarding',
  },
  {
    number: '03',
    title: 'Connect Your Channels',
    description:
      'Link Telegram, Discord, or WhatsApp so your KIN can reach you wherever you are.',
    href: '/dashboard',
    cta: 'Open Dashboard',
  },
  {
    number: '04',
    title: 'Start Chatting!',
    description:
      'Head to the chat page and say hello — your KIN is ready to meet you!',
    href: '/dashboard/chat',
    cta: 'Chat Now',
  },
];

export default function GettingStartedPage() {
  return (
    <div className="min-h-screen bg-bg py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-12"
        >
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-white mb-4">
            Get Started with KIN
          </h1>
          <p className="text-xl text-white/50 max-w-2xl mx-auto">
            Your personal AI companion in 4 simple steps
          </p>
        </motion.div>

        <div className="grid gap-6 mb-16">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <GlassCard className="p-6" hover={false}>
                <div className="flex items-start gap-6">
                  <span className="text-4xl font-display font-bold text-cyan/30">
                    {step.number}
                  </span>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-white/50 mb-4">{step.description}</p>
                    <Button variant="outline" size="sm" href={step.href}>
                      {step.cta}
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        <div className="text-center mt-12 space-y-4">
          <p className="text-white/40 mb-2">Need help?</p>
          <Button variant="ghost" href="/dashboard/help">
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  );
}