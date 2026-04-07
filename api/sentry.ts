/* eslint-disable @typescript-eslint/no-explicit-any */
let Sentry: any = {
  init: () => {},
  captureException: () => {},
  close: async () => {},
};

try {
  const mod = await import('@sentry/node');
  Sentry = mod;

  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      integrations: [Sentry.httpIntegration()],
    });
  }
} catch {
  // @sentry/node not installed — Sentry disabled
}

export { Sentry };
