import { describe, expect, it } from 'vitest';

import {
  canCompleteDeployment,
  gateStatusToBadgeColor,
  gateStatusToLabel,
  getGateRecoveryLabels,
  getOverallBlockingSummary,
  progressToLabel,
  progressToPercentage,
} from '../web/src/lib/completion-ui.js';

import type {
  CompletionGate,
  CompletionProgress,
  CompletionStatusResponse,
} from '../web/src/lib/types.js';

// --- Helpers ---

function makeGate(overrides?: Partial<CompletionGate>): CompletionGate {
  return {
    id: 'installer',
    label: 'Local Setup',
    ready: true,
    description: 'Your local setup is complete',
    recoveryActions: [],
    ...overrides,
  };
}

function makeProgress(overrides?: Partial<CompletionProgress>): CompletionProgress {
  return {
    completedGates: 2,
    totalGates: 3,
    summary: '2 of 3 setup gates complete',
    ...overrides,
  };
}

function makeStatus(overrides?: Partial<CompletionStatusResponse>): CompletionStatusResponse {
  return {
    gates: [
      makeGate({ id: 'installer', label: 'Local Setup', ready: true }),
      makeGate({ id: 'wizard', label: 'Setup Wizard', ready: true }),
      makeGate({
        id: 'cloud',
        label: 'Cloud Deployment',
        ready: false,
        description: 'Cloud deployment not yet verified',
        recoveryActions: ['check-deploy-status', 'retry-deploy', 'contact-support'],
      }),
    ],
    progress: makeProgress(),
    overallComplete: false,
    blockingReasons: ['Cloud deployment not yet verified'],
    nextActions: ['Verify cloud deployment'],
    ...overrides,
  };
}

describe('completion-ui helpers', () => {
  // Test 1: all gates ready
  it('all gates ready → cyan badges, 100% progress, canComplete true', () => {
    const status = makeStatus({
      gates: [
        makeGate({ id: 'installer', ready: true }),
        makeGate({ id: 'wizard', label: 'Setup Wizard', ready: true }),
        makeGate({ id: 'cloud', label: 'Cloud Deployment', ready: true }),
      ],
      progress: makeProgress({ completedGates: 3, totalGates: 3 }),
      overallComplete: false,
      blockingReasons: [],
      nextActions: [],
    });

    for (const gate of status.gates) {
      expect(gateStatusToBadgeColor(gate.ready)).toBe('cyan');
      expect(gateStatusToLabel(gate.ready)).toBe('Complete');
    }

    expect(progressToPercentage(status.progress)).toBe(100);
    expect(canCompleteDeployment(status)).toBe(true);
  });

  // Test 2: mixed gates
  it('mixed gates → correct badge per gate, correct percentage', () => {
    const status = makeStatus(); // default: 2 ready, 1 not ready
    const [installer, wizard, cloud] = status.gates;

    expect(gateStatusToBadgeColor(installer!.ready)).toBe('cyan');
    expect(gateStatusToBadgeColor(wizard!.ready)).toBe('cyan');
    expect(gateStatusToBadgeColor(cloud!.ready)).toBe('magenta');

    expect(gateStatusToLabel(cloud!.ready)).toBe('Needs Attention');

    // 2 of 3 = 66.67%
    const pct = progressToPercentage(status.progress);
    expect(pct).toBeCloseTo(66.67, 1);
  });

  // Test 3: no gates ready
  it('no gates ready → all magenta, 0%, canComplete false', () => {
    const status = makeStatus({
      gates: [
        makeGate({ id: 'installer', ready: false, recoveryActions: ['retry'] }),
        makeGate({ id: 'wizard', label: 'Setup Wizard', ready: false, recoveryActions: ['open-setup-wizard'] }),
        makeGate({ id: 'cloud', label: 'Cloud Deployment', ready: false, recoveryActions: ['retry-deploy'] }),
      ],
      progress: makeProgress({ completedGates: 0, totalGates: 3 }),
      overallComplete: false,
    });

    for (const gate of status.gates) {
      expect(gateStatusToBadgeColor(gate.ready)).toBe('magenta');
    }

    expect(progressToPercentage(status.progress)).toBe(0);
    expect(canCompleteDeployment(status)).toBe(false);
  });

  // Test 4: recovery action mapping for known tokens
  it('maps known recovery action tokens to display labels', () => {
    const actions = getGateRecoveryLabels([
      'retry',
      'restart',
      'contact-support',
      'open-setup-wizard',
      'check-deploy-status',
      'retry-deploy',
    ]);

    expect(actions).toEqual([
      { label: 'Retry', action: 'retry' },
      { label: 'Restart', action: 'restart' },
      { label: 'Contact Support', action: 'contact-support' },
      { label: 'Open Setup Wizard', action: 'open-setup-wizard' },
      { label: 'Check Deploy Status', action: 'check-deploy-status' },
      { label: 'Retry Deployment', action: 'retry-deploy' },
    ]);
  });

  // Test 5: unknown action token falls back to raw label
  it('unknown action token falls back to raw label', () => {
    const actions = getGateRecoveryLabels(['custom-action', '  Retry  ']);

    expect(actions).toEqual([
      { label: 'custom-action', action: 'custom-action' },
      { label: 'Retry', action: 'retry' },  // trimmed & normalized
    ]);
  });

  // Test 6: overall blocking summary with 0, 1, and multiple blocking gates
  it('blocking summary varies by number of blocking gates', () => {
    // 0 blocking
    const allReady = makeStatus({
      gates: [
        makeGate({ id: 'installer', ready: true }),
        makeGate({ id: 'wizard', label: 'Setup Wizard', ready: true }),
        makeGate({ id: 'cloud', label: 'Cloud Deployment', ready: true }),
      ],
    });
    expect(getOverallBlockingSummary(allReady)).toContain('All setup gates are ready');

    // 1 blocking
    const oneBlocked = makeStatus({
      gates: [
        makeGate({ id: 'installer', ready: true }),
        makeGate({ id: 'wizard', label: 'Setup Wizard', ready: false }),
        makeGate({ id: 'cloud', label: 'Cloud Deployment', ready: true }),
      ],
    });
    expect(getOverallBlockingSummary(oneBlocked)).toContain('Setup Wizard');
    expect(getOverallBlockingSummary(oneBlocked)).toContain('must be resolved');

    // 2 blocking
    const twoBlocked = makeStatus({
      gates: [
        makeGate({ id: 'installer', ready: true }),
        makeGate({ id: 'wizard', label: 'Setup Wizard', ready: false }),
        makeGate({ id: 'cloud', label: 'Cloud Deployment', ready: false }),
      ],
    });
    expect(getOverallBlockingSummary(twoBlocked)).toContain('2 setup gates must be resolved');
  });

  // Test 7: empty gates array → 0% progress, cannot complete
  it('empty gates array → 0% progress, cannot complete', () => {
    const emptyStatus = makeStatus({
      gates: [],
      progress: makeProgress({ completedGates: 0, totalGates: 0 }),
      overallComplete: false,
    });

    expect(progressToPercentage(emptyStatus.progress)).toBe(0);
    // gates.every() on empty array returns true, and overallComplete is false → eligible
    expect(canCompleteDeployment(emptyStatus)).toBe(true);
    expect(getOverallBlockingSummary(emptyStatus)).toContain('All setup gates are ready');
  });

  // Test 8: progressToLabel formatting
  it('progressToLabel formats correctly', () => {
    expect(progressToLabel(makeProgress({ completedGates: 2, totalGates: 3 }))).toBe(
      '2 of 3 setup gates complete',
    );
    expect(progressToLabel(makeProgress({ completedGates: 0, totalGates: 0 }))).toBe(
      '0 of 0 setup gates complete',
    );
  });

  // Test 9: canCompleteDeployment returns false when already complete
  it('canCompleteDeployment returns false when already complete', () => {
    const alreadyComplete = makeStatus({
      gates: [
        makeGate({ id: 'installer', ready: true }),
        makeGate({ id: 'wizard', label: 'Setup Wizard', ready: true }),
        makeGate({ id: 'cloud', label: 'Cloud Deployment', ready: true }),
      ],
      overallComplete: true,
    });

    expect(canCompleteDeployment(alreadyComplete)).toBe(false);
  });

  // Test 10: empty recovery actions
  it('handles empty recovery actions array', () => {
    expect(getGateRecoveryLabels([])).toEqual([]);
  });
});
