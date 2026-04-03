'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export default function SupportPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const supportOptions = [
    {
      emoji: '\uD83D\uDCAC',
      title: 'Community Discord',
      description: 'Join our community to connect with other KIN users',
      href: 'https://discord.gg/kin',
      badge: 'Active' as const,
      badgeColor: 'cyan' as const,
    },
    {
      emoji: '\uD83D\uDCDE',
      title: 'Telegram Support',
      description: 'Reach out to our team directly on Telegram',
      href: 'https://t.me/kincompanion',
      badge: '24/7' as const,
      badgeColor: 'cyan' as const,
    },
    {
      emoji: '\uD83D\uDC4B',
      title: 'FAQ',
      description: 'Find answers to common questions',
      href: '/#faq',
      badge: 'Read' as const,
      badgeColor: 'gold' as const,
    },
  ];

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
            Get Help
          </h1>
          <p className="text-xl text-white/50 max-w-2xl mx-auto">
            We're here to help you get the most out of KIN
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-4 mb-12">
          {supportOptions.map((option, index) => (
            <motion.a
              key={option.title}
              href={option.href}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <GlassCard className="p-6 h-full" hover={true}>
                <div className="text-4xl mb-4">{option.emoji}</div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-white">
                    {option.title}
                  </h3>
                  <Badge color={option.badgeColor}>{option.badge}</Badge>
                </div>
                <p className="text-sm text-white/50">{option.description}</p>
              </GlassCard>
            </motion.a>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <GlassCard className="p-6" hover={false}>
            <h2 className="text-2xl font-display font-semibold text-white mb-6">
              Contact Us
            </h2>

            {submitted ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">{'\u2705'}</div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Message Sent!
                </h3>
                <p className="text-white/50 mb-4">
                  We'll get back to you as soon as possible.
                </p>
                <Button variant="outline" onClick={() => setSubmitted(false)}>
                  Send Another Message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Subject
                  </label>
                  <select
                    required
                    value={formData.subject}
                    onChange={(e) =>
                      setFormData({ ...formData, subject: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white"
                  >
                    <option value="" className="bg-[#0a0a0f]">
                      Select a topic
                    </option>
                    <option value="technical" className="bg-[#0a0a0f]">
                      Technical Issue
                    </option>
                    <option value="billing" className="bg-[#0a0a0f]">
                      Billing
                    </option>
                    <option value="feedback" className="bg-[#0a0a0f]">
                      Feature Request
                    </option>
                    <option value="other" className="bg-[#0a0a0f]">
                      Other
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Message
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={formData.message}
                    onChange={(e) =>
                      setFormData({ ...formData, message: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 resize-none"
                    placeholder="Tell us how we can help..."
                  />
                </div>

                <Button type="submit" variant="primary">
                  Send Message
                </Button>
              </form>
            )}
          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
}
