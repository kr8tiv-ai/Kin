import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_CLOUD_HEALTH_PATH,
  LEGACY_CLOUD_HEALTH_PATH,
} from '../scripts/cloud-deploy-contract.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const providerManifestPaths = {
  railway: path.join(repoRoot, 'railway.toml'),
  render: path.join(repoRoot, 'render.yaml'),
  fly: path.join(repoRoot, 'fly.toml'),
  coolify: path.join(repoRoot, 'docker-compose.coolify.yml'),
} as const;

type ProviderId = keyof typeof providerManifestPaths;

function readManifest(provider: ProviderId): string {
  return fs.readFileSync(providerManifestPaths[provider], 'utf8');
}

function stripHashCommentLines(content: string): string {
  return content
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

function assertGhcrServiceCoverage(content: string, provider: ProviderId): void {
  for (const imageName of ['kin-api', 'kin-web', 'kin-inference']) {
    if (!content.includes(imageName)) {
      throw new Error(`[${provider}] missing GHCR image reference for ${imageName}.`);
    }
  }
}

function assertCanonicalHealth(content: string, provider: ProviderId): void {
  const normalized = stripHashCommentLines(content);

  if (normalized.includes(LEGACY_CLOUD_HEALTH_PATH)) {
    throw new Error(`[${provider}] still references legacy health path ${LEGACY_CLOUD_HEALTH_PATH}.`);
  }

  if (!normalized.includes(CANONICAL_CLOUD_HEALTH_PATH)) {
    throw new Error(`[${provider}] does not include canonical health path ${CANONICAL_CLOUD_HEALTH_PATH}.`);
  }
}

function assertRequiredSecretPlaceholders(content: string, provider: ProviderId): void {
  if (provider === 'coolify' && !content.includes('JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}')) {
    throw new Error('[coolify] missing required JWT_SECRET placeholder guard.');
  }

  if (provider === 'render') {
    if (!/- key:\s*JWT_SECRET\s*\r?\n\s+sync:\s*false/.test(content)) {
      throw new Error('[render] missing required secret prompt placeholder for JWT_SECRET.');
    }
  }

  if (provider === 'railway') {
    if (!content.includes('JWT_SECRET=<required>') || !content.includes('NEXT_PUBLIC_API_URL=<required')) {
      throw new Error('[railway] missing required variable placeholders in manifest guidance.');
    }
  }

  if (provider === 'fly' && !content.includes('JWT_SECRET = "__SET_WITH_FLY_SECRETS__"')) {
    throw new Error('[fly] missing required JWT_SECRET secret placeholder.');
  }
}

function assertTagOverrideGuidance(content: string, provider: ProviderId): void {
  if (!content.includes('sha-<7hex>')) {
    throw new Error(`[${provider}] missing immutable sha-* tag guidance.`);
  }
}

function assertReadinessGuards(content: string, provider: ProviderId): void {
  if (provider === 'fly') {
    if (!content.includes('[[http_service.checks]]') || !content.includes('grace_period')) {
      throw new Error('[fly] missing explicit cold-start readiness guard settings.');
    }

    return;
  }

  if (provider === 'coolify') {
    if (!content.includes('start_period') || !content.includes('retries')) {
      throw new Error('[coolify] missing delayed-readiness healthcheck guard settings.');
    }

    return;
  }

  if (provider === 'railway' && !content.includes('healthcheckTimeout')) {
    throw new Error('[railway] missing healthcheck timeout guard.');
  }

  if (provider === 'render' && !content.includes('healthCheckPath: /health')) {
    throw new Error('[render] missing API health check path guard.');
  }
}

describe('cloud provider manifests', () => {
  it('ships all four provider manifests with deterministic GHCR service coverage', () => {
    for (const provider of Object.keys(providerManifestPaths) as ProviderId[]) {
      const content = readManifest(provider);
      expect(content.length).toBeGreaterThan(0);
      expect(() => assertGhcrServiceCoverage(content, provider)).not.toThrow();
    }
  });

  it('uses canonical /health and avoids legacy /health/live drift', () => {
    for (const provider of Object.keys(providerManifestPaths) as ProviderId[]) {
      const content = readManifest(provider);
      expect(() => assertCanonicalHealth(content, provider)).not.toThrow();
    }
  });

  it('includes required secret placeholders for Railway/Render/Fly/Coolify paths', () => {
    for (const provider of Object.keys(providerManifestPaths) as ProviderId[]) {
      const content = readManifest(provider);
      expect(() => assertRequiredSecretPlaceholders(content, provider)).not.toThrow();
    }
  });

  it('documents immutable sha-* image-tag guidance for all providers', () => {
    for (const provider of Object.keys(providerManifestPaths) as ProviderId[]) {
      const content = readManifest(provider);
      expect(() => assertTagOverrideGuidance(content, provider)).not.toThrow();
    }
  });

  it('encodes readiness guards so delayed startups are not treated as healthy too early', () => {
    for (const provider of Object.keys(providerManifestPaths) as ProviderId[]) {
      const content = readManifest(provider);
      expect(() => assertReadinessGuards(content, provider)).not.toThrow();
    }
  });

  it('fails when Coolify required JWT secret guard is accidentally weakened', () => {
    const content = readManifest('coolify').replace(
      'JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}',
      'JWT_SECRET: ${JWT_SECRET:-}',
    );

    expect(() => assertRequiredSecretPlaceholders(content, 'coolify')).toThrowError(
      '[coolify] missing required JWT_SECRET placeholder guard.',
    );
  });

  it('fails when Render secret prompt markers are removed', () => {
    const content = readManifest('render')
      .replace('- key: JWT_SECRET', '- key: JWT_SECRET_REMOVED')
      .replace('sync: false', 'value: not-secret');

    expect(() => assertRequiredSecretPlaceholders(content, 'render')).toThrowError(
      '[render] missing required secret prompt placeholder for JWT_SECRET.',
    );
  });

  it('fails when Railway required variable placeholders drift out', () => {
    const content = readManifest('railway').replace('JWT_SECRET=<required>', 'JWT_SECRET=');

    expect(() => assertRequiredSecretPlaceholders(content, 'railway')).toThrowError(
      '[railway] missing required variable placeholders in manifest guidance.',
    );
  });

  it('fails when immutable sha-* guidance is removed from Fly', () => {
    const content = readManifest('fly').replace('sha-<7hex>', 'latest');

    expect(() => assertTagOverrideGuidance(content, 'fly')).toThrowError(
      '[fly] missing immutable sha-* tag guidance.',
    );
  });

  it('fails when Fly cold-start readiness guard is removed', () => {
    const content = readManifest('fly').replace('  grace_period = "20s"\n', '');

    expect(() => assertReadinessGuards(content, 'fly')).toThrowError(
      '[fly] missing explicit cold-start readiness guard settings.',
    );
  });
});
