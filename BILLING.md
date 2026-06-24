# ChurchOS billing — per-parish subscription (Xendit) — PREP

> Owner: Billing / Platform &nbsp;|&nbsp; Last reviewed: 2026-06-24

"SaaS" for ChurchOS means a **paid recurring subscription per parish**, over an
offline-first product. This documents the model + the Xendit wiring to switch on
when you're ready. Nothing here is live yet.

## The model
- **One subscription per parish** (`subscriptions` table, `churchos-saas-billing.sql`).
- **States:** `trial` (30 days, auto-started when a parish is provisioned) → `active`
  (paying) → `past_due` (a charge retried) → `suspended` (charges failed) →
  `cancelled`. The state mirrors to `parishes.billing_status`.
- **Pricing tiers:** ₱1,000–3,500 / parish / month (default ₱2,500). One line a
  diocese feels as "added electricity," justified by the bookkeeping it replaces.
- **Entitlement check:** `parish_is_active(parish_id)` → true while trial-unexpired
  or active. Use it to show a "trial ending / payment due" banner; **never hard-lock
  a parish out of its own local data** — it's local-first and theirs. Suspension
  limits the *cloud diocese sync* + support, not the secretary's offline work.

## Why Xendit
Philippine/SEA-native gateway: GCash, GrabPay, bank transfer, cards, plus
**Recurring** for subscriptions and **Invoices** for one-off (upfront/installation).
Fits the local market far better than Stripe.

## What's scaffolded vs. what to wire
| Piece | Status |
|---|---|
| `subscriptions` schema + status machine + `parish_is_active()` | ✅ built |
| `parishes.billing_status` mirror trigger | ✅ built |
| Webhook handler skeleton (`supabase/functions/xendit-webhook`) | ✅ scaffold (inert until token set) |
| Trial auto-start hook (`start_trial_for_parish`) | ✅ built (call it from onboarding/provision) |
| Xendit account, plans, checkout, customer/recurring ids | ⬜ TO DO when going live |
| In-app "Plans & Billing" page | ⬜ TO DO (demo polish) |

## Go-live steps (when you're ready)
1. Create a Xendit account; create a **Recurring Plan** per tier (₱1000/2500/3500).
2. Build a **checkout**: diocese admin picks a plan → create a Xendit recurring
   subscription → store `xendit_recurring_id` / `xendit_customer_id` on the parish's
   `subscriptions` row.
3. `supabase secrets set XENDIT_CALLBACK_TOKEN=… ` and deploy the webhook:
   `supabase functions deploy xendit-webhook --no-verify-jwt`. Point Xendit's
   webhook URL at it. It flips `status` on `invoice.paid` / `recurring.cycle.*`.
4. For **upfront + installation** fees, use Xendit **Invoices** (one-off) at signup.

## Offline + licensing
The desktop app works fully offline regardless of billing. A light entitlement
check (online, with a long offline grace — e.g. 30 days) can show "subscription
lapsed — reconnect to continue cloud sync." Daily local work is never blocked.
For the **5-church beta**, set everyone to `trial`/free — no Xendit needed.
