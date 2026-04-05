// Error capture is delegated to PostHog — no Sentry dependency.
import posthog from 'posthog-js';

// Kept as a no-op so main.tsx call site compiles without changes.
export function initSentry(): void {}

export function sentryCapture(err: Error, ctx?: Record<string, unknown>): void {
  posthog.captureException(err, ctx);
}

// Parameters are intentionally unused stubs — identity is managed by posthog.ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function sentryIdentify(_userId: string, _email?: string): void {}

export function sentryReset(): void {
  // Reset is managed by posthog.reset() in posthog.ts
}
