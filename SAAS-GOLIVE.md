# ChurchOS SaaS — first live run (≈30 min)

Everything is paste-and-run. I can't create the Supabase project for you (it needs
your account), but these are the exact steps to turn the verified-on-paper SaaS
into a live, tested one.

## 1. Create the project
Supabase dashboard → **New project**. Note the **Project URL** and **anon key**
(Settings → API). Keep the **service_role** key secret — it bypasses all security.

## 2. Run the schema (SQL Editor, in order)
1. `churchos-saas-setup.sql` — tables, RLS, guard triggers, the verification query.
2. `churchos-saas-seed.sql` — 2 dioceses, 3 parishes, 4 logins, planted data.

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
