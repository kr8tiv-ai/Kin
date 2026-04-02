import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

import {
  parseArgs,
  renderDryRunPlan,
  runDeployEasy,
} from '../scripts/deploy-easy.js';

describe('deploy-easy CLI', () => {
  let tempDir: string;
  let stateFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'deploy-easy-test-'));
    stateFile = path.join(tempDir, 'state.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses flags predictably', () => {
    const parsed = parseArgs([
      '--dry-run',
      '--restart',
      '--approve-external',
      '--json',
    ]);

    expect(parsed).toEqual({
      dryRun: true,
      resume: false,
      retry: false,
      restart: true,
      approveExternal: true,
      json: true,
    });
  });

  it('renders deterministic dry-run phase order', () => {
    const plan = renderDryRunPlan();

    expect(plan).toContain('preflight');
    expect(plan).toContain('dependencies');
    expect(plan).toContain('environment');
    expect(plan).toContain('services');
    expect(plan).toContain('verification');

    expect(plan.indexOf('preflight')).toBeLessThan(plan.indexOf('dependencies'));
    expect(plan.indexOf('dependencies')).toBeLessThan(plan.indexOf('environment'));
    expect(plan.indexOf('environment')).toBeLessThan(plan.indexOf('services'));
    expect(plan.indexOf('services')).toBeLessThan(plan.indexOf('verification'));
  });

  it('dry-run does not persist installer state', async () => {
    const output: string[] = [];

    const result = await runDeployEasy(
      { dryRun: true, resume: false, retry: false, restart: false, json: false },
      {
        stateFile,
        log: (line) => output.push(line),
      },
    );

    expect(result.status).toBe('dry-run');
    expect(existsSync(stateFile)).toBe(false);
    expect(output.join('\n')).toContain('Dry run');
  });

  it('runs installer engine and reaches completion in default mode', async () => {
    const result = await runDeployEasy(
      {
        dryRun: false,
        resume: false,
        retry: false,
        restart: false,
        json: false,
      },
      { stateFile },
    );

    expect(result.status).toBe('complete');
    expect(existsSync(stateFile)).toBe(true);
  });
});
