'use client';

// ============================================================================
// StepReady - Onboarding Step 5: Completion + launch.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { getCompanion, getCompanionColor } from '@/lib/companions';
import { track } from '@/lib/analytics';
import { CompanionViewer } from '@/components/3d/CompanionViewer';
import { Button } from '@/components/ui/Button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { IOSInstallModal } from '@/components/pwa/IOSInstallModal';

interface StepReadyProps {
  selectedCompanionId: string | null;
  completing: boolean;
  error: string | null;
  onComplete: () => void;
}

function ConfettiDots({ color }: { color: string }) {
  const dots = [
    { size: 6, x: '10%', y: '20%', delay: 0 },
    { size: 4, x: '85%', y: '15%', delay: 0.2 },
    { size: 8, x: '75%', y: '70%', delay: 0.4 },
    { size: 5, x: '15%', y: '75%', delay: 0.1 },
    { size: 3, x: '90%', y: '45%', delay: 0.3 },
    { size: 7, x: '5%', y: '50%', delay: 0.5 },
    { size: 4, x: '50%', y: '5%', delay: 0.15 },
    { size: 6, x: '60%', y: '90%', delay: 0.35 },
  ];

  return (
    <>
      {dots.map((dot, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: dot.size,
            height: dot.size,
            left: dot.x,
            top: dot.y,
            backgroundColor: color,
            opacity: 0.3,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1.2, 1],
            opacity: [0, 0.5, 0.3],
          }}
          transition={{
            duration: 0.6,
            delay: 0.4 + dot.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </>
  );
}

interface ChatPreviewProps {
  companionName: string;
  companionEmoji: string;
  companionTagline: string;
  companionDescription: string;
}

type ChatPreviewMessage =
  | { id: string; role: 'user' | 'companion'; text: string }
  | { id: string; role: 'typing' };

function ChatPreview({
  companionName,
  companionEmoji,
  companionTagline,
  companionDescription,
}: ChatPreviewProps) {
  const [messages, setMessages] = useState<ChatPreviewMessage[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const firstSentence =
    companionDescription.split(/(?<=[.!?])\s+/)[0] ?? companionDescription;

  useEffect(() => {
    function schedule(fn: () => void, delay: number) {
      const id = setTimeout(fn, delay);
      timeoutsRef.current.push(id);
    }

    schedule(() => {
      setMessages([{ id: 'u1', role: 'user', text: 'Hey, nice to meet you!' }]);
    }, 0);

    schedule(() => {
      setMessages((prev) => [...prev, { id: 'typing-1', role: 'typing' }]);
    }, 800);

    schedule(() => {
      setMessages((prev) => [
        ...prev.filter((message) => message.id !== 'typing-1'),
        {
          id: 'c1',
          role: 'companion',
          text: `Hey! So excited to meet you! I'm ${companionName}, and I'm all about ${companionTagline}.`,
        },
      ]);
    }, 1800);

    schedule(() => {
      setMessages((prev) => [
        ...prev,
        { id: 'u2', role: 'user', text: 'What can you help me with?' },
      ]);
    }, 2800);

    schedule(() => {
      setMessages((prev) => [...prev, { id: 'typing-2', role: 'typing' }]);
    }, 3600);

    schedule(() => {
      setMessages((prev) => [
        ...prev.filter((message) => message.id !== 'typing-2'),
        { id: 'c2', role: 'companion', text: firstSentence },
      ]);
    }, 4600);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [companionDescription, companionName, companionTagline]);

  return (
    <div className="w-full max-w-sm mx-auto rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
        <span className="text-base">{companionEmoji}</span>
        <span className="text-sm font-medium text-white">{companionName}</span>
        <span
          className="ml-auto h-2 w-2 rounded-full"
          style={{ backgroundColor: '#22c55e' }}
        />
      </div>

      <div className="px-4 py-3 space-y-3 min-h-[140px]">
        {messages.map((message) => {
          if (message.role === 'typing') {
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-1 bg-white/[0.04] rounded-2xl rounded-tl-sm px-3 py-2 w-fit"
              >
                {[0, 0.15, 0.3].map((delay, index) => (
                  <span
                    key={index}
                    className="inline-block h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce"
                    style={{ animationDelay: `${delay}s` }}
                  />
                ))}
              </motion.div>
            );
          }

          if (message.role === 'user') {
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-end"
              >
                <span
                  className="max-w-[75%] rounded-2xl rounded-tr-sm px-3 py-2 text-xs text-white"
                  style={{ backgroundColor: 'rgba(0,240,255,0.10)' }}
                >
                  {message.text}
                </span>
              </motion.div>
            );
          }

          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <span className="max-w-[75%] rounded-2xl rounded-tl-sm bg-white/[0.04] px-3 py-2 text-xs text-white/80">
                {message.text}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export function StepReady({
  selectedCompanionId,
  completing,
  error,
  onComplete,
}: StepReadyProps) {
  const t = useTranslations('onboard.ready');
  const companion = selectedCompanionId ? getCompanion(selectedCompanionId) : null;
  const companionColor = selectedCompanionId
    ? getCompanionColor(selectedCompanionId)
    : '#00f0ff';
  const { canInstall, isIOS, isInstalled, promptInstall } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  function handleInstallCTA() {
    if (isIOS) {
      setShowIOSModal(true);
    } else {
      promptInstall();
    }
  }

  function handleComplete() {
    track('onboarding_completed', { companionId: selectedCompanionId ?? 'unknown' });
    onComplete();
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="relative flex flex-col items-center"
    >
      <ConfettiDots color={companionColor} />

      <motion.h1
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-2 text-center font-display text-3xl font-bold sm:text-4xl"
      >
        <span className="bg-gradient-to-r from-cyan via-magenta to-gold bg-clip-text text-transparent">
          {t('title')}
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.18 }}
        className="max-w-lg text-center text-sm leading-relaxed text-white/45"
      >
        {t('subtitle')}
      </motion.p>

      {companion && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="my-8"
        >
          <div className="relative mx-auto h-48 w-48 overflow-hidden rounded-2xl border border-white/10">
            <CompanionViewer
              fallbackImage={companion.images[0]}
              alt={companion.name}
              className="h-full w-full"
              modelReady={false}
            />
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 text-center text-base font-medium text-white"
          >
            {companion.emoji} {t('readyToMeet', { name: companion.name })}
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.58 }}
            className="mt-2 max-w-md text-center text-xs leading-relaxed text-white/35"
          >
            {t('firstConversation', { name: companion.name })}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mt-6 w-full"
          >
            <ChatPreview
              companionName={companion.name}
              companionEmoji={companion.emoji}
              companionTagline={companion.tagline}
              companionDescription={companion.description}
            />
          </motion.div>
        </motion.div>
      )}

      {error && (
        <div className="mb-4 w-full rounded-lg border border-magenta/30 bg-magenta/10 px-4 py-3 text-center text-sm text-magenta">
          {error}
        </div>
      )}

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button
          size="lg"
          onClick={handleComplete}
          disabled={completing}
        >
          {completing
            ? t('completing')
            : companion?.name ? t('meetButton', { name: companion.name }) : t('meetDefault')}
        </Button>
        <Button
          variant="outline"
          size="lg"
          href="/dashboard"
          disabled={completing}
        >
          {t('exploreDashboard')}
        </Button>
      </div>

      {/* PWA Install CTA — only shown when install is available */}
      {!isInstalled && (canInstall || isIOS) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="mt-4"
        >
          <button
            type="button"
            onClick={handleInstallCTA}
            className="text-sm text-cyan/60 hover:text-cyan transition-colors underline underline-offset-2"
          >
            {t('installCTA')}
          </button>
        </motion.div>
      )}

      <IOSInstallModal open={showIOSModal} onClose={() => setShowIOSModal(false)} />

      <p className="mt-6 text-center text-[11px] text-white/20">
        {t('telegramCTA')}{' '}
        <a
          href="https://t.me/KinCompanionBot"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan/50 underline underline-offset-2 hover:text-cyan/70"
        >
          @KinCompanionBot
        </a>
      </p>
    </motion.div>
  );
}
