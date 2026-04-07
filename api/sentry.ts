/* eslint-disable @typescript-eslint/no-explicit-any */
interface SentryLike {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown, ctx?: Record<string, unknown>) => void;
  close: (timeout?: number) => Promise<void>;
}

const noopSentry: SentryLike = {
  init: () => {},
  captureException: () => {},
  close: async () => {},
};

let Sentry: SentryLike = noopSentry;

try {
  // Use globalThis.eval to completely bypass TypeScript module resolution
  const mod = (globalThis as any).eval('require')('@sentry/node') as SentryLike;
  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    mod.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    });
    Sentry = mod;
  }
} catch {
  // @sentry/node not installed — Sentry disabled
}

export { Sentry };
