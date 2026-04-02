// Public monitoring API. Components import ONLY from this module — never
// directly from sentry.ts, posthog.ts, or any vendor package.

import { sentryCapture, sentryIdentify, sentryReset } from './sentry';
import {
  posthogTrack,
  posthogIdentify,
  posthogReset,
  posthogPage,
} from './posthog';
import type { MonitoringEvent, EventProperties } from './events';

export const monitoring = {
  /** Reports an exception to Sentry with optional extra context. */
  captureError(err: Error, ctx?: Record<string, unknown>): void {
    sentryCapture(err, ctx);
  },

  /** Sends a typed event to PostHog. */
  track<E extends MonitoringEvent>(event: E, props: EventProperties[E]): void {
    posthogTrack(event, props);
  },

  /** Associates a user identity in both Sentry and PostHog. */
  identify(userId: string, traits?: { email?: string; isPremium?: boolean }): void {
    sentryIdentify(userId, traits?.email);
    posthogIdentify(userId, traits);
  },

  /** Resets identity on sign-out. */
  reset(): void {
    sentryReset();
    posthogReset();
  },

  /** Records a screen navigation as a PostHog $pageview. */
  page(screen: string): void {
    posthogPage(screen);
  },
};

// Re-export init functions so main.tsx can call them without importing vendor modules
export { initSentry } from './sentry';
export { initPostHog } from './posthog';
