'use client';

// ============================================================================
// ReferralCode — Large code display with copy and share buttons.
// ============================================================================

import { useCallback, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface ReferralCodeProps {
  code: string;
}

const SHARE_BASE_URL = 'https://meetyourkin.com';

export function ReferralCode({ code }: ReferralCodeProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${SHARE_BASE_URL}?ref=${code}`;

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [code]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [shareUrl]);

  const shareTwitter = useCallback(() => {
    const text = encodeURIComponent(
      `Check out KIN -- your AI companion that actually remembers you. Use my referral link: ${shareUrl}`,
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  }, [shareUrl]);

  const shareTelegram = useCallback(() => {
    const text = encodeURIComponent(
      `Check out KIN -- your AI companion that actually remembers you!`,
    );
    const url = encodeURIComponent(shareUrl);
    window.open(
      `https://t.me/share/url?url=${url}&text=${text}`,
      '_blank',
    );
  }, [shareUrl]);

  return (
    <GlassCard className="p-6" glow="cyan">
      <h2 className="mb-2 font-display text-lg font-semibold text-white">
        Your Referral Code
      </h2>
      <p className="mb-4 text-sm text-white/50">
        Share this code with friends to earn rewards.
      </p>

      {/* Code display */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1 rounded-lg border border-cyan/20 bg-cyan/5 px-5 py-3 text-center">
          <span className="font-mono text-2xl font-bold tracking-wider text-cyan">
            {code}
          </span>
        </div>
        <Button variant="outline" onClick={copyCode} className="shrink-0">
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>

      {/* Share URL */}
      <div className="mb-4 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-2">
        <p className="text-xs text-white/30">Share Link</p>
        <p className="truncate font-mono text-sm text-white/60">{shareUrl}</p>
      </div>

      {/* Share buttons */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={copyLink}>
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.102 1.101"
            />
          </svg>
          Copy Link
        </Button>
        <Button variant="outline" size="sm" onClick={shareTwitter}>
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </Button>
        <Button variant="outline" size="sm" onClick={shareTelegram}>
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
          Telegram
        </Button>
      </div>
    </GlassCard>
  );
}
