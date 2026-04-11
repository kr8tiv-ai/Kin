import fs from 'node:fs/promises';
import { getWizardStatus } from './setup-wizard-status.js';

// --- Structured gate types ---

export interface Gate {
  id: string;
  label: string;
  ready: boolean;
  description: string;
  recoveryActions: string[];
}

export interface CompletionProgress {
  completedGates: number;
  totalGates: number;
  summary: string;
}

export interface CompletionStatus {
  // Structured gate results
  gates: Gate[];
  progress: CompletionProgress;

  // Backward-compatible flat fields
  installerReady: boolean;
  installerStatus: string;
  installerPhase: string;
  wizardComplete: boolean;
  wizardSteps: Array<{ id: string; status: string; blocking: boolean }>;
  cloudReady: boolean;
  cloudProvider: string | null;
  overallComplete: boolean;
  blockingReasons: string[];
  nextActions: string[];
}

// --- Internal gate evaluators ---

async function checkInstallerStatus(_userId: string, _db: any): Promise<{
  ready: boolean;
  status: string;
  phase: string;
}> {
  try {
    const stateFilePath = process.env.INSTALLER_STATE_DIR
      ? `${process.env.INSTALLER_STATE_DIR}/${_userId}.json`
      : null;

    if (!stateFilePath) {
      return { ready: true, status: 'not-required', phase: 'local-only' };
    }

    let raw: string;
    try {
      raw = await fs.readFile(stateFilePath, 'utf8');
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return { ready: true, status: 'not-started', phase: 'preflight' };
      }
      throw err;
    }

    const state = JSON.parse(raw);
    return {
      ready: state.status === 'complete',
      status: state.status ?? 'unknown',
      phase: state.currentPhase ?? 'unknown',
    };
  } catch {
    // Failure mode: graceful fallback — treat as ready when state is unreadable
    return { ready: true, status: 'unknown', phase: 'unknown' };
  }
}

function checkCloudStatus(userId: string, db: any): {
  ready: boolean;
  provider: string | null;
  applicable: boolean;
} {
  try {
    // Cloud is applicable when any project for this user has a deploy_provider set
    const projectWithProvider = db.prepare(`
      SELECT deploy_provider, status FROM projects
      WHERE user_id = ? AND deploy_provider IS NOT NULL
      LIMIT 1
    `).get(userId) as { deploy_provider: string; status: string } | undefined;

    if (!projectWithProvider) {
      // No cloud deployment configured — gate is not applicable
      return { ready: false, provider: null, applicable: false };
    }

    // Cloud is applicable; ready only if the project is deployed
    const isDeployed = projectWithProvider.status === 'deployed';
    return {
      ready: isDeployed,
      provider: projectWithProvider.deploy_provider,
      applicable: true,
    };
  } catch {
    // Failure mode: treat as not applicable on DB error
    return { ready: false, provider: null, applicable: false };
  }
}

// --- Gate builders ---

function buildInstallerGate(installer: { ready: boolean; status: string; phase: string }): Gate {
  if (installer.ready) {
    return {
      id: 'installer',
      label: 'Local Setup',
      ready: true,
      description: 'Your local setup is complete',
      recoveryActions: [],
    };
  }

  return {
    id: 'installer',
    label: 'Local Setup',
    ready: false,
    description: `Local setup needs attention — ${installer.phase}`,
    recoveryActions: ['retry', 'restart', 'contact-support'],
  };
}

function buildWizardGate(wizardComplete: boolean): Gate {
  if (wizardComplete) {
    return {
      id: 'wizard',
      label: 'Setup Wizard',
      ready: true,
      description: 'API keys and services are configured',
      recoveryActions: [],
    };
  }

  return {
    id: 'wizard',
    label: 'Setup Wizard',
    ready: false,
    description: 'Some required keys or services need configuration',
    recoveryActions: ['open-setup-wizard', 'retry', 'contact-support'],
  };
}

function buildCloudGate(cloud: { ready: boolean; provider: string | null; applicable: boolean }): Gate {
  if (!cloud.applicable) {
    return {
      id: 'cloud',
      label: 'Cloud Deployment',
      ready: true, // Not applicable counts as ready for gate math
      description: 'No cloud deployment configured (optional)',
      recoveryActions: [],
    };
  }

  if (cloud.ready) {
    return {
      id: 'cloud',
      label: 'Cloud Deployment',
      ready: true,
      description: 'Your cloud deployment is verified',
      recoveryActions: [],
    };
  }

  return {
    id: 'cloud',
    label: 'Cloud Deployment',
    ready: false,
    description: 'Cloud deployment not yet verified',
    recoveryActions: ['check-deploy-status', 'retry-deploy', 'contact-support'],
  };
}

// --- Main evaluator ---

export async function getCompletionStatus(userId: string, db: any): Promise<CompletionStatus> {
  const installer = await checkInstallerStatus(userId, db);
  const wizardStatus = getWizardStatus(userId, db);
  const cloud = checkCloudStatus(userId, db);

  // Build structured gates
  const installerGate = buildInstallerGate(installer);
  const wizardGate = buildWizardGate(wizardStatus.isComplete);
  const cloudGate = buildCloudGate(cloud);

  // Gates array: always 3 entries, cloud included even when not applicable
  const gates: Gate[] = [installerGate, wizardGate, cloudGate];

  // Corrected formula: cloud factors in when applicable
  const overallComplete =
    installer.ready &&
    wizardStatus.isComplete &&
    (cloud.applicable ? cloud.ready : true);

  // Progress: count only applicable gates
  const applicableGates = cloud.applicable
    ? [installerGate, wizardGate, cloudGate]
    : [installerGate, wizardGate];
  const totalGates = applicableGates.length;
  const completedGates = applicableGates.filter(g => g.ready).length;
  const summary = `${completedGates} of ${totalGates} setup gates complete`;

  // Legacy blocking reasons and next actions
  const blockingReasons: string[] = [];
  const nextActions: string[] = [];

  if (!installer.ready) {
    blockingReasons.push(`Installer ${installer.status}: ${installer.phase}`);
    nextActions.push('Complete installer setup');
  }

  if (!wizardStatus.isComplete) {
    const blockingWizardSteps = wizardStatus.steps.filter(s => s.blocking);
    for (const step of blockingWizardSteps) {
      blockingReasons.push(`${step.label}: ${step.reasonCode}`);
    }
    nextActions.push('Complete setup wizard');
  }

  if (cloud.applicable && !cloud.ready) {
    blockingReasons.push('Cloud deployment not yet verified');
    nextActions.push('Verify cloud deployment');
  } else if (!cloud.applicable) {
    nextActions.push('Deploy to cloud (optional)');
  }

  return {
    gates,
    progress: { completedGates, totalGates, summary },
    installerReady: installer.ready,
    installerStatus: installer.status,
    installerPhase: installer.phase,
    wizardComplete: wizardStatus.isComplete,
    wizardSteps: wizardStatus.steps.map(s => ({
      id: s.id,
      status: s.status,
      blocking: s.blocking,
    })),
    cloudReady: cloud.ready,
    cloudProvider: cloud.provider,
    overallComplete,
    blockingReasons,
    nextActions,
  };
}

export async function getCompletionEligibility(userId: string, db: any): Promise<{
  eligible: boolean;
  reason: string | null;
}> {
  const status = await getCompletionStatus(userId, db);

  if (status.overallComplete) {
    return { eligible: false, reason: 'Already complete' };
  }

  // Check each applicable gate for blocking reasons
  const blockingGate = status.gates.find(g => !g.ready);
  if (blockingGate) {
    return {
      eligible: false,
      reason: `${blockingGate.label} must be ready before completing`,
    };
  }

  return { eligible: true, reason: null };
}
