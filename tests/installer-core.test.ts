import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

import { InstallerEngine } from '../scripts/installer/core.js';
import { InstallerStateStore } from '../scripts/installer/state-store.js';
import { evaluateInstallerAction } from '../scripts/installer/policy.js';
import { INSTALLER_PHASE_ORDER } from '../scripts/installer/types.js';

describe('InstallerEngine', () => {
  let tempDir: string;
  let stateFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'installer-core-test-'));
    stateFile = path.join(tempDir, 'state.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('runs phases in deterministic order and persists completion state', async () => {
    const store = new InstallerStateStore(stateFile);
    const engine = new InstallerEngine({ stateStore: store });

    const finalState = await engine.execute();

    expect(finalState.status).toBe('complete');
    expect(finalState.currentPhase).toBe('complete');
    expect(finalState.phaseHistory.map((entry) => entry.phase)).toEqual(
      INSTALLER_PHASE_ORDER,
    );

    const persisted = await store.load();
    expect(persisted.status).toBe('complete');
    expect(persisted.currentPhase).toBe('complete');
  });

  it('enforces retry budget and records lastError on repeated phase failure', async () => {
    const store = new InstallerStateStore(stateFile);
    let attempts = 0;

    const engine = new InstallerEngine({
      stateStore: store,
      maxRetries: 2,
      phaseHandlers: {
        dependencies: async () => {
          attempts += 1;
          return { ok: false, error: 'npm install failed: network down' };
        },
      },
    });

    const failedState = await engine.execute();

    expect(failedState.status).toBe('failed');
    expect(failedState.currentPhase).toBe('dependencies');
    expect(failedState.lastError).toContain('npm install failed');
    expect(attempts).toBe(3); // initial try + 2 retries
  });

  it('pauses on external boundary until explicit approval and then continues', async () => {
    const store = new InstallerStateStore(stateFile);
    let boundaryShown = false;

    const engine = new InstallerEngine({
      stateStore: store,
      phaseHandlers: {
        dependencies: async () => {
          if (!boundaryShown) {
            boundaryShown = true;
            return {
              ok: false,
              boundary: {
                id: 'create-railway-project',
                description: 'Create Railway project',
                scope: 'external',
                risk: 'account',
              },
            };
          }

          return { ok: true };
        },
      },
    });

    const pausedState = await engine.execute();
    expect(pausedState.status).toBe('waiting-confirmation');
    expect(pausedState.pendingAction?.id).toBe('create-railway-project');

    const resumedState = await engine.confirmExternalAction(true);
    expect(resumedState.status).toBe('running');

    const finalState = await engine.execute();
    expect(finalState.status).toBe('complete');
  });
});

describe('evaluateInstallerAction', () => {
  it('auto-fixes safe local actions', () => {
    const decision = evaluateInstallerAction({
      id: 'mkdir-data-dir',
      description: 'Create data directory',
      scope: 'local',
      risk: 'safe',
    });

    expect(decision.decision).toBe('auto-fix');
  });

  it('requires explicit confirmation for external actions', () => {
    const decision = evaluateInstallerAction({
      id: 'create-cloud-project',
      description: 'Create cloud project',
      scope: 'external',
      risk: 'account',
    });

    expect(decision.decision).toBe('requires-confirmation');
  });
});
