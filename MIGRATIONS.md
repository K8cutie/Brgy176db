# ChurchOS — Database migrations

> Owner: Platform &nbsp;|&nbsp; Last reviewed: 2026-07-15

The backend schema now lives as an ordered migration chain in
**`supabase/migrations/`**, so a fresh Supabase project can be rebuilt with a
single **`supabase db push`** — instead of applying the loose `churchos-saas-*.sql`
scripts by hand in the right order.

## The chain (what maps to what)

| # | Migration | Source script | What it is |
|---|---|---|---|
| 1 | `…120001_baseline_golive.sql` | `churchos-saas-golive.sql` | **Consolidated baseline** — org+tenancy, domain tables, RLS, guard triggers, onboarding/reports/portal/scheduling/security-prep/billing RPCs, and the authz-fix re-gating, all in one. |
| 2 | `…120002_feature_tables.sql` | `churchos-saas-feature-tables.sql` | donors / pledges / contributions / OR series, etc. |
| 3 | `…120003_portal_config.sql` | `churchos-saas-portal-config.sql` | parishioner-portal configuration. |
| 4 | `…120004_ai_cost_guardrails.sql` | `churchos-saas-ai-cost-guardrails.sql` | `rate_allow` + `ai_budget`/`ai_usage` + `ai_budget_allow` (per-tenant AI cost gate). |
| 5 | `…120005_hardening.sql` | `churchos-saas-hardening.sql` | post-audit hardening. |
| 6 | `…120006_form_scans.sql` | `churchos-saas-form-scans.sql` | private per-parish `form-scans` Storage bucket + RLS. |

**Seed** (`churchos-saas-seed.sql`) → **`supabase/seed.sql`** — demo dioceses/parishes/logins.
It is DATA, not schema: Supabase applies it on `supabase db reset` (local) but does
**not** run it on a prod `db push`. Never load it into a real parish's project.

**Deliberately NOT migrations:**
- `churchos-saas-setup.sql` + `-onboarding`/`-reports`/`-portal`/`-scheduling`/`-security-prep`/`-billing`/`-authz-fix` — **consolidated into `golive.sql`** (which literally begins with the setup section and contains all their objects).
- `churchos-saas-ALL.sql` — a **stale** generated concatenation (predates `golive.sql`); ignore it.
- `churchos-saas-rls-probe*.sql`, `churchos-saas-portal-intake.test.sql` — **tests/probes**, run manually to verify, not schema.

Every migration is idempotent (`create … if not exists`, `create or replace`,
`drop policy … before create`) and contains **no** non-transactional statements
(`concurrently`, `vacuum`, `alter type … add value`), so `db push` (which wraps
each migration in a transaction) is safe.

## Rebuild a FRESH project (the reproducibility goal)
```bash
supabase link --project-ref <new-ref>
supabase db push          # applies migrations 1→6 = the whole schema
# then, separately (not in migrations):
supabase functions deploy ai scan-extract notify xendit-webhook --use-api
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # runtime secret, dashboard-managed
```

## Adopt this for the EXISTING prod project (already built out-of-band)
Prod already has all of this applied by hand, so its migration ledger is empty.
Do **not** `db push` it (that would re-run everything). Instead mark the baseline
as already-applied so the ledger matches reality and only FUTURE migrations push:
```bash
supabase link --project-ref eosbjxavrvmxafpvoroj
supabase migration repair --status applied 20260712120001 20260712120002 20260712120003 20260712120004 20260712120005 20260712120006
supabase migration list   # should now show all six as applied on remote
```
After that, every new schema change is a new `supabase/migrations/<ts>_*.sql`
file → `supabase db push`, and the ledger stays honest. No more out-of-band drift.

## Verification status (honest)
- ✅ Each migration is a byte-for-byte copy of a `churchos-saas-*.sql` script that
  was already applied to and verified against **live prod** — they are known-good.
- ✅ Ordered by dependency (golive baseline first, then additive); no
  push-incompatible statements.
- ⚠️ A true from-scratch `supabase db push` to a **fresh** project was **not** run
  here — it needs Docker (for the local shadow DB) or a new cloud project, neither
  available in this environment. That push is the definitive reproducibility test;
  run it once against a throwaway project to confirm before relying on it.

## Note on drift
The `churchos-saas-*.sql` root scripts remain as the human-editable sources and the
out-of-band (`db query --linked --file`) fallback. Going forward, treat
`supabase/migrations/` as **canonical**: make schema changes as new migration files,
and keep the two in sync if you edit a source script.
