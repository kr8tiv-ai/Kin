'use client';

import { useState, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'What is KIN?',
    answer:
      'KIN is an AI companion platform where each companion has a unique personality, skills, and style. Unlike generic chatbots, KIN companions remember you, learn your preferences, and grow alongside you over time.',
  },
  {
    question: 'Do I need Telegram?',
    answer:
      'Yes, Telegram is where you chat with your companion. We chose Telegram because it offers a fast, secure, and familiar messaging experience. Just open our bot and start talking.',
  },
  {
    question: 'Is it really free?',
    answer:
      'Absolutely. The free tier gives you 1 companion and 50 messages per day, plus access to the basic web builder. No credit card required. Upgrade anytime if you want more companions and unlimited messages.',
  },
  {
    question: 'What can my companion do?',
    answer:
      'Your companion can chat about anything, help you build websites, track your goals and progress, brainstorm ideas, review code, manage projects, and much more. Each companion has specialized skills that match their personality.',
  },
  {
    question: 'How is this different from ChatGPT?',
    answer:
      'KIN companions have persistent personalities that never change. They remember your conversations across sessions, learn your communication style, and develop specialized skills. Think of it as having a dedicated AI friend rather than a generic assistant.',
  },
  {
    question: 'Can I switch companions?',
    answer:
      'Free users get one companion to start with. Pro users can claim up to 3 companions and switch between them freely. Enterprise users get access to all 6 Genesis companions.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'We take privacy seriously. Your conversations are encrypted, we never sell your data, and you can delete your data at any time. See our Privacy Policy for full details.',
  },
  {
    question: 'How do companions evolve?',
    answer:
      'As you chat with your companion, they earn XP, level up, and unlock new abilities. They remember your preferences, adapt to your communication style, and become more helpful over time. Your companion is uniquely yours.',
  },
];

function FAQAccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white/[0.02] backdrop-blur-sm transition-all duration-300',
        isOpen ? 'border-cyan/20' : 'border-white/10 hover:border-white/20',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left"
        aria-expanded={isOpen}
      >
        <span className="font-display text-base sm:text-lg font-semibold text-white pr-4">
          {item.question}
        </span>
        <span
          className={cn(
            'shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-all duration-300',
            isOpen
              ? 'border-cyan/40 bg-cyan/10 rotate-45'
              : 'border-white/20 bg-white/5',
          )}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={cn(
              'transition-colors',
              isOpen ? 'text-cyan' : 'text-white/60',
            )}
          >
            <path
              d="M6 1v10M1 6h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 sm:px-6 pb-5 sm:pb-6">
              <p className="text-sm sm:text-base text-white/50 leading-relaxed">
                {item.answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section
      ref={sectionRef}
      className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-[#050505]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="mx-auto max-w-3xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white">
            Questions?
          </h2>
          <p className="mt-4 text-lg text-white/50">
            Everything you need to know about KIN.
          </p>
        </motion.div>

        {/* FAQ Items */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-3"
        >
          {FAQ_ITEMS.map((item, index) => (
            <FAQAccordionItem
              key={index}
              item={item}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
