// ChurchOS — Xendit billing webhook (SCAFFOLD / PREP — not activated)
//
// Receives Xendit callbacks (invoice paid, recurring charge succeeded/failed)
// and updates public.subscriptions.status, which mirrors to parishes.billing_status.
// Writes use the SERVICE ROLE (never the browser), so a parish can't self-activate.
//
// ⚠ PREP ONLY. To go live (see BILLING.md):
//   1. Create a Xendit account + recurring plans; get the callback verification token.
//   2. supabase secrets set XENDIT_CALLBACK_TOKEN=... SUPABASE_SERVICE_ROLE_KEY=...
//   3. supabase functions deploy xendit-webhook --no-verify-jwt
//   4. Point the Xendit webhook URL at this function.
// Until then it is inert: with no XENDIT_CALLBACK_TOKEN set, it 503s.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/log.ts';

// Map Xendit event → our subscription status.
function statusFor(event: string): string | null {
  switch (event) {
    case 'recurring.cycle.succeeded':
    case 'invoice.paid':
      return 'active';
    case 'recurring.cycle.retry':
      return 'past_due';
    case 'recurring.cycle.failed':
    case 'recurring.plan.deactivated':
      return 'suspended';
    case 'recurring.plan.cancelled':
      return 'cancelled';
    default:
      return null;
  }
}

Deno.serve(async (req: Request) => {
  // Request-scoped structured logger; logs event/status/ref identifiers only —
  // never the callback token, service-role key, or full body.
  const log = createLogger('xendit-webhook');
  const token = Deno.env.get('XENDIT_CALLBACK_TOKEN');
  if (!token) return new Response('xendit billing not configured', { status: 503 }); // PREP: inert until set

  // Xendit signs callbacks with a static token header.
  if (req.headers.get('x-callback-token') !== token) {
    log.warn('unauthorized_callback');
    return new Response('unauthorized', { status: 401 });
  }

  try {
    const body = await req.json();
    const event = String(body?.event || body?.status || '');
    const status = statusFor(event);
    // We key the subscription by the Xendit recurring/customer id stored at checkout.
    const ref = body?.data?.reference_id || body?.recurring_id || body?.customer_id;
    if (!status || !ref) {
      log.info('ignored', { event, mapped_status: status });
      return new Response('ignored', { status: 200 });
    }
    log.info('mapping_status', { event, mapped_status: status });

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const periodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supa.from('subscriptions')
      .update({ status, current_period_end: status === 'active' ? periodEnd : undefined })
      .or(`xendit_recurring_id.eq.${ref},xendit_customer_id.eq.${ref}`);
    if (error) throw error;
    log.info('subscription_updated', { mapped_status: status });
    return new Response('ok', { status: 200 });
  } catch (e) {
    // Log the real error server-side only; return a generic message so the webhook
    // caller (and anyone who can reach this endpoint) never sees internal detail.
    log.error('unhandled_error', { detail: String((e as Error)?.message ?? e) });
    return new Response('error', { status: 500 });
  }
});
