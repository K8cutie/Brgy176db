// ═══════════════════════════════════════════════════════════
// Onboarding RPC client (SaaS) — thin wrappers over the SECURITY DEFINER
// functions in churchos-saas-onboarding.sql. Self-service tenancy:
// create your diocese, add parishes, invite + accept staff.
// ═══════════════════════════════════════════════════════════

import { getSupabase } from './supabaseClient';

export interface RpcResult<T = unknown> { ok: boolean; data?: T; error?: string }

async function rpc<T = unknown>(name: string, params: Record<string, unknown>): Promise<RpcResult<T>> {
  try {
    const s = await getSupabase();
    const { data, error } = await s.rpc(name, params);
    return error ? { ok: false, error: error.message } : { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

export const onboardNewAdmin = (diocese: string, parish: string) =>
  rpc<{ diocese_id: string; parish_id: string }>('onboard_new_admin', { p_diocese: diocese, p_parish: parish });

export const provisionParish = (name: string) =>
  rpc<string>('provision_parish', { p_name: name });

export const inviteMember = (parishId: string, email: string, role: string) =>
  rpc<string>('invite_member', { p_parish: parishId, p_email: email, p_role: role });

export const acceptInvite = (token: string) =>
  rpc<{ parish_id: string; role: string }>('accept_invite', { p_token: token });
