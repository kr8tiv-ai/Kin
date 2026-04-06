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
    title: 'Run the Installer',
    description:
      'Run deploy-easy.sh (Unix) or deploy-easy.bat (Windows). The adaptive installer handles Ollama, dependencies, and local setup automatically.',
    href: '/dashboard/setup',
    cta: 'Open Setup',
  },
  {
    number: '03',
    title: 'Complete Setup Wizard',
    description:
      'Validate your API keys and connect messaging channels (Telegram, Discord, WhatsApp) at the Setup Wizard.',
    href: '/dashboard/setup',
    cta: 'Open Wizard',
  },
  {
    number: '04',
    title: 'Deploy to Cloud (Optional)',
    description:
      'Deploy to Railway, Render, Fly.io, or Coolify for 24/7 availability. Follow the cloud deploy guides in the docs.',
    href: '/docs',
    cta: 'View Deploy Guides',
  },
];

const localSteps = [
  {
    title: 'Clone & Install',
    command: 'git clone https://github.com/your-org/kin.git && cd kin && npm install',
    description: 'Clone the repository and install dependencies.',
  },
  {
    title: 'Run the Adaptive Installer (Unix)',
    command: './deploy-easy.sh',
    description: 'Detects your environment, installs Ollama, pulls models, and configures everything.',
  },
  {
    title: 'Run the Adaptive Installer (Windows)',
    command: 'deploy-easy.bat',
    description: 'Same adaptive installer for Windows — handles Ollama, dependencies, and setup.',
  },
  {
    title: 'Open the Dashboard',
    command: '',
    description: 'Go to http://localhost:3001 and say hello to your KIN!',
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

        <div className="text-center mt-12 space-y-4">
          <p className="text-white/40 mb-2">Want to try before you install?</p>
          <Button variant="primary" href="/demo">
            Try Demo
          </Button>
          <p className="text-white/40 mt-6 mb-2">Need help?</p>
          <Button variant="ghost" href="/support">
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  );
}
