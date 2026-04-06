import { describe, expect, it } from 'vitest';

import {
  canCompleteWizard,
  getBlockingSteps,
  getBlockingSummary,
  getNextActionLabels,
  isWizardComplete,
  stepStatusToBadgeColor,
  stepStatusToLabel,
  type WizardStatus,
} from '../web/src/lib/setup-wizard-ui.js';

function makeStatus(overrides?: Partial<WizardStatus>): WizardStatus {
  return {
    steps: [
      {
        id: 'keys',
        label: 'API Keys',
        message: 'Required keys are configured.',
        status: 'ready',
        blocking: false,
        reasonCode: null,
        nextActions: [],
      },
      {
        id: 'telegram',
        label: 'Telegram',
        message: 'Telegram is configured.',
        status: 'ready',
        blocking: false,
        reasonCode: null,
        nextActions: [],
      },
      {
        id: 'discord',
        label: 'Discord',
        message: 'Discord needs setup.',
        status: 'not-configured',
        blocking: false,
        reasonCode: 'DISCORD_NOT_CONFIGURED',
        nextActions: ['open provider'],
      },
      {
        id: 'whatsapp',
        label: 'WhatsApp',
        message: 'WhatsApp needs setup.',
        status: 'not-configured',
        blocking: false,
        reasonCode: 'WHATSAPP_AUTH_DIR_NOT_SET',
        nextActions: ['open provider'],
      },
    ],
    completion: {
      persisted: false,
      eligible: true,
      reason: null,
    },
    isComplete: false,
    ...overrides,
  };
}

describe('setup wizard UI helpers', () => {
  it('maps step status to badge color and labels', () => {
    expect(stepStatusToBadgeColor('ready')).toBe('cyan');
    expect(stepStatusToBadgeColor('needs-attention')).toBe('magenta');
    expect(stepStatusToBadgeColor('not-configured')).toBe('gold');

    expect(stepStatusToLabel('ready')).toBe('Ready');
    expect(stepStatusToLabel('needs-attention')).toBe('Needs Attention');
    expect(stepStatusToLabel('not-configured')).toBe('Not Configured');
  });

  it('returns blocking summary and steps for blocking state', () => {
    const status = makeStatus({
      steps: [
        {
          id: 'keys',
          label: 'API Keys',
          message: 'Missing required keys.',
          status: 'needs-attention',
          blocking: true,
          reasonCode: 'MISSING_REQUIRED_KEYS',
          nextActions: ['open provider', 'retry'],
        },
      ],
      completion: {
        persisted: false,
        eligible: false,
        reason: 'API Keys must be ready before completing setup',
      },
    });

    const blocking = getBlockingSteps(status);
    expect(blocking).toHaveLength(1);
    expect(blocking[0]?.id).toBe('keys');
    expect(getBlockingSummary(status)).toContain('API Keys');
  });

  it('returns complete summary when no blocking steps remain', () => {
    const status = makeStatus();
    expect(getBlockingSteps(status)).toHaveLength(0);
    expect(getBlockingSummary(status)).toContain('All blocking setup steps are ready');
  });

  it('maps next action tokens to plain-language CTA labels', () => {
    const actions = getNextActionLabels(['retry', 'open provider', 'contact support', 'custom action']);

    expect(actions).toEqual([
      { label: 'Retry', action: 'retry' },
      { label: 'Open Provider', action: 'open-provider' },
      { label: 'Contact Support', action: 'contact-support' },
      { label: 'custom action', action: 'custom action' },
    ]);
  });

  it('uses completion eligibility when deciding completion affordance', () => {
    const eligibleStatus = makeStatus({
      completion: { persisted: false, eligible: true, reason: null },
    });
    const blockedStatus = makeStatus({
      completion: {
        persisted: false,
        eligible: false,
        reason: 'API Keys must be ready before completing setup',
      },
    });

    expect(canCompleteWizard(eligibleStatus)).toBe(true);
    expect(canCompleteWizard(blockedStatus)).toBe(false);
  });

  // --- Negative Tests (Q7) ---

  it('handles unknown status enum with safe fallback badge and label', () => {
    // Simulate malformed API response with unknown status value
    const unknownStatus = 'something-unexpected' as WizardStatus['steps'][0]['status'];
    expect(stepStatusToBadgeColor(unknownStatus)).toBe('muted');
    expect(stepStatusToLabel(unknownStatus)).toBe('Unknown');
  });

  it('falls back to blocking-step check when completion field is absent', () => {
    // No completion field — falls back to getBlockingSteps check
    const noCompletion = makeStatus({ completion: undefined });
    // Default makeStatus has no blocking steps → should be completable
    expect(canCompleteWizard(noCompletion)).toBe(true);

    // Now with a blocking step and no completion field
    const withBlocking = makeStatus({
      completion: undefined,
      steps: [
        {
          id: 'keys',
          label: 'API Keys',
          message: 'Missing keys.',
          status: 'needs-attention',
          blocking: true,
          reasonCode: 'MISSING_REQUIRED_KEYS',
          nextActions: ['retry'],
        },
      ],
    });
    expect(canCompleteWizard(withBlocking)).toBe(false);
  });

  // --- Boundary Conditions (Q7) ---

  it('boundary: all-ready state returns empty blocking summary', () => {
    const allReady = makeStatus({
      steps: [
        { id: 'keys', label: 'API Keys', message: 'OK', status: 'ready', blocking: false, reasonCode: null, nextActions: [] },
        { id: 'telegram', label: 'Telegram', message: 'OK', status: 'ready', blocking: false, reasonCode: null, nextActions: [] },
        { id: 'discord', label: 'Discord', message: 'OK', status: 'ready', blocking: false, reasonCode: null, nextActions: [] },
        { id: 'whatsapp', label: 'WhatsApp', message: 'OK', status: 'ready', blocking: false, reasonCode: null, nextActions: [] },
      ],
      completion: { persisted: false, eligible: true, reason: null },
    });
    expect(getBlockingSteps(allReady)).toHaveLength(0);
    expect(getBlockingSummary(allReady)).toContain('All blocking setup steps are ready');
    expect(canCompleteWizard(allReady)).toBe(true);
  });

  it('boundary: fully-unconfigured state reports multiple blocking steps', () => {
    const allBlocked = makeStatus({
      steps: [
        { id: 'keys', label: 'API Keys', message: 'Not set', status: 'not-configured', blocking: true, reasonCode: 'MISSING', nextActions: ['open provider'] },
        { id: 'telegram', label: 'Telegram', message: 'Not set', status: 'not-configured', blocking: true, reasonCode: 'MISSING', nextActions: ['open provider'] },
        { id: 'discord', label: 'Discord', message: 'Not set', status: 'not-configured', blocking: true, reasonCode: 'MISSING', nextActions: ['open provider'] },
        { id: 'whatsapp', label: 'WhatsApp', message: 'Not set', status: 'not-configured', blocking: true, reasonCode: 'MISSING', nextActions: ['open provider'] },
      ],
      completion: { persisted: false, eligible: false, reason: 'All steps must be ready' },
    });
    expect(getBlockingSteps(allBlocked)).toHaveLength(4);
    expect(getBlockingSummary(allBlocked)).toContain('4 setup steps must be fixed');
    expect(canCompleteWizard(allBlocked)).toBe(false);
  });

  it('boundary: single-blocking state names the blocking step', () => {
    const singleBlocked = makeStatus({
      steps: [
        { id: 'keys', label: 'API Keys', message: 'OK', status: 'ready', blocking: false, reasonCode: null, nextActions: [] },
        { id: 'telegram', label: 'Telegram', message: 'Missing token', status: 'needs-attention', blocking: true, reasonCode: 'TELEGRAM_TOKEN_MISSING', nextActions: ['retry', 'contact support'] },
        { id: 'discord', label: 'Discord', message: 'OK', status: 'ready', blocking: false, reasonCode: null, nextActions: [] },
        { id: 'whatsapp', label: 'WhatsApp', message: 'OK', status: 'ready', blocking: false, reasonCode: null, nextActions: [] },
      ],
      completion: { persisted: false, eligible: false, reason: 'Telegram must be ready' },
    });
    expect(getBlockingSteps(singleBlocked)).toHaveLength(1);
    expect(getBlockingSummary(singleBlocked)).toContain('Telegram');
    expect(canCompleteWizard(singleBlocked)).toBe(false);
  });

  it('handles empty nextActions array without errors', () => {
    const actions = getNextActionLabels([]);
    expect(actions).toEqual([]);
  });

  it('isWizardComplete reflects the isComplete field', () => {
    const complete = makeStatus({ isComplete: true });
    const incomplete = makeStatus({ isComplete: false });
    expect(isWizardComplete(complete)).toBe(true);
    expect(isWizardComplete(incomplete)).toBe(false);
  });
});
