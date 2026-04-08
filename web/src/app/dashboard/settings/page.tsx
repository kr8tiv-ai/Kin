'use client';

// ============================================================================
// Settings Page — Profile, preferences, memory management, and danger zone.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/providers/AuthProvider';
import { useLocale } from '@/providers/LocaleProvider';
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
import { ProactiveSettings } from '@/components/dashboard/ProactiveSettings';
import { SuggestionHistory } from '@/components/dashboard/SuggestionHistory';
import { useProactiveSettings } from '@/hooks/useProactiveSettings';
import { useProactiveSuggestions } from '@/hooks/useProactiveSuggestions';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { IOSInstallModal } from '@/components/pwa/IOSInstallModal';
import type { UserPreferences } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Português' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
  { value: 'ar', label: 'العربية' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'ru', label: 'Русский' },
  { value: 'it', label: 'Italiano' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'vi', label: 'Tiếng Việt' },
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
  const { locale, setLocale } = useLocale();
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const { memories, loading, error, refresh, deleteMemory, deleting } =
    useMemories();

  const [tone, setTone] = useState('friendly');
  const [displayName, setDisplayName] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [privacyMode, setPrivacyMode] = useState<'private' | 'shared'>('private');
  const [privacySaving, setPrivacySaving] = useState(false);
  const [wizardMode, setWizardMode] = useState<'export' | 'import' | null>(null);
  const [timezone, setTimezone] = useState('');
  const [showIOSModal, setShowIOSModal] = useState(false);
  const pwa = usePWAInstall();
  const proactiveSettings = useProactiveSettings();
  const proactiveSuggestions = useProactiveSuggestions();

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
          {t('title')}
        </h1>
        <p className="mt-1 text-white/50">
          {t('subtitle')}
        </p>
      </div>

      {/* User Info Section */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          {t('profile.title')}
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/50">{t('profile.name')}</p>
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
            <p className="text-sm text-white/50">{t('profile.telegramUsername')}</p>
            <p className="text-white">
              {user?.username ? `@${user.username}` : t('profile.notSet')}
            </p>
          </div>
          <div className="border-t border-white/5 pt-4">
            <p className="text-sm text-white/50">{t('profile.userId')}</p>
            <p className="font-mono text-sm text-white/70">
              {user?.id ?? '--'}
            </p>
          </div>
          <div className="border-t border-white/5 pt-4">
            <p className="text-sm text-white/50">{t('profile.memberSince')}</p>
            <p className="text-white">
              {user?.createdAt ? formatDate(user.createdAt) : '--'}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Preferences Section */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          {t('preferences.title')}
        </h2>
        <div className="space-y-6">
          {/* Display Name */}
          <div>
            <label
              htmlFor="display-name"
              className="mb-1.5 block text-sm font-medium text-white/70"
            >
              {t('preferences.displayName')}
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              readOnly
              className="w-full max-w-xs rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm text-white/70 cursor-default focus:outline-none"
            />
            <p className="mt-1 text-xs text-white/30">
              {t('preferences.displayNameHint')}
            </p>
          </div>

          {/* Tone */}
          <div>
            <label
              htmlFor="tone-select"
              className="mb-1.5 block text-sm font-medium text-white/70"
            >
              {t('preferences.tone')}
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
              {t('preferences.toneHint')}
            </p>
          </div>

          {/* Language */}
          <div>
            <label
              htmlFor="language-select"
              className="mb-1.5 block text-sm font-medium text-white/70"
            >
              {t('preferences.language')}
            </label>
            <select
              id="language-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
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
              {t('preferences.timezone')}
            </p>
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm text-white/70">
                {timezone || t('preferences.detecting')}
              </div>
              <span className="text-xs text-white/30">
                {t('preferences.timezoneHint')}
              </span>
            </div>
          </div>

          {/* Notifications Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/70">
                {t('preferences.notifications')}
              </p>
              <p className="text-xs text-white/40">
                {t('preferences.notificationsHint')}
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

      {/* Proactive Companion Section */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          {t('proactive.title')}
        </h2>
        <p className="mb-4 text-sm text-white/50">
          {t('proactive.description')}
        </p>
        {proactiveSettings.loading ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-6 w-32" />
          </div>
        ) : proactiveSettings.settings ? (
          <>
            <ProactiveSettings
              settings={proactiveSettings.settings}
              onUpdate={proactiveSettings.updateSettings}
              onRefresh={proactiveSettings.refresh}
            />
            <div className="mt-6 border-t border-white/5 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-white/70">
                {t('proactive.suggestionHistory')}
              </h3>
              <SuggestionHistory
                suggestions={proactiveSuggestions.suggestions}
                loading={proactiveSuggestions.loading}
                onFeedback={proactiveSuggestions.sendFeedback}
              />
            </div>
          </>
        ) : proactiveSettings.error ? (
          <p className="text-sm text-white/50">{proactiveSettings.error}</p>
        ) : null}
      </GlassCard>

      {/* Memory Management Section */}
      <GlassCard className="p-6" hover={false}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              {t('memory.title')}
            </h2>
            <p className="mt-1 text-sm text-white/50">
              {t('memory.count', { count: memories.length })}
            </p>
          </div>
          {memories.length > 0 && (
            <Button variant="ghost" size="sm" onClick={refresh}>
              {tc('refresh')}
            </Button>
          )}
        </div>
        {error ? (
          <div className="py-6 text-center">
            <p className="text-sm text-white/60">{error}</p>
            <Button variant="outline" size="sm" onClick={refresh} className="mt-3">
              {tc('retry')}
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
          {t('wallets.title')}
        </h2>
        <WalletCard />
        <PhantomConnect />
      </div>

      {/* Install App */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-2 font-display text-lg font-semibold text-white">
          {t('installApp.title')}
        </h2>
        <p className="mb-4 text-sm text-white/50">
          {t('installApp.description')}
        </p>
        {pwa.isInstalled ? (
          <div className="flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/[0.04] px-4 py-3">
            <span className="text-cyan">✓</span>
            <p className="text-sm text-cyan">{t('installApp.installed')}</p>
          </div>
        ) : pwa.canInstall ? (
          <Button
            onClick={() => pwa.promptInstall()}
          >
            {t('installApp.install')}
          </Button>
        ) : pwa.isIOS ? (
          <>
            <Button
              variant="outline"
              onClick={() => setShowIOSModal(true)}
            >
              {t('installApp.iosHow')}
            </Button>
            <IOSInstallModal open={showIOSModal} onClose={() => setShowIOSModal(false)} />
          </>
        ) : (
          <p className="text-sm text-white/40">
            {t('installApp.browserHint')}
          </p>
        )}
      </GlassCard>

      {/* Data & Privacy — Privacy Toggle + Export */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-2 font-display text-lg font-semibold text-white">
          {t('dataPrivacy.title')}
        </h2>
        <p className="mb-4 text-sm text-white/50">
          {t('dataPrivacy.description')}
        </p>

        {/* Privacy Mode Toggle — hidden for child accounts (COPPA: locked to private) */}
        {user?.authProvider === 'family' ? (
          <div className="mb-6 rounded-lg border border-cyan/20 bg-cyan/5 px-4 py-3">
            <p className="text-sm text-cyan">
              {t('dataPrivacy.childLocked')}
            </p>
          </div>
        ) : (
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
              <p className="text-sm font-semibold">{t('dataPrivacy.keepPrivate')}</p>
              <p className="mt-1 text-xs opacity-60">
                {t('dataPrivacy.keepPrivateHint')}
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
              <p className="text-sm font-semibold">{t('dataPrivacy.helpLearn')}</p>
              <p className="mt-1 text-xs opacity-60">
                {t('dataPrivacy.helpLearnHint')}
              </p>
            </button>
          </div>
        )}

        {/* Move Your KIN */}
        <div className="border-t border-white/5 pt-4">
          <p className="mb-1 text-sm font-semibold text-white">
            {t('dataPrivacy.moveYourKin')}
          </p>
          <p className="mb-3 text-sm text-white/50">
            {t('dataPrivacy.moveDescription')}
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setWizardMode('export')}
              className="border-cyan/30 text-cyan hover:bg-cyan/10"
            >
              {t('dataPrivacy.exportArchive')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setWizardMode('import')}
            >
              {t('dataPrivacy.importArchive')}
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
