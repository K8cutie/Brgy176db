// ChurchOS edge functions — structured JSON logger (Deno).
//
// One JSON object per log line so Supabase log search / any sink can index by
// field. Every log line carries a `request_id` so a client-facing error response
// (which returns only that id) can be correlated to the server-side detail.
//
// SECRET / PII POSTURE: callers MUST NOT pass API keys, tokens, JWTs, full request
// bodies, or personal data in `fields`. Log identifiers (request_id, event name,
// reference id, status) — not contents. This helper does no automatic scrubbing;
// keeping logs clean is the caller's responsibility.

export interface Logger {
  requestId: string
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

function emit(
  level: 'info' | 'warn' | 'error',
  fn: string,
  requestId: string,
  message: string,
  fields?: Record<string, unknown>,
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    fn,
    request_id: requestId,
    message,
    ...(fields ?? {}),
  }
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  out(JSON.stringify(line))
}

// Create a request-scoped logger. Pass an existing requestId to continue a
// correlation, otherwise a fresh UUID is minted.
export function createLogger(fn: string, requestId: string = crypto.randomUUID()): Logger {
  return {
    requestId,
    info: (message, fields) => emit('info', fn, requestId, message, fields),
    warn: (message, fields) => emit('warn', fn, requestId, message, fields),
    error: (message, fields) => emit('error', fn, requestId, message, fields),
  }
}
