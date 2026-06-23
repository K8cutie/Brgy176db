// ═══════════════════════════════════════════════════════════
// Parishioner portal client (public website) — anon calls into the cloud:
// resolve a parish by slug, submit a service request, check status by token.
// ═══════════════════════════════════════════════════════════

import { getSupabase } from './supabaseClient';

export interface ParishPublic {
  id: string;
  name: string;
  slug: string;
  public_config: {
    services?: string[];
    fees?: Record<string, number>;
    contact?: { phone?: string; email?: string; address?: string };
    intake_enabled?: boolean;
  };
}
export interface SubmitResult { ok: boolean; token?: string; error?: string }
export interface RequestStatus { type: string; status: string; requested_date: string | null; amount: number | null; payment_status: string }

export async function getParishBySlug(slug: string): Promise<ParishPublic | null> {
  try {
    const s = await getSupabase();
    const { data, error } = await s.rpc('parish_public', { p_slug: slug });
    if (error || !data || !data[0]) return null;
    return data[0] as ParishPublic;
  } catch { return null; }
}

export async function submitRequest(
  parishId: string,
  type: string,
  payload: { requester_name?: string; requester_email?: string; requester_phone?: string; requested_date?: string | null; details?: Record<string, unknown> },
): Promise<SubmitResult> {
  try {
    const s = await getSupabase();
    // The parishioner keeps this token to track status (anon can't read the row back).
    const token = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    const { error } = await s.from('service_requests').insert({
      parish_id: parishId,
      type,
      public_token: token,
      requester_name: payload.requester_name || null,
      requester_email: payload.requester_email || null,
      requester_phone: payload.requester_phone || null,
      requested_date: payload.requested_date || null,
      details: payload.details || {},
      // status / payment / amount are server-forced — never sent from here.
    }); // no .select() → return=minimal, so anon (no SELECT policy) isn't blocked
    if (error) return { ok: false, error: error.message };
    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: String((e as Error).message) };
  }
}

export async function checkStatus(token: string): Promise<RequestStatus | null> {
  try {
    const s = await getSupabase();
    const { data, error } = await s.rpc('request_status', { p_token: token });
    if (error || !data || !data[0]) return null;
    return data[0] as RequestStatus;
  } catch { return null; }
}
