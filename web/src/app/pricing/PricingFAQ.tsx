'use client';

import { useState, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const BILLING_FAQ = [
  {
    question: 'Can I change plans at any time?',
    answer:
      'Yes. You can upgrade or downgrade your plan at any time. When upgrading, you get immediate access to the new features. When downgrading, your current plan stays active until the end of the billing period.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit and debit cards, as well as PayPal. All payments are processed securely through our payment provider.',
  },
  {
    question: 'Is there a yearly discount?',
    answer:
      'Annual plans are coming soon. Subscribe to our newsletter to be the first to know when yearly billing with a discount becomes available.',
  },
  {
    question: 'What happens when I hit my message limit?',
    answer:
      'Free tier users get 50 messages per day. Once you hit the limit, you can wait until the next day or upgrade to Pro for unlimited messages. Your companion will let you know when you are approaching the limit.',
  },
  {
    question: 'Can I get a refund?',
    answer:
      'We offer a 7-day money-back guarantee on all paid plans. If you are not satisfied, contact our support team within 7 days of your purchase for a full refund.',
  },
];

export function PricingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section
      ref={sectionRef}
      className="relative py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-[#050505]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Billing Questions
          </h2>
          <p className="mt-4 text-base text-white/50">
            Everything about plans, payments, and subscriptions.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-3"
        >
          {BILLING_FAQ.map((item, index) => (
            <div
              key={index}
              className={cn(
                'rounded-xl border bg-white/[0.02] backdrop-blur-sm transition-all duration-300',
                openIndex === index ? 'border-cyan/20' : 'border-white/10 hover:border-white/20',
              )}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left"
                aria-expanded={openIndex === index}
              >
                <span className="font-display text-base sm:text-lg font-semibold text-white pr-4">
                  {item.question}
                </span>
                <span
                  className={cn(
                    'shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-all duration-300',
                    openIndex === index
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
                      openIndex === index ? 'text-cyan' : 'text-white/60',
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
                {openIndex === index && (
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
          ))}
        </motion.div>
      </div>
    </section>
  );
}
