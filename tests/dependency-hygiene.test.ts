import { describe, expect, it } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };

describe('dependency hygiene', () => {
  it('does not hard-depend on linux-only rollup binaries', () => {
    expect(packageJson.dependencies).not.toHaveProperty(
      '@rollup/rollup-linux-x64-gnu',
    );
  });

  it('keeps candy machine support optional instead of a default runtime dependency', () => {
    expect(packageJson.dependencies).not.toHaveProperty(
      '@metaplex-foundation/mpl-candy-machine',
    );
  });

  it('keeps jwt support on the patched fastify major', () => {
    expect(packageJson.dependencies['@fastify/jwt']).toMatch(/^\^10\./);
  });

  it('pins node below 24 for reliable local runtime support', () => {
    expect(packageJson.engines?.node).toBe('>=20.0.0 <24.0.0');
  });
});
