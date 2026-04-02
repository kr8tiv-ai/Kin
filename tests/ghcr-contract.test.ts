import { describe, it, expect } from 'vitest';

import {
  GHCR_SERVICES,
  getGhcrImageBase,
  buildGhcrImageRefs,
  DEFAULT_RUNTIME_IMAGES,
} from '../scripts/ghcr-contract.js';

describe('GHCR contract', () => {
  it('defines the required runtime images', () => {
    expect(DEFAULT_RUNTIME_IMAGES).toEqual([
      'kin-api',
      'kin-web',
      'kin-inference',
    ]);

    expect(GHCR_SERVICES.map((service) => service.id)).toEqual([
      'api',
      'web',
      'inference',
    ]);
  });

  it('builds lowercase GHCR image base refs', () => {
    expect(getGhcrImageBase('Kr8tiv-AI', 'kin-api')).toBe(
      'ghcr.io/kr8tiv-ai/kin-api',
    );
  });

  it('returns stable latest and sha tags per service', () => {
    const refs = buildGhcrImageRefs({
      owner: 'kr8tiv-ai',
      sha: 'abc1234def5678',
    });

    expect(refs.api).toEqual([
      'ghcr.io/kr8tiv-ai/kin-api:latest',
      'ghcr.io/kr8tiv-ai/kin-api:sha-abc1234',
    ]);

    expect(refs.web).toEqual([
      'ghcr.io/kr8tiv-ai/kin-web:latest',
      'ghcr.io/kr8tiv-ai/kin-web:sha-abc1234',
    ]);

    expect(refs.inference).toEqual([
      'ghcr.io/kr8tiv-ai/kin-inference:latest',
      'ghcr.io/kr8tiv-ai/kin-inference:sha-abc1234',
    ]);
  });
});
