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

import { createLogger } from '../_shared/log.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_MESSAGE_LEN = 2000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
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
