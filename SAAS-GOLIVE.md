# ChurchOS SaaS — first live run (≈30 min)

> Owner: Platform / on-call &nbsp;|&nbsp; Last reviewed: 2026-06-24

Everything is paste-and-run. I can't create the Supabase project for you (it needs
your account), but these are the exact steps to turn the verified-on-paper SaaS
into a live, tested one.

## 1. Create the project
Supabase dashboard → **New project**. Note the **Project URL** and **anon key**
(Settings → API). Keep the **service_role** key secret — it bypasses all security.

## 2. Run the schema (SQL Editor, in this order)
1. `churchos-saas-setup.sql` — tables, RLS, guard triggers, the verification query.
2. `churchos-saas-onboarding.sql` — self-service diocese onboarding + invites.
3. `churchos-saas-reports.sql` — monthly diocese financial packets.
4. `churchos-saas-portal.sql` — parishioner self-service intake queue.
5. `churchos-saas-scheduling.sql` — self-service sacrament slot booking.
6. `churchos-saas-security-prep.sql` — audit HMAC + rate limiting.
7. `churchos-saas-billing.sql` — per-parish subscriptions (Xendit-ready).
8. `churchos-saas-seed.sql` — 2 dioceses, 3 parishes, 4 logins, demo data, portal slugs.
9. **`churchos-saas-authz-fix.sql`** — ⚠ **LAUNCH-BLOCKER, MUST RUN LAST.** The guard
   triggers in (1)/(4)/(5) gate on `current_user`, which is dead inside their
   `SECURITY DEFINER` bodies (it's always `postgres`) — so without this fix a parish
   user can self-elevate to bishop and hop tenants. This re-gates them on
   `auth.role()` + a secret-nonce capability. Re-runnable; verified locally.

After (1), the verification query at the bottom must show **every** table with
`rls_enabled = true` and `policies ≥ 1`. A `false` is a release blocker.

**Prove the fix** (after step 9): run the self-elevation probe — an `authenticated`
session doing `update profiles set role='bishop' where id=auth.uid()` must leave
`role` unchanged. `churchos-saas-rls-probe.sql` includes this check (`c1`).

The **public parishioner portal** is then at `…/#/portal/st-mary` (mobile-first).

After (1), the verification query at the bottom must show **every** table with
`rls_enabled = true` and `policies ≥ 1`. A `false` is a release blocker.

## 3. Prove tenant isolation (the real test)
Run `churchos-saas-rls-probe.sql`. Every returned row must show **`pass = true`**:
it impersonates the seeded secretaries + bishop and confirms cross-parish reads,
cross-diocese reads, self-promotion, forged-parish inserts, and the view leak are
all blocked. (The append-only-audit check is a commented block that should *error*
— that error is the pass.)

This closes the four gaps the JS sim couldn't prove (`a3` view leak, `c1/c2`
guards under real RLS, `d`-series diocese isolation).

## 4. Point the app at it
```bash
# .env.local (build-time, Vite)
VITE_SUPABASE_URL=https://YOUR.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_CHURCHOS_MODE=cloud
```
`VITE_CHURCHOS_MODE=cloud` flips the storage seam to `cloudStore`; without it the
build stays offline/desktop, untouched.

## 5. Deploy the AI edge function (optional, for the web assistant)
```bash
supabase functions deploy ai --no-verify-jwt
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # stays server-side
```

## 6. Smoke-test as a real user
Log in as `aida@churchos.test` / `Test1234!` → you should see **only** St. Mary
Magdalene's data. Log in as `bishop.manila@churchos.test` → open `/diocese` (the
cockpit) → you should see St. Mary **and** San Roque rolled up, the flagged San
Roque waiver, and **not** Sto. Niño (it's in another diocese).

## Still open after this (not blockers for a pilot tenant)
- Onboarding/invite + password-reset flow + transactional email (SMTP).
- Billing enforcement (suspend on non-payment) — `billing_status` exists, nothing
  acts on it yet.
- Rate limiting, Realtime authorization review, point-in-time-recovery config.
- The ops checklist in `churchos-saas-setup.sql` §6b (service_role key hygiene, etc).
