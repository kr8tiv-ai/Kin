import { getWizardStatus } from './setup-wizard-status.js';

export interface CompletionStatus {
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

function checkInstallerStatus(userId: string, db: any): {
  ready: boolean;
  status: string;
  phase: string;
} {
  try {
    const stateFilePath = process.env.INSTALLER_STATE_DIR 
      ? `${process.env.INSTALLER_STATE_DIR}/${userId}.json`
      : null;
    
    if (!stateFilePath) {
      return { ready: true, status: 'not-required', phase: 'local-only' };
    }
    
    const fs = require('fs');
    if (!fs.existsSync(stateFilePath)) {
      return { ready: true, status: 'not-started', phase: 'preflight' };
    }
    
    const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    return {
      ready: state.status === 'complete',
      status: state.status,
      phase: state.currentPhase,
    };
  } catch {
    return { ready: true, status: 'unknown', phase: 'unknown' };
  }
}

function checkCloudStatus(userId: string, db: any): {
  ready: boolean;
  provider: string | null;
} {
  try {
    const deployment = db.prepare(`
      SELECT deploy_provider FROM projects 
      WHERE user_id = ? AND status = 'deployed' 
      LIMIT 1
    `).get(userId) as any;

    if (deployment?.deploy_provider) {
      return { ready: true, provider: deployment.deploy_provider };
    }
    return { ready: false, provider: null };
  } catch {
    return { ready: false, provider: null };
  }
}

export function getCompletionStatus(userId: string, db: any): CompletionStatus {
  const installer = checkInstallerStatus(userId, db);
  const wizardStatus = getWizardStatus(userId, db);
  const cloud = checkCloudStatus(userId, db);

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

  if (!cloud.ready) {
    nextActions.push('Deploy to cloud (optional)');
  }

  const overallComplete = installer.ready && wizardStatus.isComplete;

  return {
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

export function getCompletionEligibility(userId: string, db: any): {
  eligible: boolean;
  reason: string | null;
} {
  const status = getCompletionStatus(userId, db);
  
  if (status.overallComplete) {
    return { eligible: false, reason: 'Already complete' };
  }

  if (!status.installerReady) {
    return { eligible: false, reason: 'Installer must complete first' };
  }

  if (!status.wizardComplete) {
    return { eligible: false, reason: 'Setup wizard must complete first' };
  }

  return { eligible: true, reason: null };
}
