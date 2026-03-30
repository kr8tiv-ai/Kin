'use client';

// ============================================================================
// TokenStats — Live KIN token price, volume, and market cap from Bags.fm.
// Shows hackathon judges that we have real onchain integration.
// ============================================================================

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { BAGS_APP_URL, BAGS_TOKEN_ADDRESS } from '@/lib/bags';

interface PoolData {
  priceUsd?: number;
  volume24h?: number;
  marketCap?: number;
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(6)}`;
}

export function TokenStats() {
  const [pool, setPool] = useState<PoolData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch live pool data directly from Bags.fm public API (no key needed for public pool data)
    async function fetchPool() {
      try {
        const res = await fetch(
          `https://public-api-v2.bags.fm/api/v1/pools/${BAGS_TOKEN_ADDRESS}`,
        );
        if (!res.ok) throw new Error('Failed to fetch pool');
        const data = await res.json();
        if (data.success && data.response) {
          setPool(data.response);
        }
      } catch {
        // Silently fail — widget just won't show data
      } finally {
        setLoading(false);
      }
    }
    fetchPool();

    // Refresh every 60s
    const interval = setInterval(fetchPool, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <GlassCard className="p-4" hover={false}>
        <div className="animate-pulse space-y-2">
          <div className="h-3 w-24 rounded bg-white/5" />
          <div className="h-6 w-32 rounded bg-white/5" />
        </div>
      </GlassCard>
    );
  }

  if (!pool) return null;

  const stats = [
    {
      label: 'KIN Price',
      value: pool.priceUsd ? formatCurrency(pool.priceUsd) : '--',
      color: 'text-cyan',
    },
    {
      label: '24h Volume',
      value: pool.volume24h ? formatCurrency(pool.volume24h) : '--',
      color: 'text-magenta',
    },
    {
      label: 'Market Cap',
      value: pool.marketCap ? formatCurrency(pool.marketCap) : '--',
      color: 'text-gold',
    },
  ];

  return (
    <a
      href={`${BAGS_APP_URL}/token/${BAGS_TOKEN_ADDRESS}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <GlassCard className="p-4" hover>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
              Live on Bags.fm
            </span>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-white/20"
            aria-hidden="true"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="15 3 21 3 21 9" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
            >
              <p className="text-[10px] text-white/30 mb-0.5">{stat.label}</p>
              <p className={`text-sm font-bold font-mono ${stat.color}`}>
                {stat.value}
              </p>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </a>
  );
}
