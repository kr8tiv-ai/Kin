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
