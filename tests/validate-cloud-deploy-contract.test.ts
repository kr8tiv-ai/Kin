import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validatorPath = path.join(repoRoot, 'scripts', 'validate-cloud-deploy-contract.cjs');

const requiredFixtureFiles = [
  'scripts/cloud-deploy-contract.ts',
  'scripts/ghcr-contract.ts',
  'railway.toml',
  'render.yaml',
  'fly.toml',
  'docker-compose.coolify.yml',
  'README.md',
  'docs/deploy/railway.md',
  'docs/deploy/render.md',
  'docs/deploy/fly.md',
  'docs/deploy/coolify.md',
];

const tempRoots: string[] = [];

function createFixture(mutator?: (root: string) => void): string {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-deploy-contract-'));
  tempRoots.push(tempRoot);

  for (const relativePath of requiredFixtureFiles) {
    const sourcePath = path.join(repoRoot, relativePath);
    const destinationPath = path.join(tempRoot, relativePath);

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
  }

  mutator?.(tempRoot);
  return tempRoot;
}

function runValidator(rootDir: string) {
  return spawnSync(process.execPath, [validatorPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      KIN_DEPLOY_CONTRACT_ROOT: rootDir,
    },
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('validate-cloud-deploy-contract', () => {
  it('passes for a valid deploy contract baseline', () => {
    const fixtureRoot = createFixture();
    const result = runValidator(fixtureRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Cloud deploy contract validation passed');
  });

  it('fails with provider-scoped output when a manifest file is missing', () => {
    const fixtureRoot = createFixture((root) => {
      fs.rmSync(path.join(root, 'render.yaml'));
    });

    const result = runValidator(fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[render] render.yaml missing provider manifest file.');
  });

  it('fails on malformed image refs and legacy health path drift', () => {
    const fixtureRoot = createFixture((root) => {
      const flyPath = path.join(root, 'fly.toml');
      const flyContent = fs
        .readFileSync(flyPath, 'utf8')
        .replace('ghcr.io/kr8tiv-ai/kin-api:latest', 'docker.io/library/kin-api:latest')
        .replace('path = "/health"', 'path = "/health/live"');

      fs.writeFileSync(flyPath, flyContent, 'utf8');
    });

    const result = runValidator(fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[fly] fly.toml references legacy health path '/health/live' (expected '/health').",
    );
    expect(result.stderr).toContain(
      "[fly] fly.toml image contract drift for service 'api': expected ghcr.io/<owner>/kin-api:<tag>.",
    );
  });

  it('fails when README one-click section is absent', () => {
    const fixtureRoot = createFixture((root) => {
      const readmePath = path.join(root, 'README.md');
      const readmeContent = fs
        .readFileSync(readmePath, 'utf8')
        .replace('### One-Click Cloud Deploy Paths', '### Cloud Deploy Paths');

      fs.writeFileSync(readmePath, readmeContent, 'utf8');
    });

    const result = runValidator(fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[docs] README.md missing 'One-Click Cloud Deploy Paths' section.",
    );
  });

  it('fails when a provider one-click README link is missing', () => {
    const fixtureRoot = createFixture((root) => {
      const readmePath = path.join(root, 'README.md');
      const readmeContent = fs
        .readFileSync(readmePath, 'utf8')
        .replace(
          '- **Coolify** — one-click via `docker-compose.coolify.yml`; guide: [`docs/deploy/coolify.md`](docs/deploy/coolify.md)',
          '- **Coolify** — deploy contract pending',
        );

      fs.writeFileSync(readmePath, readmeContent, 'utf8');
    });

    const result = runValidator(fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[docs] README.md one-click reference missing for provider 'coolify'",
    );
  });

  it('fails when README omits a link to an existing provider deploy doc', () => {
    const fixtureRoot = createFixture((root) => {
      const readmePath = path.join(root, 'README.md');
      const readmeContent = fs
        .readFileSync(readmePath, 'utf8')
        .replace(
          '[`docs/deploy/fly.md`](docs/deploy/fly.md)',
          '[`docs/deploy/fly-guide.md`](docs/deploy/fly-guide.md)',
        );

      fs.writeFileSync(readmePath, readmeContent, 'utf8');
    });

    const result = runValidator(fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[docs] README.md missing link to existing provider doc 'docs/deploy/fly.md'.",
    );
  });

  it('accepts alternate GHCR owner and sha-tag overrides', () => {
    const fixtureRoot = createFixture((root) => {
      const renderPath = path.join(root, 'render.yaml');
      const renderContent = fs
        .readFileSync(renderPath, 'utf8')
        .replace('ghcr.io/kr8tiv-ai/kin-api:latest', 'ghcr.io/acme-ai/kin-api:sha-deadbee')
        .replace('ghcr.io/kr8tiv-ai/kin-web:latest', 'ghcr.io/acme-ai/kin-web:sha-deadbee')
        .replace(
          'ghcr.io/kr8tiv-ai/kin-inference:latest',
          'ghcr.io/acme-ai/kin-inference:sha-deadbee',
        );

      fs.writeFileSync(renderPath, renderContent, 'utf8');
    });

    const result = runValidator(fixtureRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Cloud deploy contract validation passed');
  });
});
