'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

const steps = [
  {
    number: '01',
    title: 'Sign Up',
    description: 'Create your free account using Telegram, Google, or email.',
    href: '/login',
  },
  {
    number: '02',
    title: 'Set Up Your AI Brain',
    description: 'Download Ollama and pull the Qwen3 model for local, private AI responses.',
    href: '/dashboard/setup',
  },
  {
    number: '03',
    title: 'Configure Integrations',
    description: 'Connect Telegram, Discord, or WhatsApp to chat with your KIN anywhere.',
    href: '/dashboard/setup',
  },
  {
    number: '04',
    title: 'Deploy to Cloud (Optional)',
    description: 'Deploy to Railway, Render, or Fly.io for 24/7 availability.',
    href: '/dashboard/projects/new',
  },
];

const localSteps = [
  {
    title: 'Download Ollama',
    command: 'curl -fsSL https://ollama.com/install.sh | sh',
    description: 'Or download from ollama.com',
  },
  {
    title: 'Pull the model',
    command: 'ollama pull qwen3:32b',
    description: 'This downloads the AI brain (~20GB)',
  },
  {
    title: 'Start chatting',
    command: '',
    description: 'Go to /dashboard/chat and say hello to your KIN!',
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
                      {step.number === '01' ? 'Create Account' : 'Go There'}
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <GlassCard className="p-6" hover={false}>
            <h2 className="text-2xl font-display font-semibold text-white mb-6">
              Local Setup Commands
            </h2>
            <div className="space-y-4">
              {localSteps.map((step, index) => (
                <div key={index} className="border border-white/10 rounded-lg p-4">
                  <h4 className="text-white font-medium mb-2">{step.title}</h4>
                  {step.command && (
                    <code className="block text-sm text-cyan font-mono bg-black/40 rounded px-3 py-2 mb-2">
                      {step.command}
                    </code>
                  )}
                  <p className="text-sm text-white/40">{step.description}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        <div className="text-center mt-12">
          <p className="text-white/40 mb-4">Need help?</p>
          <Button variant="ghost" href="/support">
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  );
}
