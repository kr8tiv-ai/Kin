'use client';

// ============================================================================
// Settings Page — Profile, preferences, memory management, and danger zone.
// ============================================================================

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import { useMemories } from '@/hooks/useMemories';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { MemoryList } from '@/components/dashboard/MemoryList';
import { DangerZone } from '@/components/dashboard/DangerZone';
import { WalletCard } from '@/components/dashboard/WalletCard';
import { PhantomConnect } from '@/components/dashboard/PhantomConnect';
import { formatDate } from '@/lib/utils';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { memories, loading, error, refresh, deleteMemory, deleting } =
    useMemories();

  const [language, setLanguage] = useState('en');
  const [notifications, setNotifications] = useState(true);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

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
          Settings
        </h1>
        <p className="mt-1 text-white/50">
          Manage your profile, preferences, and account.
        </p>
      </div>

      {/* Profile Section */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          Profile
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/50">Telegram Username</p>
              <p className="text-white">
                {user?.username ? `@${user.username}` : 'Not set'}
              </p>
            </div>
            <Badge color="cyan">Telegram</Badge>
          </div>
          <div className="border-t border-white/5 pt-4">
            <p className="text-sm text-white/50">User ID</p>
            <p className="font-mono text-sm text-white/70">
              {user?.id ?? '--'}
            </p>
          </div>
          <div className="border-t border-white/5 pt-4">
            <p className="text-sm text-white/50">Name</p>
            <p className="text-white">
              {user?.firstName ?? '--'}
              {user?.lastName ? ` ${user.lastName}` : ''}
            </p>
          </div>
          <div className="border-t border-white/5 pt-4">
            <p className="text-sm text-white/50">Member Since</p>
            <p className="text-white">
              {user?.createdAt ? formatDate(user.createdAt) : '--'}
            </p>
          </div>
          <div className="border-t border-white/5 pt-4">
            <p className="text-sm text-white/50">Current Tier</p>
            <Badge
              color={
                user?.tier === 'pro'
                  ? 'magenta'
                  : user?.tier === 'enterprise'
                    ? 'gold'
                    : 'muted'
              }
            >
              {user?.tier
                ? user.tier.charAt(0).toUpperCase() + user.tier.slice(1)
                : 'Free'}
            </Badge>
          </div>
        </div>
      </GlassCard>

      {/* Preferences Section */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          Preferences
        </h2>
        <div className="space-y-6">
          {/* Language */}
          <div>
            <label
              htmlFor="language-select"
              className="mb-1.5 block text-sm font-medium text-white/70"
            >
              Language
            </label>
            <select
              id="language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm text-white transition-colors focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/30"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notifications Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/70">
                Notifications
              </p>
              <p className="text-xs text-white/40">
                Receive updates about new features and companion activity.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifications}
              onClick={() => setNotifications(!notifications)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ${
                notifications ? 'bg-cyan' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                  notifications ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Memory Management Section */}
      <GlassCard className="p-6" hover={false}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Memory Management
            </h2>
            <p className="mt-1 text-sm text-white/50">
              {memories.length} memor{memories.length === 1 ? 'y' : 'ies'}{' '}
              stored
            </p>
          </div>
          {memories.length > 0 && (
            <Button variant="ghost" size="sm" onClick={refresh}>
              Refresh
            </Button>
          )}
        </div>
        {error ? (
          <div className="py-6 text-center">
            <p className="text-sm text-white/60">{error}</p>
            <Button variant="outline" size="sm" onClick={refresh} className="mt-3">
              Retry
            </Button>
          </div>
        ) : (
          <MemoryList
            memories={memories}
            onDelete={deleteMemory}
            deleting={deleting}
          />
        )}
      </GlassCard>

      {/* Wallets */}
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-white">
          Wallets
        </h2>
        <WalletCard />
        <PhantomConnect />
      </div>

      {/* Danger Zone */}
      <DangerZone />
    </motion.div>
  );
}
