// ═══════════════════════════════════════════════════════════
// Cloud authentication (SaaS edition) — thin wrapper over Supabase Auth.
// Email/password sign-in, sign-up (onboarding), reset, sign-out. The session
// is stored by supabase-js (persistSession), and reconcileSession() in
// session.ts derives the app's verified identity from it on startup.
// ═══════════════════════════════════════════════════════════

import { getSupabase } from './supabaseClient';

export interface CloudAuthResult { ok: boolean; error?: string }

const friendly = (msg: string): string => {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login')) return 'Incorrect email or password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first (check your inbox).';
  if (m.includes('already registered')) return 'That email is already registered — try signing in.';
  if (m.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
  return msg || 'Something went wrong.';
};

export async function cloudSignIn(email: string, password: string): Promise<CloudAuthResult> {
  const s = await getSupabase();
  const { error } = await s.auth.signInWithPassword({ email: email.trim(), password });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function cloudSignUp(email: string, password: string, fullName: string): Promise<CloudAuthResult> {
  const s = await getSupabase();
  const { error } = await s.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: fullName.trim() } },
  });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function cloudResetPassword(email: string): Promise<CloudAuthResult> {
  const s = await getSupabase();
  const { error } = await s.auth.resetPasswordForEmail(email.trim());
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function cloudSignOut(): Promise<void> {
  try { const s = await getSupabase(); await s.auth.signOut(); } catch { /* ignore */ }
}
