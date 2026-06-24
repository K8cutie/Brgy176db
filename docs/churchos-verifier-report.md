# ChurchOS Verifier Report — 2-Month Persona Simulation

**Environment:** LOCAL THROWAWAY Supabase (Docker, `127.0.0.1`). DB `postgres@127.0.0.1:54322`,
API `127.0.0.1:54321`. PostgreSQL 17.6. No hosted/cloud credentials were used.
**Schema:** the 8 `churchos-saas-*.sql` files applied unmodified, in order
(setup → onboarding → security-prep → portal → scheduling → billing → reports → seed).
**Focal parish:** **St. Mary Magdalene Parish** (`a1111111-…`, Archdiocese of Manila, secretary *Aida*).
**Simulated span:** 8 weeks, **2026-05-04 → 2026-06-28** (collections land 2026-05-10 → 2026-06-28).
**Simulator:** `scripts/sim/churchos-sim.mjs` (Node + `@supabase/supabase-js` 2.108.2; reproducible).
**Snapshot:** `scripts/sim/churchos-2month-seed.sql` (data-only `pg_dump`, 16 tables).
**Machine-readable results:** `scripts/sim/sim-results.json`.

---

## Part A — Data Created (presentable summary)

### Row counts (whole DB; focal parish dominates)
| Table | Rows | Notes |
|---|---:|---|
| dioceses | 2 | Manila + Cubao (seed) |
| parishes | 3 | St. Mary, San Roque (Manila); Sto. Niño (Cubao) |
| profiles | 4 | bishop×2, secretary×2 (test logins, pw `Test1234!`) |
| families | 50 | focal parish directory, Filipino names + barangays |
| service_requests | 49 | 40 portal submissions (anon) + 9 event bookings (`reserve_slot`) |
| availability_slots | 72 | 8 weeks × 3 types × 3 Saturday slots; 9 held by bookings |
| collections | 31 | 24 weekly (8wk × 3 Masses) + 7 seed |
| journal_entries | 10 | 8 weekly balanced + 2 seed |
| budget_items | 5 | Utilities, stipend, repairs, catechetical, charity |
| fee_override_audit | 5 | 3 simulated (HMAC-chained) + 2 seed |
| baptism_records | 18 | |
| marriage_records | 4 | |
| confirmation_records | 3 | |
| death_records | 4 | |
| calendar_events | 34 | Sunday Masses + weekday meetings + sacramental events |
| diocese_reports | 3 | monthly oversight packets (Manila ×2, Cubao ×1) |

### Focal-parish demo figures (the "looks alive" numbers)
- **Collections (8 wk):** ₱321,400 across 3 Mass times.
- **Expenses (journal debits):** ₱154,700.
- **Sacraments:** 17 baptisms, 4 marriages, 3 confirmations, 4 deaths.
- **Service requests:** 49 (mass intentions, certificates, donations, + 9 online event bookings).
- **Scheduling:** 72 published slots, 9 currently held by parishioner bookings.
- **Diocese report (2026-06):** net derived server-side = collections − expenses (verified correct).

All amounts are pesos; all people use Filipino names. The dataset is centered on one
parish so a demo of the parish app + diocese cockpit looks populated and realistic.

---

## Part B — Bug Report

**Assertions run: 25. Pass: 23. Findings: 2** (1 critical, 1 medium). Several "expected
to be caught" blunders were correctly rejected (see "Controls that worked").

### 🔴 BUG-1 (CRITICAL) — Profile self-elevation & tenant-hop: column-freeze guard never fires
- **Persona / action:** Secretary *Aida* (authenticated, ordinary parish user) updates her own
  `profiles` row via PostgREST: `update profiles set role='bishop', parish_id='<San Roque>',
  diocese_id='<Cubao>' where id = self`.
- **Expected:** `role`, `parish_id`, `diocese_id` frozen to old values (the schema's stated guarantee:
  *"nobody can self-provision a profile as 'bishop'"* and *"freeze trust columns"*).
- **Actual:** The update **succeeds with no error**. Aida becomes `role=bishop` and is moved into a
  **different parish and a different diocese** in a single call. Fully reproducible via the real
  auth + PostgREST path and via raw SQL emulation.
- **Root cause:** `public.guard_profile_columns()` (the `BEFORE UPDATE` trigger on `profiles`) gates
  its freeze on `if current_user in ('authenticated','anon')`. The function is **`SECURITY DEFINER`**,
  so inside it `current_user` is the function **owner** (`postgres`), *never* the calling role.
  Proven directly:
  ```
  outer current_user      = authenticated
  current_user INSIDE a SECURITY DEFINER fn = postgres
  ```
  The gate is therefore **always false** and the freeze block is dead code. The only RLS backstop on
  `profiles` is `profiles_update_self USING (id = auth.uid()) WITH CHECK (id = auth.uid())`, which
  restricts *which row* (her own) but **not which columns**, so the role/tenant columns are wide open.
- **Severity:** Critical. Any parish staffer can elevate to `bishop`/`diocese_admin` and/or hop tenants,
  defeating the entire RLS tenancy model (a self-made bishop then reads every parish in the target diocese).
- **Same root cause, masked elsewhere (defense-in-depth gap):**
  - `force_parish_id()` (`current_user in ('authenticated','anon')` → set `parish_id`) is **also inert**.
    A forged cross-parish INSERT is still blocked here only because the RLS `WITH CHECK
    (parish_id = auth_parish_id())` independently rejects it (verified: cross-parish write *was* blocked).
    But the documented "force parish_id to the caller's own" never actually runs.
  - `guard_audit_append_only()` (the `fee_override_audit` UPDATE/DELETE blocker) is **also inert** for
    the same reason; the append-only guarantee currently rests on RLS no-op behavior, not the trigger.
    (In the sim, a tamper attempt left the row unchanged — but via RLS filtering, not the guard.)
- **Fix direction (not applied — schema files left unmodified per mandate):** in all three trigger
  functions, detect the caller with **`session_user`** (or `current_setting('request.jwt.claims', true)`),
  not `current_user`. `session_user` remains the real login role inside a `SECURITY DEFINER` body.
  Alternatively make `guard_profile_columns`/`force_parish_id` plain (non-DEFINER) trigger functions —
  but then they cannot also need definer privileges, so `session_user` is the cleaner change.
  Recommend a regression test asserting a `authenticated` self-`UPDATE` of `profiles.role` is a no-op.

### 🟡 BUG-2 (MEDIUM) — No calendar conflict detection: overlapping events persist silently
- **Persona / action:** Priest creates two `calendar_events` for the **same parish, date, time
  (10:00–11:00), location (Main Church), and officiant (Fr. Reyes)**.
- **Expected:** conflict detected/blocked, or at least flagged.
- **Actual:** **Both rows persist silently.** `calendar_events` has only the (inert) `force_parish_id`
  trigger and the parish RLS policy — no exclusion constraint or overlap trigger.
- **Severity:** Medium. Double-bookings (two weddings in one slot) won't be caught by the database.
  This is partly by design (the calendar is "LOCAL" and the public booking path uses
  `availability_slots`, which *does* prevent double-booking — see "Controls that worked"), but staff
  entering events directly get no safety net.
- **Fix direction:** if the DB should be authoritative, add an overlap guard (e.g. a `tstzrange`
  exclusion constraint per `(parish_id, location)` using `btree_gist`), or enforce it in the desktop
  UI and document that `calendar_events` is intentionally unconstrained.

### Controls that worked (asserted PASS — no bug)
- **Negative / non-numeric / impossible-date collection** → rejected by `derive_collections`
  (negative cash, `"12oo0"`, `2026-13-45` all blocked).
- **Unbalanced journal (dr≠cr)** and **non-array `lines`** → rejected by `derive_journal`.
- **Duplicate sacrament (same `client_id`)** → rejected by `unique (parish_id, client_id)`.
- **Anon self-priced/pre-paid `service_request`** → rejected by `req_public_submit` policy
  (`amount is null and status='submitted' and payment_status='unpaid'`).
- **Anon SELECT on `service_requests`** → 0 rows (no read policy for anon).
- **`reserve_slot` atomicity** → double-reserving the *same* slot: 1st succeeds, 2nd blocked
  ("that time is no longer available"). No double-booking on the public path.
- **Cross-parish READ** → Aida reading San Roque's collections: 0 rows (RLS).
- **Cross-parish WRITE** → Aida inserting into San Roque: blocked by RLS `WITH CHECK`.
- **Cross-diocese report isolation** → Bishop Tomas (Manila) sees only Manila `diocese_reports`,
  never Sto. Niño (Cubao).
- **Audit append-only (net effect)** → authenticated UPDATE/DELETE of `fee_override_audit` left the
  amount unchanged (good *outcome* — but see BUG-1: it's RLS, not the intended guard trigger).
- **Audit HMAC chain** → `verify_audit(St. Mary)` returns `ok=true` for all 4 rows; the server-side
  HMAC (not the client djb2) validates the chain.
- **Derived totals** → `collections.total == cash+checks+digital` for all 27 focal rows.
- **`derive_report` net** → `net = collections − expense` derived server-side, matched the expected value.

---

## Appendix — Environment notes (NOT product bugs; local-stack portability)

These were resolved at the DB/runtime level **without editing any schema file**, and would not occur
on hosted Supabase. Recorded for reproducibility:

1. **`pgcrypto` schema mismatch.** The SaaS SQL assumes `hmac()`/`gen_random_bytes()` resolve under
   `search_path=public` (true on hosted Supabase, where pgcrypto lives in `public`). On the local CLI
   stack pgcrypto installs into the `extensions` schema, so the seed's audit inserts and `audit_hmac`
   failed with *"function hmac(text,text,unknown) does not exist"*. Fixed by
   `alter function public.audit_hmac()/verify_audit() set search_path = public, extensions` and adding
   `extensions` to the role/db `search_path`. **Recommendation:** schema-qualify crypto calls
   (`extensions.hmac`, `extensions.gen_random_bytes`) or pin `search_path = public, extensions` on the
   crypto-using SECURITY DEFINER functions, so the SQL is portable to a stock local stack.
2. **Missing default role grants.** On this CLI stack the `service_role`/`authenticated`/`anon` roles
   had no table privileges on the freshly created `public` tables (hosted Supabase grants these by
   default), so even `service_role` (which has `BYPASSRLS`) got *"permission denied for table"*. Fixed
   with the standard Supabase grant set + `alter default privileges`. RLS still governs row visibility.
3. **Direct `auth.users` seeding** worked here (all 4 logins authenticate with `Test1234!`), despite
   the seed file's own warning that it is version-sensitive.

## How to reproduce
```bash
cd /c/app
npx supabase start
# apply the 8 churchos-saas-*.sql in order (setup→onboarding→security-prep→portal→
#   scheduling→billing→reports→seed) via: docker exec -i supabase_db_app psql -U postgres -d postgres < <file>
# (+ the two portability fixes in the Appendix)
node scripts/sim/churchos-sim.mjs        # runs the 8-week sim + 25 assertions
```
