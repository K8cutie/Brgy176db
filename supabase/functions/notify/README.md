# notify — optional server-side notification seam

**This function is NOT wired into the app UI.** Nothing calls it today.

The Requests page notifies parishioners the zero-cost, offline-first way: it
opens a prefilled `sms:` or `mailto:` link on the staff device, so the
secretary's own SIM / mail account does the sending (see `src/lib/notify.ts`).
Every send is logged locally to the notification outbox.

This edge function exists so a parish that later wants **server-side** sending
(automatic texts/emails that don't depend on a staff device) has an honest,
ready seam. Until the provider secrets are set, it returns **HTTP 501** with a
clear message — it never fakes a send.

## API

`POST /functions/v1/notify`

```json
{ "to": "+639171234567", "channel": "sms", "message": "Hello from the parish!" }
```

- `channel`: `"sms"` or `"email"`
- Returns `200 { ok: true }` on a real provider send,
  `501` when the provider for that channel is not configured,
  `400` on a bad body, `500` (with a `request_id`) on provider errors.

## What it costs to enable

| Channel | Provider | Cost | Secret |
|---|---|---|---|
| SMS | [Semaphore](https://semaphore.co) (PH gateway) | ~PHP 0.50 per SMS (prepaid credits) | `SEMAPHORE_API_KEY` |
| Email | [Resend](https://resend.com) | Free tier: 100 emails/day, 3,000/month; paid from ~USD 20/mo | `RESEND_API_KEY` |

Optional: `NOTIFY_FROM_EMAIL` — the From address for email (defaults to
Resend's `onboarding@resend.dev`, which is fine for testing only; set a
verified-domain address for real use).

## Enabling it

```sh
supabase functions deploy notify
supabase secrets set SEMAPHORE_API_KEY=your-key      # SMS
supabase secrets set RESEND_API_KEY=re_your-key      # email
supabase secrets set NOTIFY_FROM_EMAIL=parish@yourdomain.ph
```

Then wire a caller in the app (there is none yet — that is a deliberate,
separate decision, since it introduces per-message costs and a cloud
dependency for a flow that currently works for free).
