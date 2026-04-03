'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const companionDemos = [
  {
    id: 'cipher',
    name: 'Cipher',
    type: 'Code Kraken',
    description: 'Design-obsessed, playful frontend architect who builds exceptional websites while teaching design.',
    color: 'cyan',
  },
  {
    id: 'mischief',
    name: 'Mischief',
    type: 'Glitch Pup',
    description: 'Playful family companion and personal-brand whisperer who helps with daily life and personal branding.',
    color: 'magenta',
  },
  {
    id: 'vortex',
    name: 'Vortex',
    type: 'Teal Dragon',
    description: '24/7 CMO for social media and content. Strategic, creative, always-on marketing companion.',
    color: 'teal',
  },
  {
    id: 'forge',
    name: 'Forge',
    type: 'Cyber Unicorn',
    description: 'Developer friend for code and debugging. Technical mentor and pair programming partner.',
    color: 'gold',
  },
  {
    id: 'aether',
    name: 'Aether',
    type: 'Frost Ape',
    description: 'Creative muse for writing and storytelling. Inspires artistic expression and narrative craft.',
    color: 'purple',
  },
  {
    id: 'catalyst',
    name: 'Catalyst',
    type: 'Cosmic Blob',
    description: 'Wealth coach for habits and investments. Financial wisdom and life optimization guide.',
    color: 'green',
  },
];

const sampleMessages = [
  { role: 'user' as const, content: 'Can you help me build a website?' },
  { role: 'assistant' as const, content: "Absolutely! I love building websites. Let's start with what you want to create - a landing page, portfolio, blog, or something else?" },
];

export default function DemoPage() {
  const [selectedCompanion, setSelectedCompanion] = useState(companionDemos[0]);
  const [messages, setMessages] = useState(sampleMessages);
  const [input, setInput] = useState('');

  return (
    <div className="min-h-screen bg-bg py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-12"
        >
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-white mb-4">
            Try KIN Demo
          </h1>
          <p className="text-xl text-white/50 max-w-2xl mx-auto">
            Meet your AI companions and see what they can do
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 mb-12">
          {companionDemos.map((companion) => (
            <motion.button
              key={companion.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => setSelectedCompanion(companion)}
              className={`p-4 rounded-xl border transition-all ${
                selectedCompanion.id === companion.id
                  ? `border-${companion.color}/50 bg-${companion.color}/10`
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <div className="text-3xl mb-2">
                {companion.id === 'cipher' && '\uD83D\uDD77\uFE0F'}
                {companion.id === 'mischief' && '\uD83E\uDD81'}
                {companion.id === 'vortex' && '\uD83D\uDC09'}
                {companion.id === 'forge' && '\uD83E\uDE84'}
                {companion.id === 'aether' && '\uD83E\uDD8B'}
                {companion.id === 'catalyst' && '\uD83E\uDDEC'}
              </div>
              <p className={`text-sm font-medium text-${companion.color}`}>
                {companion.name}
              </p>
              <p className="text-xs text-white/30 mt-1">{companion.type}</p>
            </motion.button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <GlassCard className="p-6" hover={false}>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-4xl">
                {selectedCompanion.id === 'cipher' && '\uD83D\uDD77\uFE0F'}
                {selectedCompanion.id === 'mischief' && '\uD83E\uDD81'}
                {selectedCompanion.id === 'vortex' && '\uD83D\uDC09'}
                {selectedCompanion.id === 'forge' && '\uD83E\uDE84'}
                {selectedCompanion.id === 'aether' && '\uD83E\uDD8B'}
                {selectedCompanion.id === 'catalyst' && '\uD83E\uDDEC'}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {selectedCompanion.name}
                </h3>
                <Badge color={selectedCompanion.color as any}>
                  {selectedCompanion.type}
                </Badge>
              </div>
            </div>
            <p className="text-white/50">{selectedCompanion.description}</p>
          </GlassCard>

          <GlassCard className="p-6" hover={false}>
            <h3 className="text-lg font-semibold text-white mb-4">Chat Preview</h3>
            <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-cyan/10 border border-cyan/20 ml-8'
                      : 'bg-white/5 mr-8'
                  }`}
                >
                  <p className="text-sm text-white/80">{msg.content}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30"
              />
              <Button variant="primary" size="sm">
                Send
              </Button>
            </div>
            <p className="text-xs text-white/30 mt-2">
              Demo only - this is a preview
            </p>
          </GlassCard>
        </div>

        <div className="text-center mt-12">
          <Button variant="primary" href="/login" size="lg">
            Start for Free
          </Button>
        </div>
      </div>
    </div>
  );
}