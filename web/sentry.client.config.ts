/* eslint-disable @typescript-eslint/no-require-imports */
try {
  const Sentry = require('@sentry/nextjs');
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
    });
  }
} catch {
  // @sentry/nextjs not installed — Sentry disabled
}
