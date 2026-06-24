// ChurchOS — error monitoring (Sentry), DSN-gated.
//
// This is a NO-OP unless VITE_SENTRY_DSN is set at build time. That means:
//   - In the local-first Electron desktop build (no DSN) nothing is sent and no
//     network calls are made — the offline trust model is preserved.
//   - In the SaaS build, set VITE_SENTRY_DSN in the Vercel env to enable it.
//
// PII posture: we DO NOT attach user identity, parish data, or request bodies.
// `sendDefaultPii` is left false (the default) and we scrub nothing extra because
// we never add anything sensitive. See docs/observability.md.

import * as Sentry from '@sentry/react'

let initialized = false

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return // no DSN -> stay completely inert (desktop / local dev)

  Sentry.init({
    dsn,
    // Build-time env tag so SaaS vs preview vs desktop is distinguishable.
    environment: (import.meta.env.MODE as string) || 'production',
    release: (import.meta.env.VITE_APP_VERSION as string) || undefined,
    // Conservative: errors only, no performance/replay sampling by default
    // (turn these up deliberately if/when needed).
    tracesSampleRate: 0,
    // Never send default PII (IP, request headers, cookies).
    sendDefaultPii: false,
  })
  initialized = true
}

// Route the app's error path through Sentry. Safe to call whether or not
// monitoring was initialized — it no-ops when there's no DSN.
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return
  Sentry.captureException(error, context ? { extra: context } : undefined)
}
