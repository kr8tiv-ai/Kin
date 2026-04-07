'use client';

// ============================================================================
// Settings Page — Profile, preferences, memory management, and danger zone.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import { useMemories } from '@/hooks/useMemories';
import { kinApi } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { MemoryList } from '@/components/dashboard/MemoryList';
import { DangerZone } from '@/components/dashboard/DangerZone';
import { WalletCard } from '@/components/dashboard/WalletCard';
import { PhantomConnect } from '@/components/dashboard/PhantomConnect';
import { MigrationWizard } from '@/components/dashboard/MigrationWizard';
import type { UserPreferences } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const TONE_OPTIONS = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'technical', label: 'Technical' },
];

const TIER_COLORS: Record<string, 'muted' | 'cyan' | 'magenta' | 'gold'> = {
  free: 'muted',
  hatchling: 'cyan',
  elder: 'magenta',
  hero: 'gold',
};

const TIER_BORDER_CLASSES: Record<string, string> = {
  free: 'border-white/10',
  hatchling: 'border-cyan/30',
  elder: 'border-magenta/30',
  hero: 'border-gold/30',
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { user } = useAuth();
  const { memories, loading, error, refresh, deleteMemory, deleting } =
    useMemories();

  const [language, setLanguage] = useState('en');
  const [tone, setTone] = useState('friendly');
  const [displayName, setDisplayName] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [privacyMode, setPrivacyMode] = useState<'private' | 'shared'>('private');
  const [privacySaving, setPrivacySaving] = useState(false);
  const [wizardMode, setWizardMode] = useState<'export' | 'import' | null>(null);
  const [timezone, setTimezone] = useState('');

  // Detect timezone on mount
  useEffect(() => {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      setTimezone('Unknown');
    }
  }, []);

  // Populate display name from user data
  useEffect(() => {
    if (user?.firstName) {
      setDisplayName(
        `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`,
      );
    }
  }, [user?.firstName, user?.lastName]);

  // Load privacy mode from API on mount
  useEffect(() => {
    kinApi
      .get<UserPreferences>('/preferences')
      .then((prefs) => {
        if (prefs.privacyMode) {
          setPrivacyMode(prefs.privacyMode);
        }
      })
      .catch(() => {
        // Keep default 'private' on error
      });
  }, []);

  const handlePrivacyChange = useCallback(async (mode: 'private' | 'shared') => {
    setPrivacyMode(mode);
    setPrivacySaving(true);
    try {
      await kinApi.put('/preferences', { privacyMode: mode });
    } catch {
      // Revert on failure
      setPrivacyMode(mode === 'private' ? 'shared' : 'private');
    } finally {
      setPrivacySaving(false);
    }
  }, []);

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

  const tierKey = user?.tier ?? 'free';
  const tierColor = TIER_COLORS[tierKey] ?? 'muted';
  const tierBorder = TIER_BORDER_CLASSES[tierKey] ?? 'border-white/10';

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

      {/* User Info Section */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          Profile
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/50">Name</p>
              <p className="text-white">
                {user?.firstName ?? '--'}
                {user?.lastName ? ` ${user.lastName}` : ''}
              </p>
            </div>
            <div className={`rounded-full border px-3 py-1 ${tierBorder}`}>
              <Badge color={tierColor}>
                {tierKey.charAt(0).toUpperCase() + tierKey.slice(1)}
              </Badge>
            </div>
          </div>
          <div className="border-t border-white/5 pt-4">
            <p className="text-sm text-white/50">Telegram Username</p>
            <p className="text-white">
              {user?.username ? `@${user.username}` : 'Not set'}
            </p>
          </div>
          <div className="border-t border-white/5 pt-4">
            <p className="text-sm text-white/50">User ID</p>
            <p className="font-mono text-sm text-white/70">
              {user?.id ?? '--'}
            </p>
          </div>
          <div className="border-t border-white/5 pt-4">
            <p className="text-sm text-white/50">Member Since</p>
            <p className="text-white">
              {user?.createdAt ? formatDate(user.createdAt) : '--'}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Preferences Section */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          Preferences
        </h2>
        <div className="space-y-6">
          {/* Display Name */}
          <div>
            <label
              htmlFor="display-name"
              className="mb-1.5 block text-sm font-medium text-white/70"
            >
              Display Name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              readOnly
              className="w-full max-w-xs rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm text-white/70 cursor-default focus:outline-none"
            />
            <p className="mt-1 text-xs text-white/30">
              Display name is synced from your Telegram profile.
            </p>
          </div>

          {/* Tone */}
          <div>
            <label
              htmlFor="tone-select"
              className="mb-1.5 block text-sm font-medium text-white/70"
            >
              Tone
            </label>
            <select
              id="tone-select"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm text-white transition-colors focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/30"
            >
              {TONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-white/30">
              How your KIN speaks to you.
            </p>
          </div>

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

          {/* Timezone */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-white/70">
              Timezone
            </p>
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm text-white/70">
                {timezone || 'Detecting...'}
              </div>
              <span className="text-xs text-white/30">
                Detected from your browser
              </span>
            </div>
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

      {/* Data & Privacy — Privacy Toggle + Export */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-2 font-display text-lg font-semibold text-white">
          Data &amp; Privacy
        </h2>
        <p className="mb-4 text-sm text-white/50">
          When private, your companion uses only local AI. When shared, frontier
          AI handles complex requests and helps your companion learn.
        </p>

        {/* Privacy Mode Toggle */}
        <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={privacySaving}
            onClick={() => handlePrivacyChange('private')}
            className={cn(
              'rounded-lg border px-4 py-3 text-left transition-all duration-200',
              privacyMode === 'private'
                ? 'border-cyan bg-cyan/10 text-cyan'
                : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/20 hover:text-white/70',
              privacySaving && 'pointer-events-none opacity-60',
            )}
          >
            <p className="text-sm font-semibold">Keep conversations private</p>
            <p className="mt-1 text-xs opacity-60">
              Your companion uses only the local model. Nothing leaves your device.
            </p>
          </button>
          <button
            type="button"
            disabled={privacySaving}
            onClick={() => handlePrivacyChange('shared')}
            className={cn(
              'rounded-lg border px-4 py-3 text-left transition-all duration-200',
              privacyMode === 'shared'
                ? 'border-magenta bg-magenta/10 text-magenta'
                : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/20 hover:text-white/70',
              privacySaving && 'pointer-events-none opacity-60',
            )}
          >
            <p className="text-sm font-semibold">Help your companion learn</p>
            <p className="mt-1 text-xs opacity-60">
              Complex questions use frontier AI. Responses improve your companion over time.
            </p>
          </button>
        </div>

        {/* Move Your KIN */}
        <div className="border-t border-white/5 pt-4">
          <p className="mb-1 text-sm font-semibold text-white">
            Move Your KIN
          </p>
          <p className="mb-3 text-sm text-white/50">
            Transfer your companion, conversations, and training data between
            devices or hosting modes.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setWizardMode('export')}
              className="border-cyan/30 text-cyan hover:bg-cyan/10"
            >
              Export Archive
            </Button>
            <Button
              variant="outline"
              onClick={() => setWizardMode('import')}
            >
              Import Archive
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Danger Zone */}
      <DangerZone />

      {/* Migration Wizard Modal */}
      <MigrationWizard
        mode={wizardMode ?? 'export'}
        open={wizardMode !== null}
        onClose={() => setWizardMode(null)}
      />
    </motion.div>
  );
}
