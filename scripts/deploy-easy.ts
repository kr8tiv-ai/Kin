#!/usr/bin/env tsx

import { InstallerEngine } from './installer/core.js';
import { InstallerStateStore } from './installer/state-store.js';
import {
  INSTALLER_PHASE_ORDER,
  type InstallerRunState,
} from './installer/types.js';

export interface DeployEasyArgs {
  dryRun: boolean;
  resume: boolean;
  retry: boolean;
  restart: boolean;
  approveExternal?: boolean;
  json: boolean;
}

interface RunDeployEasyDeps {
  stateFile?: string;
  log?: (line: string) => void;
}

export type DeployEasyResult =
  | { status: 'dry-run'; plan: string }
  | { status: InstallerRunState['status']; state: InstallerRunState };

export function parseArgs(argv: string[]): DeployEasyArgs {
  const args: DeployEasyArgs = {
    dryRun: false,
    resume: false,
    retry: false,
    restart: false,
    json: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--resume':
        args.resume = true;
        break;
      case '--retry':
        args.retry = true;
        break;
      case '--restart':
        args.restart = true;
        break;
      case '--approve-external':
        args.approveExternal = true;
        break;
      case '--reject-external':
        args.approveExternal = false;
        break;
      case '--json':
        args.json = true;
        break;
      default:
        break;
    }
  }

  return args;
}

export function renderDryRunPlan(): string {
  const phases = INSTALLER_PHASE_ORDER.filter((phase) => phase !== 'complete');
  const numbered = phases.map((phase, index) => `${index + 1}. ${phase}`);

  return [
    'Dry run: installer will execute phases in this order:',
    ...numbered,
    '',
    'No files or external resources were changed.',
  ].join('\n');
}

export async function runDeployEasy(
  args: DeployEasyArgs,
  deps: RunDeployEasyDeps = {},
): Promise<DeployEasyResult> {
  const log = deps.log ?? console.log;

  if (args.dryRun) {
    const plan = renderDryRunPlan();
    log(plan);
    return { status: 'dry-run', plan };
  }

  const stateStore = new InstallerStateStore(deps.stateFile);

  if (args.restart) {
    await stateStore.reset();
    log('Installer state reset. Starting from the first phase.');
  }

  const engine = new InstallerEngine({ stateStore });

  if (typeof args.approveExternal === 'boolean') {
    const confirmationState = await engine.confirmExternalAction(args.approveExternal);

    if (args.json) {
      log(JSON.stringify(confirmationState, null, 2));
    } else if (args.approveExternal) {
      log('External action approved. Continuing installer flow.');
    } else {
      log('External action rejected. Installer marked failed.');
      return { status: confirmationState.status, state: confirmationState };
    }
  }

  const state = await engine.execute();

  if (args.json) {
    log(JSON.stringify(state, null, 2));
    return { status: state.status, state };
  }

  if (state.status === 'complete') {
    log('Setup complete. All installer phases passed.');
  } else if (state.status === 'waiting-confirmation') {
    log(
      `Waiting for confirmation: ${state.pendingAction?.description ?? 'External action required'}. ` +
        'Re-run with --approve-external or --reject-external.',
    );
  } else if (state.status === 'failed') {
    log(`Setup failed: ${state.lastError ?? 'Unknown installer error'}`);
  } else {
    log(`Installer status: ${state.status}`);
  }

  return { status: state.status, state };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await runDeployEasy(args);
}

const isDirectExecution =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('deploy-easy.ts') === true;

if (isDirectExecution) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[deploy-easy] ERROR: ${message}`);
    process.exit(1);
  });
}
