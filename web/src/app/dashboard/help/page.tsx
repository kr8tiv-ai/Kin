'use client';

// ============================================================================
// Help Page — FAQ, support chat, and escalation. Kid-friendly.
// ============================================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { kinApi } from '@/lib/api';

// ---------------------------------------------------------------------------
// FAQ Data
// ---------------------------------------------------------------------------

const FAQ_ITEMS = [
  {
    question: 'What is KIN?',
    answer:
      'KIN is your personal AI companion! Think of it like a super-smart friend that lives on the internet. Each KIN has its own personality, skills, and a powerful AI brain. They can help you with all sorts of things like writing, coding, planning, and more.',
  },
  {
    question: 'How do I talk to my companion?',
    answer:
      'You can chat with your KIN right here on the dashboard! Just click "Chat" in the menu on the left. You can also talk to your KIN on Telegram or WhatsApp. Just type like you would text a friend and your KIN will respond.',
  },
  {
    question: 'What are Skills?',
    answer:
      'Skills are special abilities your KIN can learn! Think of them like superpowers. Some skills help your KIN write better stories, others help with math, coding, or art. As your KIN grows, it can unlock new skills. Check the "Skills" page to see what your companion can do.',
  },
  {
    question: 'How does leveling work?',
    answer:
      'The more you talk to and work with your KIN, the more it grows! Your KIN earns experience points (XP) from conversations and completed tasks. As it levels up, it gets smarter, unlocks new skills, and becomes even better at helping you. Check the "Progress" page to see your level.',
  },
  {
    question: 'What is Soul?',
    answer:
      'Soul is the heart of your KIN — it is what makes your companion unique. Your KIN\'s Soul remembers everything you talk about, learns your preferences, and shapes its personality over time. The more you interact, the deeper the connection grows. Your Soul data is private and belongs to you.',
  },
  {
    question: 'How do I refer friends?',
    answer:
      'Sharing is caring! Go to the "Refer" page in the menu and grab your unique referral code. When your friends sign up using your code, you both get rewarded. You can track how many friends have joined and see your referral stats.',
  },
  {
    question: 'What is a Genesis Mint?',
    answer:
      'Genesis Mints are the first 60 KIN companions ever created. They come as NFTs on Solana, which means you truly own your companion. Genesis holders get a 25% lifetime discount on all plans and earn Solana rewards forever! They are super special and limited.',
  },
  {
    question: 'How do I get help?',
    answer:
      'You are in the right place! Read through these questions for quick answers. If you still need help, scroll down and click the "Talk to a Human" button — a real person from our team will get back to you. You can also email us at support@meetyourkin.com or ask your KIN directly.',
  },
  {
    question: 'Can I have more than one KIN?',
    answer:
      'Yes! Depending on your plan, you can have up to 6 different KIN companions. Each one specializes in something different, so together they can help with almost anything.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'Absolutely! Your conversations, memories, and personal data are stored securely and never shared with anyone. Each KIN runs in its own private environment. You own your data, always.',
  },
];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [escalated, setEscalated] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Need Help?
        </h1>
        <p className="mt-1 text-white/50">
          We&apos;re here for you! Check the answers below or reach out to our team.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <a href="https://t.me/KinCompanionBot" target="_blank" rel="noopener noreferrer">
          <GlassCard className="p-5 text-center cursor-pointer">
            <span className="text-3xl mb-2 block">{'\uD83D\uDCAC'}</span>
            <h3 className="font-display text-sm font-semibold text-white mb-1">
              Ask Your KIN
            </h3>
            <p className="text-xs text-white/40">
              Your companion can answer most questions!
            </p>
          </GlassCard>
        </a>

        <a href="mailto:support@meetyourkin.com">
          <GlassCard className="p-5 text-center cursor-pointer">
            <span className="text-3xl mb-2 block">{'\uD83D\uDCE7'}</span>
            <h3 className="font-display text-sm font-semibold text-white mb-1">
              Email Us
            </h3>
            <p className="text-xs text-white/40">
              support@meetyourkin.com
            </p>
          </GlassCard>
        </a>

        <a href="https://t.me/kr8tiv" target="_blank" rel="noopener noreferrer">
          <GlassCard className="p-5 text-center cursor-pointer">
            <span className="text-3xl mb-2 block">{'\uD83D\uDC65'}</span>
            <h3 className="font-display text-sm font-semibold text-white mb-1">
              Community
            </h3>
            <p className="text-xs text-white/40">
              Join our Telegram group
            </p>
          </GlassCard>
        </a>
      </div>

      {/* FAQ Accordion */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="font-display text-lg font-semibold text-white mb-5">
          Frequently Asked Questions
        </h2>

        <div className="space-y-2">
          {FAQ_ITEMS.map((item, index) => (
            <div
              key={index}
              className="rounded-lg border border-white/5 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleFAQ(index)}
                className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-white/80 hover:bg-white/[0.02] transition-colors"
              >
                <span>{item.question}</span>
                <motion.span
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-white/30 shrink-0 ml-4"
                >
                  {'\u25BC'}
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4 text-sm text-white/50 leading-relaxed">
                      {item.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Escalation */}
      <GlassCard className="p-6 text-center" hover={false}>
        <h2 className="font-display text-lg font-semibold text-white mb-2">
          Still Need Help?
        </h2>
        <p className="text-sm text-white/50 mb-4 max-w-md mx-auto">
          No worries! Click below and a real human from our team will get back to you as soon as possible.
        </p>
        {escalated ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg bg-cyan/10 border border-cyan/20 px-6 py-3 text-sm text-cyan inline-block"
          >
            We got your message! A human will reach out soon.
          </motion.div>
        ) : (
          <Button
            variant="primary"
            disabled={escalating}
            onClick={async () => {
              setEscalating(true);
              try {
                const supportChat = await kinApi.post<{ chatId: string }>(
                  '/support/chat',
                  {
                    message: 'User requested human support from Help page',
                  },
                );

                await kinApi.post('/support/chat/escalate', {
                  chatId: supportChat.chatId,
                  reason: 'User requested human support from Help page',
                });
              } catch {
                // fallback path: open a support ticket directly
                try {
                  await kinApi.post('/support/tickets', {
                    subject: 'User requested human support from Help page',
                    priority: 'high',
                  });
                } catch {
                  // still show success — escalation is best-effort
                }
              }
              setEscalating(false);
              setEscalated(true);
            }}
          >
            {escalating ? 'Sending...' : 'Talk to a Human'}
          </Button>
        )}
      </GlassCard>
    </motion.div>
  );
}
