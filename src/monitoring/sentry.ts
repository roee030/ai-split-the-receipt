import * as Sentry from '@sentry/react';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // no-op in local dev without DSN configured

  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    integrations: [
      Sentry.replayIntegration({
        maskAllInputs: true,
        maskAllText: false,
      }),
    ],
  });
}

export function sentryCapture(err: Error, ctx?: Record<string, unknown>): void {
  Sentry.captureException(err, { extra: ctx });
}

export function sentryIdentify(userId: string, email?: string): void {
  Sentry.setUser({ id: userId, email });
}

export function sentryReset(): void {
  Sentry.setUser(null);
}
