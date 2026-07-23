// ChurchOS Notify — Supabase Edge Function (Deno)
//
// OPTIONAL paid-provider seam for parishioner notifications. The app itself
// sends nothing through here today: RequestsPage uses device-native sms:/mailto:
// hrefs (zero cost). This function exists so a parish that WANTS server-side
// sending (real SMS via Semaphore, real email via Resend) can enable it by
// setting secrets — see README.md in this folder. It is deliberately honest:
// with no keys configured it returns 501, never a fake success.
//
// Deploy:  supabase functions deploy notify
// Secrets: supabase secrets set SEMAPHORE_API_KEY=...   (SMS, ~PHP 0.50/message)
//          supabase secrets set RESEND_API_KEY=...      (email, free tier available)
//          supabase secrets set NOTIFY_FROM_EMAIL=parish@yourdomain.ph  (optional)
//
// Note: this runs on Deno, not the app's Vite build — it is not type-checked by
// `npm run build`. It is a deploy artifact.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/log.ts';

// Lock to the app origin in production (set NOTIFY_ALLOWED_ORIGIN) so arbitrary
// websites' JS cannot fire these (billed) sends. Defaults to '*' to preserve
// current behavior when unset — matches the AI function's ALLOWED_ORIGIN seam.
const ALLOWED_ORIGIN = Deno.env.get('NOTIFY_ALLOWED_ORIGIN') || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_MESSAGE_LEN = 2000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

// Normalizers for on-file recipient matching. Phone: digits only, compared on the
// last 10 (tolerates +63 / 0 / spacing variants). Email: trimmed + lowercased.
const digits = (s: string) => s.replace(/\D+/g, '');
const phoneKey = (s: string) => { const d = digits(s); return d.length >= 10 ? d.slice(-10) : d; };
const emailKey = (s: string) => s.trim().toLowerCase();

// Is `to` a contact ALREADY on file for the caller's own parish? Runs under the
// caller's RLS (service_requests is parish-scoped), so this both authorizes the
// recipient and can never see another parish's contacts. Returns false when the
// recipient is unknown → the function refuses to send (kills the arbitrary-recipient
// smishing / denial-of-wallet relay). Returns false (fail-closed) on any query error.
// deno-lint-ignore no-explicit-any
async function recipientOnFile(supa: any, channel: 'sms' | 'email', to: string): Promise<boolean> {
  const col = channel === 'sms' ? 'requester_phone' : 'requester_email';
  const { data, error } = await supa.from('service_requests').select(col).not(col, 'is', null).limit(5000);
  if (error || !Array.isArray(data)) return false;
  const want = channel === 'sms' ? phoneKey(to) : emailKey(to);
  if (!want) return false;
  const norm = channel === 'sms' ? phoneKey : emailKey;
  return data.some((r: Record<string, string>) => norm(String(r[col] ?? '')) === want);
}

async function sendSms(key: string, to: string, message: string) {
  // Semaphore (PH SMS gateway) — https://semaphore.co
  const res = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apikey: key, number: to, message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`semaphore ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function sendEmail(key: string, to: string, message: string) {
  // Resend — https://resend.com. Free tier works with the onboarding sender;
  // set NOTIFY_FROM_EMAIL to a verified domain address for real use.
  const from = Deno.env.get('NOTIFY_FROM_EMAIL') || 'onboarding@resend.dev';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: 'A message from your parish', text: message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const log = createLogger('notify');
  try {
    const body = await req.json().catch(() => null) as { to?: unknown; channel?: unknown; message?: unknown } | null;
    const to = typeof body?.to === 'string' ? body.to.trim() : '';
    const channel = body?.channel === 'sms' || body?.channel === 'email' ? body.channel : null;
    const message = typeof body?.message === 'string' ? body.message : '';
    if (!to || !channel || !message) {
      return json({ ok: false, error: 'bad_request', message: 'Expected JSON body: { to, channel: "sms" | "email", message }.' }, 400);
    }
    if (message.length > MAX_MESSAGE_LEN) {
      return json({ ok: false, error: 'message_too_long', message: `Message must be ${MAX_MESSAGE_LEN} characters or fewer.` }, 400);
    }

    // AUTHENTICATE THE CALLER BEFORE SENDING ANYTHING. Without this, any valid JWT
    // (any parish) — or, if the gateway is ever misconfigured, an anon caller — could
    // POST an arbitrary `to` + free-text message and turn the parish's paid SMS/email
    // credits into a smishing / denial-of-wallet relay. Mirrors the AI function's
    // in-band getUser() defense-in-depth; a bare anon key resolves to no user here.
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ ok: false, error: 'unauthorized' }, 401);
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await supa.auth.getUser();
    const uid = userData?.user?.id;
    if (authErr || !uid) return json({ ok: false, error: 'unauthorized' }, 401);

    // Per-user burst throttle (caps spam volume / denial-of-wallet). rate_allow
    // RETURNS a boolean; only an explicit false blocks (a missing grant surfaces as
    // an error, not a silent no-op). Same pattern as the AI function.
    {
      const { data: allowed, error: rlErr } = await supa.rpc('rate_allow', { p_key: 'notify:' + uid, p_limit: 30, p_window: '1 minute' });
      if (!rlErr && allowed === false) return json({ ok: false, error: 'rate_limited' }, 429);
    }

    // The recipient MUST already be a contact on file for the caller's own parish
    // (checked under the caller's RLS). This is what stops the relay from reaching
    // arbitrary external numbers — you can only message people already in your
    // parish's request records, never a harvested/attacker-supplied list.
    if (!(await recipientOnFile(supa, channel, to))) {
      return json({
        ok: false, error: 'recipient_not_on_file',
        message: 'You can only notify contacts already on file for your parish (from their submitted requests).',
      }, 403);
    }

    if (channel === 'sms') {
      const key = Deno.env.get('SEMAPHORE_API_KEY');
      if (!key) {
        return json({
          ok: false, error: 'sms_provider_not_configured',
          message: 'SMS sending is not enabled. Set the SEMAPHORE_API_KEY secret (Semaphore, ~PHP 0.50 per SMS) to enable it. Meanwhile the app sends texts through the staff device at no cost.',
        }, 501);
      }
      await sendSms(key, to, message);
      return json({ ok: true, channel: 'sms' });
    }

    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) {
      return json({
        ok: false, error: 'email_provider_not_configured',
        message: 'Email sending is not enabled. Set the RESEND_API_KEY secret (Resend free tier: 100 emails/day) to enable it. Meanwhile the app sends email through the staff device mail app at no cost.',
      }, 501);
    }
    await sendEmail(key, to, message);
    return json({ ok: true, channel: 'email' });
  } catch (e) {
    // Real detail stays server-side; the client gets a correlation id only.
    log.error('unhandled_error', { detail: String((e as Error)?.message ?? e) });
    return json({ ok: false, error: 'server_error', request_id: log.requestId }, 500);
  }
});
