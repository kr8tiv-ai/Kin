type ErrorWithCode = Error & { code?: string };

export function isBetterSqliteNativeLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeCode = (error as ErrorWithCode).code;
  if (maybeCode !== 'ERR_DLOPEN_FAILED') {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('better_sqlite3.node') ||
    message.includes('better-sqlite3')
  );
}

/**
 * Known optional dependencies that have ambient type stubs but are not installed.
 * When server boot fails because one of these is missing, smoke tests should skip
 * rather than fail — the missing package is an environment issue, not a code bug.
 * See K027 in KNOWLEDGE.md.
 */
const OPTIONAL_PACKAGES = ['dockerode', 'discord.js', 'baileys'];

export function isOptionalDependencyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeCode = (error as ErrorWithCode).code;
  if (maybeCode !== 'ERR_MODULE_NOT_FOUND') {
    return false;
  }

  const message = error.message.toLowerCase();
  return OPTIONAL_PACKAGES.some((pkg) => message.includes(`'${pkg}'`) || message.includes(`"${pkg}"`));
}
