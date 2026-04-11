'use client';

// ============================================================================
// KIN Setup & Configuration — Cloud-hosted setup hub.
// Completion progress, setup wizard status, and support links.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { kinApi } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { CompletionStatusResponse, User } from '@/lib/types';
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

export default function SetupPage() {
  const { token, login } = useAuth();
  const [wizardStatus, setWizardStatus] = useState<WizardStatus | null>(null);
  const [completionStatus, setCompletionStatus] =
    useState<CompletionStatusResponse | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [wizardActionBusy, setWizardActionBusy] = useState(false);
  const [wizardNotice, setWizardNotice] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [completionActionBusy, setCompletionActionBusy] = useState(false);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [completionActionError, setCompletionActionError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const [wizardData, completionData] = await Promise.all([
        kinApi.get<WizardStatus>('/setup-wizard/status'),
        kinApi.get<CompletionStatusResponse>('/completion/status'),
      ]);
      setWizardStatus(wizardData);
      setCompletionStatus(completionData);
      setCompletionError(null);
    } catch {
      setWizardStatus(null);
      setCompletionStatus(null);
      setCompletionError('Failed to load setup status');
    } finally {
      setChecking(false);
    }
  }, []);

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
      const response = await kinApi.post<{ success: boolean; isComplete: boolean }>(
        '/setup-wizard/complete',
        { confirmed: true },
      );
      if (!response.success || !response.isComplete) {
        setWizardError('Setup completion was not accepted. Please retry.');
      } else {
        setWizardNotice('Setup marked complete. You can continue in the dashboard.');
      }
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Failed to complete setup');
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
      const response = await kinApi.post<{ success: boolean; error?: string }>(
        '/completion/complete',
      );
      if (!response.success) {
        setCompletionActionError(response.error ?? 'Completion was not accepted. Please retry.');
      } else {
        setCompletionNotice('Setup complete! Your KIN is fully configured.');
        try {
          const verifyResponse = await kinApi.get<{ user: User; valid: boolean }>('/auth/verify');
          if (verifyResponse.valid && verifyResponse.user && token) {
            login(token, verifyResponse.user);
          }
        } catch {
          // Auth refresh is best-effort
        }
      }
    } catch (error) {
      setCompletionActionError(
        error instanceof Error ? error.message : 'Failed to complete setup',
      );
    } finally {
      setCompletionActionBusy(false);
      await checkStatus();
    }
  }, [checkStatus, completionStatus, token, login]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return (
    <motion.div
      className="max-w-3xl mx-auto space-y-8 pb-12"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Setup Your KIN
        </h1>
        <p className="mt-2 text-white/50 max-w-lg">
          Track your setup progress and make sure everything is connected.
        </p>
      </div>

      {/* Completion Progress */}
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
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={checkStatus}
                disabled={checking}
              >
                Retry
              </Button>
            </div>
          ) : completionStatus ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-white/70">{completionStatus.progress.summary}</p>
                <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full w-full rounded-full bg-gradient-to-r from-cyan to-cyan/70 origin-left"
                    initial={{ scaleX: 0 }}
                    animate={{
                      scaleX: progressToPercentage(completionStatus.progress) / 100,
                    }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {completionStatus.gates.map((gate) => (
                  <div
                    key={gate.id}
                    className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4"
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
                        {getGateRecoveryLabels(gate.recoveryActions).map((recovery) => (
                          <Button
                            key={`${gate.id}-${recovery.action}`}
                            variant={
                              recovery.action === 'contact-support' ? 'ghost' : 'outline'
                            }
                            size="sm"
                            onClick={
                              recovery.action === 'contact-support'
                                ? undefined
                                : checkStatus
                            }
                            href={
                              recovery.action === 'contact-support'
                                ? '/dashboard/help'
                                : undefined
                            }
                            disabled={checking}
                          >
                            {recovery.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

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
                        ? 'Setup Complete'
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

      {/* Setup Wizard Status */}
      <div id="setup-wizard-section">
        <GlassCard className="p-6" hover={false}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 className="font-display text-lg font-semibold text-white">
              Setup Wizard
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
                  <p className="text-xs text-gold/80 mt-2">
                    {wizardStatus.completion.reason}
                  </p>
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
                      {getNextActionLabels(step.nextActions).map((action) => (
                        <Button
                          key={`${step.id}-${action.action}`}
                          variant={
                            action.action === 'contact-support' ||
                            action.action === 'open-provider'
                              ? 'ghost'
                              : 'outline'
                          }
                          size="sm"
                          onClick={action.action === 'retry' ? checkStatus : undefined}
                          href={
                            action.action === 'contact-support' ||
                            action.action === 'open-provider'
                              ? '/dashboard/help'
                              : undefined
                          }
                          disabled={checking || wizardActionBusy}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white/80">
                      Finish first-run setup
                    </p>
                    <p className="text-xs text-white/45 mt-1">
                      Complete this after required steps are ready.
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

      {/* Footer help link */}
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
