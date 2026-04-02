import crypto from 'crypto';

export type InstallerPhase =
  | 'preflight'
  | 'dependencies'
  | 'environment'
  | 'services'
  | 'verification'
  | 'complete';

export const INSTALLER_PHASE_ORDER: InstallerPhase[] = [
  'preflight',
  'dependencies',
  'environment',
  'services',
  'verification',
  'complete',
];

export type InstallerStatus =
  | 'idle'
  | 'running'
  | 'waiting-confirmation'
  | 'failed'
  | 'complete';

export type InstallerActionScope = 'local' | 'external';
export type InstallerActionRisk = 'safe' | 'destructive' | 'account';

export interface InstallerAction {
  id: string;
  description: string;
  scope: InstallerActionScope;
  risk: InstallerActionRisk;
}

export interface InstallerPhaseHistoryEntry {
  phase: InstallerPhase;
  result: 'ok' | 'failed' | 'blocked';
  timestamp: number;
  error?: string;
}

export interface InstallerRunState {
  runId: string;
  status: InstallerStatus;
  currentPhase: InstallerPhase;
  phaseHistory: InstallerPhaseHistoryEntry[];
  retryCount: number;
  maxRetries: number;
  startedAt: number;
  updatedAt: number;
  lastError?: string;
  pendingAction?: InstallerAction;
  blockedPhase?: InstallerPhase;
}

export interface PhaseResult {
  ok: boolean;
  error?: string;
  boundary?: InstallerAction;
}

export type PhaseHandler = (state: InstallerRunState) => Promise<PhaseResult>;

interface CreateInitialStateOptions {
  now?: () => number;
  maxRetries?: number;
  runId?: string;
}

export function createInitialInstallerState(
  options: CreateInitialStateOptions = {},
): InstallerRunState {
  const now = options.now?.() ?? Date.now();

  return {
    runId: options.runId ?? `run-${crypto.randomUUID()}`,
    status: 'idle',
    currentPhase: 'preflight',
    phaseHistory: [],
    retryCount: 0,
    maxRetries: options.maxRetries ?? 2,
    startedAt: now,
    updatedAt: now,
  };
}

export function getNextPhase(phase: InstallerPhase): InstallerPhase | undefined {
  const index = INSTALLER_PHASE_ORDER.indexOf(phase);
  if (index < 0) return undefined;

  return INSTALLER_PHASE_ORDER[index + 1];
}
