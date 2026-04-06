'use client';

// ============================================================================
// KIN Setup & Configuration — Beautiful, kid-friendly setup hub.
// Connection status, local AI setup steps, integrations, and advanced config.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { kinApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { InstallerStatusResponse, CompletionStatusResponse, User } from '@/lib/types';
import { phaseToPlainLanguage, recoveryActionsForStatus } from '@/lib/installer-ui';
import type { WizardStatus } from '@/lib/setup-wizard-ui';
import {
  canCompleteWizard,
  getBlockingSummary,
  getNextActionLabels,
  stepStatusToBadgeColor,
  stepStatusToLabel,
} from '@/lib/setup-wizard-ui';
import {
  gateStatusToBadgeColor,
  gateStatusToLabel,
  progressToPercentage,
  getGateRecoveryLabels,
  canCompleteDeployment,
  getOverallBlockingSummary,
} from '@/lib/completion-ui';
import { useAuth } from '@/providers/AuthProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelStatus {
  online?: boolean;
  model?: string;
  hasModel?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'rounded-md border px-3 py-1.5 text-xs font-medium transition-all duration-200',
        copied
          ? 'border-cyan/30 bg-cyan/10 text-cyan'
          : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/70',
      )}
    >
      {copied ? '\u2713 Copied!' : 'Copy'}
    </button>
  );
}

function StepNumber({
  n,
  done,
}: {
  n: number;
  done: boolean;
}) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-300',
        done
          ? 'bg-cyan/20 text-cyan border border-cyan/30'
          : 'bg-white/5 text-white/40 border border-white/10',
      )}
    >
      {done ? '\u2713' : n}
    </div>
  );
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span className="relative flex h-3 w-3">
      {online && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-40" />
      )}
      <span
        className={cn(
          'relative inline-flex h-3 w-3 rounded-full',
          online ? 'bg-cyan' : 'bg-magenta',
        )}
      />
    </span>
  );
}

function installerBadgeColor(
  status: InstallerStatusResponse['status'] | null,
): 'cyan' | 'gold' | 'magenta' | 'muted' {
  if (!status) return 'muted';

  if (status === 'complete') return 'cyan';
  if (status === 'running' || status === 'waiting-confirmation') return 'gold';
  if (status === 'failed') return 'magenta';
  return 'muted';
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const { token, login } = useAuth();
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [modelReady, setModelReady] = useState<boolean>(false);
  const [installerStatus, setInstallerStatus] =
    useState<InstallerStatusResponse | null>(null);
  const [wizardStatus, setWizardStatus] = useState<WizardStatus | null>(null);
  const [completionStatus, setCompletionStatus] =
    useState<CompletionStatusResponse | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [installerActionBusy, setInstallerActionBusy] = useState(false);
  const [wizardActionBusy, setWizardActionBusy] = useState(false);
  const [wizardNotice, setWizardNotice] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [completionActionBusy, setCompletionActionBusy] = useState(false);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [completionActionError, setCompletionActionError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('qwen3:32b');

  // Check connection + installer + wizard + completion status on mount
  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const [ollamaData, installerData, wizardData, completionData] = await Promise.all([
        kinApi.get<ModelStatus>('/health/ollama'),
        kinApi.get<InstallerStatusResponse>('/installer/status'),
        kinApi.get<WizardStatus>('/setup-wizard/status'),
        kinApi.get<CompletionStatusResponse>('/completion/status'),
      ]);

      setOllamaOnline(ollamaData?.online ?? false);
      setModelReady(ollamaData?.hasModel ?? false);
      setInstallerStatus(installerData);
      setWizardStatus(wizardData);
      setCompletionStatus(completionData);
      setCompletionError(null);
    } catch {
      setOllamaOnline(false);
      setModelReady(false);
      setInstallerStatus(null);
      setWizardStatus(null);
      setCompletionStatus(null);
      setCompletionError('Failed to load setup status');
    } finally {
      setChecking(false);
    }
  }, []);

  const runInstallerAction = useCallback(
    async (
      action: 'retry' | 'restart' | 'approve-external' | 'reject-external',
    ) => {
      setInstallerActionBusy(true);
      try {
        if (action === 'retry') {
          await kinApi.post('/installer/retry');
        } else if (action === 'restart') {
          await kinApi.post('/installer/restart');
        } else if (action === 'approve-external') {
          await kinApi.post('/installer/confirm-external', { approved: true });
        } else {
          await kinApi.post('/installer/confirm-external', { approved: false });
        }
      } catch {
        // keep UI resilient — status refresh will show latest truth from API
      } finally {
        setInstallerActionBusy(false);
        await checkStatus();
      }
    },
    [checkStatus],
  );

  const completeWizard = useCallback(async () => {
    if (!wizardStatus || !canCompleteWizard(wizardStatus)) {
      setWizardError(
        wizardStatus?.completion?.reason ?? 'Please resolve blocking setup steps first.',
      );
      return;
    }

    setWizardActionBusy(true);
    setWizardNotice(null);
    setWizardError(null);

    try {
      const response = await kinApi.post<{
        success: boolean;
        isComplete: boolean;
      }>('/setup-wizard/complete', { confirmed: true });

      if (!response.success || !response.isComplete) {
        setWizardError('Setup completion was not accepted. Please retry.');
      } else {
        setWizardNotice('Setup marked complete. You can continue in the dashboard.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to complete setup';
      setWizardError(message);
    } finally {
      setWizardActionBusy(false);
      await checkStatus();
    }
  }, [checkStatus, wizardStatus]);

  const completeDeployment = useCallback(async () => {
    if (!completionStatus || !canCompleteDeployment(completionStatus)) {
      setCompletionActionError('Please resolve all setup gates first.');
      return;
    }

    setCompletionActionBusy(true);
    setCompletionNotice(null);
    setCompletionActionError(null);

    try {
      const response = await kinApi.post<{
        success: boolean;
        error?: string;
      }>('/completion/complete');

      if (!response.success) {
        setCompletionActionError(response.error ?? 'Completion was not accepted. Please retry.');
      } else {
        setCompletionNotice('Setup complete! Your KIN is fully configured.');

        // Refresh auth state so deploymentComplete propagates across the app
        try {
          const verifyResponse = await kinApi.get<{ user: User; valid: boolean }>('/auth/verify');
          if (verifyResponse.valid && verifyResponse.user && token) {
            login(token, verifyResponse.user);
          }
        } catch {
          // Auth refresh is best-effort — page status still reflects truth
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to complete setup';
      setCompletionActionError(message);
    } finally {
      setCompletionActionBusy(false);
      await checkStatus();
    }
  }, [checkStatus, completionStatus, token, login]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const installerPhaseLabel = phaseToPlainLanguage(
    installerStatus?.currentPhase ?? 'preflight',
  );

  const installerActions = recoveryActionsForStatus(
    installerStatus?.status ?? 'idle',
    installerStatus?.pendingAction ?? null,
  );

  const step1Done = ollamaOnline === true;
  const step2Done = modelReady;
  const step3Done = step1Done && step2Done;

  return (
    <motion.div
      className="max-w-3xl mx-auto space-y-8 pb-12"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Setup Your KIN {'\uD83D\uDD27'}
        </h1>
        <p className="mt-2 text-white/50 max-w-lg">
          Get your personal AI companion up and running! Follow the steps below
          to connect your local AI brain and unlock all the cool features.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 0. Unified Completion Progress                                       */}
      {/* ------------------------------------------------------------------ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <GlassCard className="p-6" hover={false}>
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="font-display text-lg font-semibold text-white">
              Setup Progress
            </h2>
            {completionStatus && (
              <Badge color={completionStatus.overallComplete ? 'cyan' : 'gold'}>
                {completionStatus.overallComplete ? 'Complete' : 'In Progress'}
              </Badge>
            )}
          </div>

          {checking && !completionStatus ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 w-3/4 rounded bg-white/5" />
              <div className="h-2 w-full rounded-full bg-white/5" />
              <div className="h-12 rounded-xl bg-white/[0.02]" />
            </div>
          ) : completionError && !completionStatus ? (
            <div className="rounded-xl border border-magenta/20 bg-magenta/5 px-5 py-4">
              <p className="text-sm text-magenta/80">{completionError}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={checkStatus} disabled={checking}>
                Retry
              </Button>
            </div>
          ) : completionStatus ? (
            <div className="space-y-4">
              {/* Progress summary + bar */}
              <div className="space-y-2">
                <p className="text-sm text-white/70">
                  {completionStatus.progress.summary}
                </p>
                <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-cyan to-cyan/70"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressToPercentage(completionStatus.progress)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Per-gate status list */}
              <div className="space-y-3">
                {completionStatus.gates.map((gate) => (
                  <div
                    key={gate.id}
                    className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white/80">{gate.label}</p>
                        {!gate.ready && (
                          <p className="text-xs text-white/45 mt-1">{gate.description}</p>
                        )}
                      </div>
                      <Badge color={gateStatusToBadgeColor(gate.ready)}>
                        {gateStatusToLabel(gate.ready)}
                      </Badge>
                    </div>

                    {!gate.ready && gate.recoveryActions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {getGateRecoveryLabels(gate.recoveryActions).map((recovery) => {
                          if (recovery.action === 'retry') {
                            return (
                              <Button
                                key={`${gate.id}-${recovery.action}`}
                                variant="outline"
                                size="sm"
                                onClick={checkStatus}
                                disabled={checking}
                              >
                                {recovery.label}
                              </Button>
                            );
                          }

                          if (recovery.action === 'open-setup-wizard') {
                            return (
                              <Button
                                key={`${gate.id}-${recovery.action}`}
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const wizardSection = document.getElementById('setup-wizard-section');
                                  wizardSection?.scrollIntoView({ behavior: 'smooth' });
                                }}
                              >
                                {recovery.label}
                              </Button>
                            );
                          }

                          if (recovery.action === 'contact-support') {
                            return (
                              <Button
                                key={`${gate.id}-${recovery.action}`}
                                variant="ghost"
                                size="sm"
                                href="/dashboard/help"
                              >
                                {recovery.label}
                              </Button>
                            );
                          }

                          if (recovery.action === 'check-deploy-status' || recovery.action === 'retry-deploy') {
                            return (
                              <Button
                                key={`${gate.id}-${recovery.action}`}
                                variant="outline"
                                size="sm"
                                onClick={checkStatus}
                                disabled={checking}
                              >
                                {recovery.label}
                              </Button>
                            );
                          }

                          if (recovery.action === 'restart') {
                            return (
                              <Button
                                key={`${gate.id}-${recovery.action}`}
                                variant="ghost"
                                size="sm"
                                onClick={checkStatus}
                                disabled={checking}
                              >
                                {recovery.label}
                              </Button>
                            );
                          }

                          return (
                            <span
                              key={`${gate.id}-${recovery.action}`}
                              className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-white/50"
                            >
                              {recovery.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Completion button */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white/80">
                      {completionStatus.overallComplete
                        ? 'Your KIN setup is complete!'
                        : 'Mark Setup Complete'}
                    </p>
                    <p className="text-xs text-white/45 mt-1">
                      {completionStatus.overallComplete
                        ? 'All setup gates passed. Head to the dashboard to start chatting.'
                        : getOverallBlockingSummary(completionStatus)}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={
                      completionActionBusy ||
                      completionStatus.overallComplete ||
                      !canCompleteDeployment(completionStatus)
                    }
                    onClick={completeDeployment}
                  >
                    {completionActionBusy
                      ? 'Completing...'
                      : completionStatus.overallComplete
                      ? '\u2713 Setup Complete'
                      : 'Mark Setup Complete'}
                  </Button>
                </div>

                {completionNotice && (
                  <p className="text-xs text-cyan mt-3">{completionNotice}</p>
                )}
                {completionActionError && (
                  <p className="text-xs text-magenta mt-3">{completionActionError}</p>
                )}
              </div>
            </div>
          ) : null}
        </GlassCard>
      </motion.div>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Installer Progress                                               */}
      {/* ------------------------------------------------------------------ */}
      <GlassCard className="p-6" hover={false}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="font-display text-lg font-semibold text-white">
            Installer Progress
          </h2>
          <Badge color={installerBadgeColor(installerStatus?.status ?? null)}>
            {installerStatus?.status ?? 'unknown'}
          </Badge>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4 space-y-2">
          <p className="text-sm font-medium text-white/80">{installerPhaseLabel}</p>
          {installerStatus?.pendingAction && (
            <p className="text-xs text-gold/80">
              Approval needed: {installerStatus.pendingAction.description}
            </p>
          )}
          {installerStatus?.lastError && (
            <p className="text-xs text-magenta/80">Last error: {installerStatus.lastError}</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {installerActions.includes('retry') && (
            <Button
              size="sm"
              variant="outline"
              disabled={installerActionBusy}
              onClick={() => runInstallerAction('retry')}
            >
              Retry
            </Button>
          )}

          {installerActions.includes('restart') && (
            <Button
              size="sm"
              variant="ghost"
              disabled={installerActionBusy}
              onClick={() => runInstallerAction('restart')}
            >
              Restart Setup
            </Button>
          )}

          {installerActions.includes('approve-external') && (
            <Button
              size="sm"
              variant="primary"
              disabled={installerActionBusy}
              onClick={() => runInstallerAction('approve-external')}
            >
              Approve External Action
            </Button>
          )}

          {installerActions.includes('reject-external') && (
            <Button
              size="sm"
              variant="outline"
              disabled={installerActionBusy}
              onClick={() => runInstallerAction('reject-external')}
            >
              Reject External Action
            </Button>
          )}

          {installerActions.includes('contact-support') && (
            <Button size="sm" variant="ghost" href="/dashboard/help">
              Contact Support
            </Button>
          )}
        </div>
      </GlassCard>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Connection Status                                                */}
      {/* ------------------------------------------------------------------ */}
      <GlassCard className="p-6" hover={false}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-white">
            Connection Status
          </h2>
          <Button variant="ghost" size="sm" onClick={checkStatus} disabled={checking}>
            {checking ? 'Checking...' : 'Refresh'}
          </Button>
        </div>

        {checking && ollamaOnline === null ? (
          <div className="flex items-center gap-3 py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-cyan" />
            <span className="text-sm text-white/50">Looking for your AI brain...</span>
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4">
            <StatusDot online={ollamaOnline === true} />
            <div className="flex-1">
              <p className="text-sm font-medium text-white/80">
                {ollamaOnline
                  ? 'Local AI is connected and ready!'
                  : 'Your AI brain isn\u2019t running yet'}
              </p>
              <p className="text-xs text-white/40 mt-0.5">
                {ollamaOnline
                  ? `Ollama is online ${modelReady ? '\u2014 model loaded and good to go \u{1F389}' : '\u2014 but no model is installed yet'}`
                  : 'Follow the steps below to get started \u2014 it only takes a few minutes!'}
              </p>
            </div>
            <Badge color={ollamaOnline ? 'cyan' : 'magenta'}>
              {ollamaOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>
        )}

        {!ollamaOnline && ollamaOnline !== null && (
          <div className="mt-4 rounded-lg border border-gold/20 bg-gold/5 px-4 py-3">
            <p className="text-sm text-gold/80">
              {'\uD83D\uDCA1'} <strong>Tip:</strong> Make sure Ollama is installed and running on your
              computer. It usually starts automatically after installation!
            </p>
          </div>
        )}
      </GlassCard>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Local AI Setup Steps                                             */}
      {/* ------------------------------------------------------------------ */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="font-display text-lg font-semibold text-white mb-6">
          Get Your AI Brain Running {'\uD83E\uDDE0'}
        </h2>

        <div className="space-y-6">
          {/* Step 1 — Download Ollama */}
          <div className="flex items-start gap-4">
            <StepNumber n={1} done={step1Done} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white/90">
                Download Ollama
              </h3>
              <p className="text-xs text-white/40 mt-1 mb-3">
                Ollama is a free, lightweight app that lets AI models run right on
                your own computer. Nothing leaves your machine {'\uD83D\uDD12'}
              </p>
              <Button
                variant={step1Done ? 'ghost' : 'primary'}
                size="sm"
                onClick={() => window.open('https://ollama.com', '_blank')}
              >
                {step1Done ? '\u2713 Ollama Installed' : 'Download from ollama.com'}
              </Button>
            </div>
          </div>

          <div className="ml-4 border-l border-white/5 h-4" />

          {/* Step 2 — Install model */}
          <div className="flex items-start gap-4">
            <StepNumber n={2} done={step2Done} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white/90">
                Install your KIN&apos;s brain
              </h3>
              <p className="text-xs text-white/40 mt-1 mb-3">
                Open a terminal or command prompt and paste this command. It downloads
                the smart AI model your KIN uses to think {'\uD83E\uDDE0'}
              </p>
              <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-4 py-3">
                <code className="flex-1 text-sm font-mono text-cyan select-all">
                  ollama pull qwen3:32b
                </code>
                <CopyButton text="ollama pull qwen3:32b" />
              </div>
              <p className="text-xs text-white/30 mt-2">
                This is a one-time download (~20 GB). It might take 10-30 minutes
                depending on your internet speed.
              </p>
            </div>
          </div>

          <div className="ml-4 border-l border-white/5 h-4" />

          {/* Step 3 — Start chatting */}
          <div className="flex items-start gap-4">
            <StepNumber n={3} done={step3Done} />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white/90">
                Start chatting!
              </h3>
              <p className="text-xs text-white/40 mt-1 mb-3">
                Once everything is installed, head to the chat page and say hello
                to your KIN! It&apos;s excited to meet you {'\uD83D\uDC4B'}
              </p>
              <Button
                variant={step3Done ? 'primary' : 'outline'}
                size="sm"
                href="/dashboard/chat"
                disabled={!step3Done}
              >
                {step3Done ? 'Chat with Your KIN \u2192' : 'Complete steps above first'}
              </Button>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Integrations / Setup Wizard Status                               */}
      {/* ------------------------------------------------------------------ */}
      <div id="setup-wizard-section">
      <GlassCard className="p-6" hover={false}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="font-display text-lg font-semibold text-white">
            Setup Wizard {'\uD83D\uDD17'}
          </h2>
          {wizardStatus && (
            <Badge color={wizardStatus.isComplete ? 'cyan' : 'gold'}>
              {wizardStatus.isComplete ? 'Complete' : 'In Progress'}
            </Badge>
          )}
        </div>

        <p className="text-xs text-white/40 mb-4">
          Track your setup progress and complete pending steps.
        </p>

        {wizardStatus?.steps ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4">
              <p className="text-sm text-white/70">{getBlockingSummary(wizardStatus)}</p>
              {!canCompleteWizard(wizardStatus) && wizardStatus.completion?.reason && (
                <p className="text-xs text-gold/80 mt-2">{wizardStatus.completion.reason}</p>
              )}
            </div>

            {wizardStatus.steps.map((step) => (
              <div
                key={step.id}
                className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/80">{step.label}</p>
                    <p className="text-xs text-white/45 mt-1">{step.message}</p>
                  </div>
                  <Badge color={stepStatusToBadgeColor(step.status)}>
                    {stepStatusToLabel(step.status)}
                  </Badge>
                </div>

                {step.nextActions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getNextActionLabels(step.nextActions).map((action) => {
                      if (action.action === 'retry') {
                        return (
                          <Button
                            key={`${step.id}-${action.action}`}
                            variant="outline"
                            size="sm"
                            onClick={checkStatus}
                            disabled={checking || wizardActionBusy}
                          >
                            {action.label}
                          </Button>
                        );
                      }

                      if (action.action === 'open-provider') {
                        return (
                          <Button
                            key={`${step.id}-${action.action}`}
                            variant="ghost"
                            size="sm"
                            href="/dashboard/help"
                          >
                            {action.label}
                          </Button>
                        );
                      }

                      if (action.action === 'contact-support') {
                        return (
                          <Button
                            key={`${step.id}-${action.action}`}
                            variant="ghost"
                            size="sm"
                            href="/dashboard/help"
                          >
                            {action.label}
                          </Button>
                        );
                      }

                      return (
                        <span
                          key={`${step.id}-${action.action}`}
                          className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-white/50"
                        >
                          {action.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white/80">Finish first-run setup</p>
                  <p className="text-xs text-white/45 mt-1">
                    Complete this after required blocking steps are ready.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={
                    wizardActionBusy ||
                    wizardStatus.isComplete ||
                    !canCompleteWizard(wizardStatus)
                  }
                  onClick={completeWizard}
                >
                  {wizardActionBusy
                    ? 'Completing...'
                    : wizardStatus.isComplete
                    ? 'Setup Complete'
                    : 'Mark Setup Complete'}
                </Button>
              </div>

              {wizardNotice && (
                <p className="text-xs text-cyan mt-3">{wizardNotice}</p>
              )}
              {wizardError && (
                <p className="text-xs text-magenta mt-3">{wizardError}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-6 text-center">
            <p className="text-sm text-white/40">
              {checking ? 'Loading setup status...' : 'No wizard status available'}
            </p>
          </div>
        )}
      </GlassCard>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Advanced (collapsible)                                           */}
      {/* ------------------------------------------------------------------ */}
      <GlassCard className="overflow-hidden" hover={false}>
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-white/[0.02]"
        >
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Advanced Settings {'\u2699\uFE0F'}
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              For power users who want to customize their setup
            </p>
          </div>
          <motion.span
            className="text-white/30 text-xl"
            animate={{ rotate: advancedOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            {'\u25BE'}
          </motion.span>
        </button>

        <AnimatePresence>
          {advancedOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 space-y-6 border-t border-white/5 pt-5">
                {/* Model selector */}
                <div>
                  <label
                    htmlFor="model-select"
                    className="block text-sm font-medium text-white/70 mb-2"
                  >
                    AI Model
                  </label>
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/80 outline-none transition-colors focus:border-cyan/40 focus:ring-1 focus:ring-cyan/20 appearance-none cursor-pointer"
                  >
                    <option value="qwen3:32b" className="bg-[#0a0a0f]">
                      Qwen3 32B (recommended, free)
                    </option>
                    <option value="qwen3:8b" className="bg-[#0a0a0f]">
                      Qwen3 8B (lighter, faster)
                    </option>
                    <option value="llama3.1:8b" className="bg-[#0a0a0f]">
                      Llama 3.1 8B (Meta)
                    </option>
                    <option value="mistral:7b" className="bg-[#0a0a0f]">
                      Mistral 7B
                    </option>
                    <option value="gemma2:9b" className="bg-[#0a0a0f]">
                      Gemma 2 9B (Google)
                    </option>
                  </select>
                  <p className="text-xs text-white/30 mt-1.5">
                    Choose which AI model powers your KIN. Larger models are smarter
                    but need more RAM and disk space.
                  </p>
                </div>

                {/* API endpoint */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Local API Endpoint
                  </label>
                  <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-4 py-3">
                    <code className="flex-1 text-sm font-mono text-white/50 select-all">
                      http://localhost:11434
                    </code>
                    <CopyButton text="http://localhost:11434" />
                  </div>
                  <p className="text-xs text-white/30 mt-1.5">
                    This is where Ollama runs on your machine. You usually don&apos;t
                    need to change this.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ------------------------------------------------------------------ */}
      {/* Footer help link                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="text-center">
        <a
          href="/dashboard/help"
          className="text-xs text-white/30 hover:text-white/50 transition-colors"
        >
          Need help? Visit our FAQ or reach out to support@meetyourkin.com
        </a>
      </div>
    </motion.div>
  );
}
