// ═══════════════════════════════════════════════════════════
// Public-portal config editor client (SaaS / cloud edition)
//
// The parishioner self-service portal (/portal/:slug) renders from
// parishes.public_config (services offered, per-service fees, office contact,
// and the intake master switch). This module is the ONE place staff can EDIT
// that config from inside the app — closing the gap where a parish previously
// needed someone to hand-edit JSON in the database.
//
// READ:  getPortalConfig() → the caller's own parish public_config, resolved
//        server-side from the caller's JWT (get_public_config RPC). No slug is
//        needed — the app doesn't carry the Supabase parish slug client-side.
// WRITE: savePortalConfig(cfg) → persists to parishes.public_config for the
//        caller's OWN parish via the set_public_config SECURITY DEFINER RPC
//        (parishes has no staff-facing UPDATE policy — see
//        churchos-saas-portal-config.sql). Both RPCs resolve the parish via the
//        same auth_parish_id() helper the rest of the RLS uses.
//
// Cloud-only: the public portal has no offline/anon web backend, so in
// desktop mode every call is a guarded, honest no-op (never a fake success).
// Defensive throughout: public_config is JSON that other tools/seed also write,
// so the same coercion the portal already applies (PublicPortal.tsx) is done
// here — a malformed value degrades gracefully instead of crashing.
// ═══════════════════════════════════════════════════════════

import { isCloud } from './cloudStore';
import { getSupabase } from './supabaseClient';

// The four services the portal knows how to render (PublicPortal SERVICES / the
// service_requests.type CHECK constraint). Anything else is dropped on save.
export const PORTAL_SERVICES = ['mass_intention', 'certificate', 'donation', 'event_booking'] as const;
export type PortalService = (typeof PORTAL_SERVICES)[number];

export interface PortalContact {
  phone: string;
  email: string;
  address: string;
  hours: string;
}

// The editable slice of public_config. We deliberately do NOT model the
// per-sacrament `requirements` override here — the researched defaults are
// good and that editor is a separate, later feature. Any keys we don't manage
// (e.g. requirements) are PRESERVED on save so we never clobber them.
export interface PortalConfig {
  services: PortalService[];
  fees: Partial<Record<PortalService, number>>;
  contact: PortalContact;
  intake_enabled: boolean;
}

export interface SaveResult { ok: boolean; error?: string }

export const EMPTY_CONTACT: PortalContact = { phone: '', email: '', address: '', hours: '' };

export function emptyPortalConfig(): PortalConfig {
  return { services: [], fees: {}, contact: { ...EMPTY_CONTACT }, intake_enabled: false };
}

// ── Coercion / validation (pure, unit-tested) ───────────────────────────────

// Mirror PublicPortal's asStr: keep non-empty strings, else '' — a malformed
// entry (e.g. address saved as an object) degrades to a blank field, never a crash.
function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// Sanitize the services array to the known set, de-duplicated, order preserved.
function normalizeServices(v: unknown): PortalService[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: PortalService[] = [];
  for (const item of v) {
    if (typeof item === 'string' && (PORTAL_SERVICES as readonly string[]).includes(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item as PortalService);
    }
  }
  return out;
}

// Coerce a fee to a finite, non-negative, rounded number — or drop it. Accepts
// numbers and numeric strings (the <input type=number> gives strings).
function coerceFee(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function normalizeFees(v: unknown): Partial<Record<PortalService, number>> {
  const out: Partial<Record<PortalService, number>> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const svc of PORTAL_SERVICES) {
    const fee = coerceFee((v as Record<string, unknown>)[svc]);
    if (fee !== null) out[svc] = fee;
  }
  return out;
}

function normalizeContact(v: unknown): PortalContact {
  const c = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return { phone: asStr(c.phone), email: asStr(c.email), address: asStr(c.address), hours: asStr(c.hours) };
}

/**
 * Normalize an arbitrary (operator-edited / seed / form) public_config-shaped
 * value into a safe, fully-populated PortalConfig for the editor. Never throws.
 */
export function normalizePortalConfig(raw: unknown): PortalConfig {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    services: normalizeServices(obj.services),
    fees: normalizeFees(obj.fees),
    contact: normalizeContact(obj.contact),
    intake_enabled: obj.intake_enabled === true,
  };
}

// Light, non-blocking validation for the form. Everything is optional EXCEPT
// that a fee must be ≥ 0 (already coerced) and, when a service is enabled, we
// surface a gentle nudge — we don't hard-block saving. Returns field warnings.
export interface PortalConfigIssues { email?: string; phone?: string }

export function validatePortalConfig(cfg: PortalConfig): PortalConfigIssues {
  const issues: PortalConfigIssues = {};
  const email = cfg.contact.email.trim();
  // Light email check: something@something.something — only if the user typed one.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.email = 'That email looks off — double-check it.';
  const phone = cfg.contact.phone.trim();
  // Light phone check: allow digits, spaces, +, -, (), require ≥ 7 digits.
  if (phone && (phone.replace(/\D/g, '').length < 7)) issues.phone = 'That phone number looks short.';
  return issues;
}

// Build the JSONB payload we persist. Only the four keys we manage; fees only
// for known services; the caller merges this over any preserved keys server-side.
export function toPublicConfigPayload(cfg: PortalConfig): Record<string, unknown> {
  const fees: Record<string, number> = {};
  for (const svc of PORTAL_SERVICES) {
    const fee = coerceFee(cfg.fees[svc]);
    if (fee !== null) fees[svc] = fee;
  }
  // Persist contact fields only when non-empty, matching the seed shape.
  const contact: Record<string, string> = {};
  for (const k of ['phone', 'email', 'address', 'hours'] as const) {
    const val = cfg.contact[k].trim();
    if (val) contact[k] = val;
  }
  return {
    intake_enabled: cfg.intake_enabled === true,
    services: normalizeServices(cfg.services),
    fees,
    contact,
  };
}

// ── Read / write (cloud only) ───────────────────────────────────────────────

/**
 * Read the caller's own parish public_config, resolved server-side from the
 * caller's JWT (get_public_config RPC — no slug needed). Returns a normalized
 * PortalConfig, or null when unavailable (desktop mode, not signed in,
 * network/RLS failure) so the UI can show an honest empty/degraded state.
 */
export async function getPortalConfig(): Promise<PortalConfig | null> {
  if (!isCloud()) return null;
  try {
    const s = await getSupabase();
    const { data, error } = await s.rpc('get_public_config');
    // The RPC returns the jsonb config directly (or null if no parish row).
    if (error || data == null) return null;
    return normalizePortalConfig(data);
  } catch {
    return null;
  }
}

/**
 * Persist the caller's own parish public_config via the set_public_config
 * SECURITY DEFINER RPC (which resolves the parish from the caller's JWT and
 * updates ONLY that row). In desktop/offline mode this is a guarded no-op that
 * returns a clear, non-crashing error — NEVER a fake success.
 */
export async function savePortalConfig(cfg: PortalConfig): Promise<SaveResult> {
  if (!isCloud()) {
    return { ok: false, error: 'Online services are part of ChurchOS Cloud.' };
  }
  try {
    const s = await getSupabase();
    const { error } = await s.rpc('set_public_config', { p_config: toPublicConfigPayload(cfg) });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}
