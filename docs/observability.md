# ChurchOS — Observability

> Owner: Platform / on-call
> Last reviewed: 2026-06-24

How ChurchOS is monitored across its two runtimes: the SaaS web app (Vercel SPA +
Supabase + Edge Functions) and the local-first Electron desktop build.

## 1. Frontend error monitoring (Sentry)

- Wiring: `src/lib/monitoring.ts` (`initMonitoring`, `captureError`), called from
  `src/main.tsx` at startup and from `src/components/ErrorBoundary.tsx` when a render
  error is caught.
- **DSN-gated:** Sentry only initializes when `VITE_SENTRY_DSN` is set at build time.
  - Desktop / local dev (no DSN) → completely inert, **no network calls** — this
    preserves the offline, local-first trust model.
  - SaaS → set `VITE_SENTRY_DSN` in the Vercel project env to enable.
- **PII posture:** `sendDefaultPii: false`. We never attach user identity, parish
  data, JWTs, or request bodies. The ErrorBoundary sends only the React component
  stack. `tracesSampleRate: 0` (errors only) by default.
- Optional env: `VITE_APP_VERSION` tags the Sentry release; `MODE` is the environment.

### To enable in SaaS (escalation — needs an account/DSN)
1. Create a Sentry project; copy its DSN.
2. Add `VITE_SENTRY_DSN` (and optionally `VITE_APP_VERSION`) to the Vercel env.
3. Redeploy. Verify an error appears in Sentry (trigger the ErrorBoundary in staging).

## 2. Edge function logging (structured JSON)

- Helper: `supabase/functions/_shared/log.ts` (`createLogger(fn, requestId?)`).
- Each function (`ai`, `xendit-webhook`) creates a **request-scoped logger** and emits
  **one JSON object per line** with `ts`, `level`, `fn`, `request_id`, `message`, plus
  any extra fields. Supabase log search can then filter/group by field.
- **Correlation:** client-facing error responses return **only** a `request_id` (the
  `ai` function returns `{ ok:false, error:'server_error', request_id }`). Support can
  paste that id into Supabase logs to find the matching `unhandled_error` line with the
  real detail — without ever exposing internals to the client.
- **Secret/PII posture:** loggers receive identifiers only (event name, mapped status,
  request_id). We never log the Anthropic key, the Xendit callback token, the
  service-role key, JWTs, full request bodies, or personal data. Keeping logs clean is
  the caller's responsibility — the helper does no auto-scrubbing.

### Edge log lifecycle (examples)
- `ai`: logs `unhandled_error` (with `detail`) on the catch path.
- `xendit-webhook`: `unauthorized_callback` (bad token), `ignored` (unmapped event),
  `mapping_status`, `subscription_updated`, `unhandled_error`.

## 3. Existing audit trail (do not alter)

ChurchOS already has an append-only `fee_override_audit` (and broader append-only
audit in the SaaS schema) — that is the product's oversight backbone and is the source
of truth for "who did what." Observability here is operational telemetry and is
**separate** from that financial audit trail. Do not route financial events through
Sentry or the JSON logger; they belong in the audit tables.

## 4. HTTP security headers (host-level — not yet wired)

`index.html` sets CSP / `X-Content-Type-Options` / Referrer-Policy via `<meta>`, but
`frame-ancestors`, HSTS, and `X-Frame-Options` **must** be real HTTP response headers.
Configure them at the host:
- **Vercel:** add a `headers` block in `vercel.json` (or project settings).
- **Electron:** set them via `session.defaultSession.webRequest.onHeadersReceived`.

## 5. What is NOT yet in place (gaps / escalations)

- No uptime/synthetic monitor wired (recommend a simple external check against the SPA
  + a lightweight edge healthcheck).
- No alerting routes configured (Sentry alert rules, Supabase log alerts).
- Tracing/performance sampling is off by default (`tracesSampleRate: 0`).
- See `docs/SLO.md` for the targets these signals should be measured against.
