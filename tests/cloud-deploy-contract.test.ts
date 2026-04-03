import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  CLOUD_DEPLOY_PROVIDERS,
  CANONICAL_CLOUD_HEALTH_PATH,
  DEFAULT_RUNTIME_PORTS,
  LEGACY_CLOUD_HEALTH_PATH,
  assertGhcrContractExports,
  assertNoLegacyHealthPath,
  buildCloudDeployImageRefs,
  validateCanonicalHealthPath,
} from '../scripts/cloud-deploy-contract.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('cloud deploy contract', () => {
  it('covers Railway, Render, Fly.io, and Coolify with deterministic provider IDs', () => {
    expect(CLOUD_DEPLOY_PROVIDERS.map((provider) => provider.id)).toEqual([
      'railway',
      'render',
      'fly',
      'coolify',
    ]);
  });

  it('exposes canonical runtime defaults used by deploy validators', () => {
    expect(CANONICAL_CLOUD_HEALTH_PATH).toBe('/health');
    expect(LEGACY_CLOUD_HEALTH_PATH).toBe('/health/live');
    expect(DEFAULT_RUNTIME_PORTS).toEqual({
      api: 3002,
      web: 3001,
      inference: 11434,
    });
  });

  it('derives deterministic GHCR refs by delegating to ghcr-contract helpers', () => {
    const input = {
      owner: 'kr8tiv-ai',
      sha: 'abc1234def5678',
    };

    const first = buildCloudDeployImageRefs(input);
    const second = buildCloudDeployImageRefs(input);

    expect(first).toEqual(second);
    expect(first.api).toEqual([
      'ghcr.io/kr8tiv-ai/kin-api:latest',
      'ghcr.io/kr8tiv-ai/kin-api:sha-abc1234',
    ]);
    expect(first.web).toEqual([
      'ghcr.io/kr8tiv-ai/kin-web:latest',
      'ghcr.io/kr8tiv-ai/kin-web:sha-abc1234',
    ]);
    expect(first.inference).toEqual([
      'ghcr.io/kr8tiv-ai/kin-inference:latest',
      'ghcr.io/kr8tiv-ai/kin-inference:sha-abc1234',
    ]);
  });

  it('fails with actionable errors for malformed GHCR owner/sha inputs', () => {
    expect(() =>
      buildCloudDeployImageRefs({ owner: '   ', sha: 'abc1234def5678' }),
    ).toThrowError('[ghcr-contract] owner is required.');

    expect(() =>
      buildCloudDeployImageRefs({ owner: 'kr8tiv-ai', sha: 'not-hex' }),
    ).toThrowError('[ghcr-contract] sha must include at least 7 hex characters.');
  });

  it('throws explicit contract-parse errors when ghcr-contract exports are malformed', () => {
    expect(() =>
      assertGhcrContractExports({
        GHCR_REGISTRY: 'ghcr.io',
        GHCR_SERVICES: [],
      }),
    ).toThrowError(
      '[cloud-deploy-contract] contract-parse error: missing ghcr-contract export "buildGhcrImageRefs".',
    );

    expect(() =>
      assertGhcrContractExports({
        GHCR_REGISTRY: 'ghcr.io',
        GHCR_SERVICES: [{ id: 'api' }],
        buildGhcrImageRefs: () => ({ api: ['a', 'b'] }),
      }),
    ).toThrowError(
      '[cloud-deploy-contract] contract-parse error: GHCR_SERVICES entries must include string id and image fields.',
    );
  });

  it('accepts /health and flags /health/live as deploy drift', () => {
    expect(validateCanonicalHealthPath('/health')).toBe('/health');

    expect(() => validateCanonicalHealthPath('/health/live')).toThrowError(
      '[cloud-deploy-contract] Legacy deploy health path detected: /health/live. Use /health.',
    );

    expect(() => validateCanonicalHealthPath('health')).toThrowError(
      '[cloud-deploy-contract] Invalid health path "health". Health paths must start with "/".',
    );

    expect(() =>
      assertNoLegacyHealthPath('curl http://localhost:3002/health/live', 'example.md'),
    ).toThrowError(
      '[cloud-deploy-contract] example.md still references legacy health path /health/live.',
    );
  });

  it('keeps deploy-facing baseline references on /health in compose + README', () => {
    const composeSource = fs.readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf8');
    const readmeSource = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

    expect(() => assertNoLegacyHealthPath(composeSource, 'docker-compose.yml')).not.toThrow();
    expect(() => assertNoLegacyHealthPath(readmeSource, 'README.md')).not.toThrow();

    expect(composeSource).toContain('/health');
    expect(readmeSource).toContain('/health');
  });
});
