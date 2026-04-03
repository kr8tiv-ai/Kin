import { describe, expect, it } from 'vitest';

import { isBetterSqliteNativeLoadError } from '../scripts/smoke-errors.js';

describe('isBetterSqliteNativeLoadError', () => {
  it('returns true for better-sqlite3 native load failures', () => {
    const err = new Error(
      '.../better_sqlite3.node is not a valid Win32 application',
    ) as Error & { code?: string };
    err.code = 'ERR_DLOPEN_FAILED';

    expect(isBetterSqliteNativeLoadError(err)).toBe(true);
  });

  it('returns false for non-better-sqlite native load failures', () => {
    const err = new Error('.../some_other_native.node load failed') as Error & {
      code?: string;
    };
    err.code = 'ERR_DLOPEN_FAILED';

    expect(isBetterSqliteNativeLoadError(err)).toBe(false);
  });

  it('returns false for non-native-load errors', () => {
    expect(isBetterSqliteNativeLoadError(new Error('random failure'))).toBe(false);
  });
});
