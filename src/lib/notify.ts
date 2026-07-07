// ═══════════════════════════════════════════════════════════
// Notify — device-native parishioner communications (zero cost).
// Builds sms:/mailto: hrefs that the STAFF device opens, so the
// secretary's own SIM / mail account does the sending. Works
// offline-first, no provider, no per-message fee. Every send is
// logged to a local 'notify_outbox' through the storage seam so
// the parish keeps a record of who was told what, and when.
//
// A paid provider seam exists at supabase/functions/notify — it is
// NOT wired into this UI (see its README for costs and setup).
// ═══════════════════════════════════════════════════════════

import { getJSON, setJSON } from './storageNamespaced';

// ── Phone normalization ──
// PH numbers arrive in every format ("0917 123 4567", "+63 917-123-4567",
// "(02) 8123-4567"). Keep digits plus a single LEADING '+' — everything else
// is stripped, so a crafted "phone" like "0917?body=evil" can't smuggle URI
// parts into the sms: href.
export function normalizePhone(phone: string): string {
  const raw = String(phone ?? '').trim();
  const plus = raw.startsWith('+') ? '+' : '';
  return plus + raw.replace(/\D/g, '');
}

// ── href builders (everything user-derived is encodeURIComponent'd) ──

/** sms:<number>?body=<text> — the ?body= form works on both iOS and Android. */
export function buildSmsHref(phone: string, text: string): string {
  return `sms:${normalizePhone(phone)}?body=${encodeURIComponent(String(text ?? ''))}`;
}

/**
 * mailto:<addr>?subject=&body= — the ADDRESS is encoded too ('@' → %40 is
 * valid per RFC 6068), which neutralizes ?cc=/&bcc= injection through a
 * crafted address like "a@b.com?bcc=attacker@evil.com".
 */
export function buildMailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(String(email ?? '').trim())}` +
    `?subject=${encodeURIComponent(String(subject ?? ''))}` +
    `&body=${encodeURIComponent(String(body ?? ''))}`;
}

// ── Status message templates ──
// One short, friendly message per request status. Tokens: {{parish}}, {{type}},
// {{date}}, {{amount}} — filled by fillTemplate(). 'payment_reminder' is an
// extra (not a lifecycle status) for fee-bearing requests still unpaid.
export const STATUS_TEMPLATES: Record<string, string> = {
  submitted: 'Hello from {{parish}}! We received your {{type}} request and will review it shortly. Thank you!',
  in_review: 'Hello from {{parish}}! Your {{type}} request is now being reviewed. We may reach out for a few more details.',
  scheduled: 'Good news from {{parish}}! Your {{type}} has been scheduled for {{date}}. We will confirm the final details soon.',
  confirmed: 'Confirmed! Your {{type}} with {{parish}} is set for {{date}}. See you there. God bless!',
  completed: 'Your {{type}} request with {{parish}} is complete. Thank you, and God bless you and your family!',
  rejected: 'About your {{type}} request with {{parish}}: we could not proceed as submitted. Please contact the parish office and we will gladly help you sort it out.',
  cancelled: 'Your {{type}} request with {{parish}} has been cancelled. You are welcome to submit a new one anytime.',
  payment_reminder: 'A gentle reminder from {{parish}}: the fee for your {{type}} request is {{amount}}. You may settle it at the parish office. Thank you!',
};

/**
 * Replace {{token}} placeholders with values. Missing tokens become '' and
 * leftover double-spaces are collapsed so a blank token still reads cleanly.
 * Uses a replacer FUNCTION so '$&' etc. in values stays literal text.
 */
export function fillTemplate(template: string, tokens: Record<string, string | undefined>): string {
  return String(template ?? '')
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => tokens[key] ?? '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

// ── Outbox — local log of every notification opened from the app ──

export interface OutboxEntry {
  id: string;
  at: string; // ISO timestamp
  requestId: string;
  channel: 'sms' | 'email';
  to: string;
  template: string; // which template was used (usually the request status)
  by: string; // staff member who sent it
}

const OUTBOX_KEY = 'notify_outbox';
const OUTBOX_MAX = 500; // bound growth — this is a working log, not an archive

export function appendOutbox(input: {
  requestId: string; channel: 'sms' | 'email'; to: string; template: string; by: string;
}): OutboxEntry {
  const entry: OutboxEntry = {
    id: `nb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    requestId: String(input?.requestId ?? ''),
    channel: input?.channel === 'email' ? 'email' : 'sms',
    to: String(input?.to ?? ''),
    template: String(input?.template ?? ''),
    by: String(input?.by ?? '') || 'unknown',
  };
  const log = getJSON<OutboxEntry[]>(OUTBOX_KEY, []);
  setJSON(OUTBOX_KEY, [entry, ...log].slice(0, OUTBOX_MAX)); // newest first
  return entry;
}

export function listOutbox(): OutboxEntry[] {
  return getJSON<OutboxEntry[]>(OUTBOX_KEY, []);
}
