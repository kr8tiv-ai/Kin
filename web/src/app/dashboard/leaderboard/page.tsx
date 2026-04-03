'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { kinApi } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  firstName: string;
  xp: number;
  level: number;
  tier: string;
}

const tierColors: Record<string, string> = {
  free: 'muted',
  hatchling: 'cyan',
  elder: 'gold',
  hero: 'magenta',
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    kinApi.get<LeaderboardEntry[]>('/community/leaderboard?limit=50')
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="font-display text-3xl font-bold text-white mb-2">
          Leaderboard
        </h1>
        <p className="text-white/50">
          Top KIN users by XP and activity
        </p>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan" />
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <motion.div
              key={entry.userId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <GlassCard className="p-4" hover={false}>
                <div className="flex items-center gap-4">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                    ${entry.rank === 1 ? 'bg-gold/20 text-gold border border-gold/30' : ''}
                    ${entry.rank === 2 ? 'bg-white/10 text-white/70 border border-white/20' : ''}
                    ${entry.rank === 3 ? 'bg-amber-900/20 text-amber-600 border border-amber-700/30' : ''}
                    ${entry.rank > 3 ? 'bg-white/5 text-white/40 border border-white/10' : ''}
                  `}>
                    {entry.rank}
                  </div>
                  
                  <div className="flex-1">
                    <p className="text-white font-medium">
                      {entry.firstName}
                      {entry.rank <= 3 && (
                        <span className="ml-2">
                          {entry.rank === 1 && '\uD83C\uDFC6'}
                          {entry.rank === 2 && '\uD83C\uDFC6'}
                          {entry.rank === 3 && '\uD83C\uDFC6'}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-white/40">
                      Level {entry.level} \u2022 {entry.xp.toLocaleString()} XP
                    </p>
                  </div>

                  <Badge color={tierColors[entry.tier] as any}>
                    {entry.tier}
                  </Badge>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}

      {entries.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-white/40">No leaderboard data yet</p>
        </div>
      )}
    </div>
  );
}
