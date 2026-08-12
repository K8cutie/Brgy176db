# ChurchOS — Database migrations

> Owner: Platform &nbsp;|&nbsp; Last reviewed: 2026-08-13

**`supabase/migrations/` is the SINGLE canonical source of the ChurchOS
schema.** A fresh Supabase project is rebuilt with one `supabase db push`;
every schema change is a NEW `supabase/migrations/<ts>_*.sql` file, nothing is
ever applied by hand out-of-band.

The old contract — root `churchos-saas-*.sql` scripts as "human-editable
sources" that each migration had to mirror byte-for-byte — is **retired**
(structural audit 2026-08-13 §1: the mirror silently broke; the authz file
reached three divergent versions at once). The root scripts are frozen in
**`archive/sql/`** for provenance only (see `archive/sql/README.md`, which
records that history). Do not edit them; do not apply them.

## The chain

| # | Migration | What it is |
|---|---|---|
| 1 | `…120001_baseline_golive.sql` | **Consolidated baseline** — org+tenancy, domain tables, RLS, guard triggers, onboarding/reports/portal/scheduling/security-prep/billing RPCs, and the first authz-fix wave, all in one. |
| 2 | `…120002_feature_tables.sql` | donors / pledges / contributions / OR series, etc. |
| 3 | `…120003_portal_config.sql` | parishioner-portal configuration RPCs. |
| 4 | `…120004_ai_cost_guardrails.sql` | `rate_allow` + `ai_budget`/`ai_usage` + `ai_budget_allow` (per-tenant AI cost gate). |
| 5 | `…120005_hardening.sql` | post-audit hardening. |
| 6 | `…120006_form_scans.sql` | private per-parish `form-scans` Storage bucket + RLS. |
| 7 | `…120007_authz_fix.sql` | back-port of the authz fixes (dead `current_user` guards → `is_untrusted_client_write()`). |
| 8 | `…120008_diocese_read_pii_scopedown.sql` | drops `diocese_read_*` from parishioner/donor/sacrament PII tables (RA 10173 posture). |
| 9 | `…120009_derive_report_force_parish.sql` | re-gates `derive_report`'s server-side parish stamp (BUG-1h). |
| 10 | `…120010_audit_chain_and_intake_cap.sql` | audit `prev_hash` server-chaining + RLS-layer anon intake size cap. |
| 11 | *(in flight — see note below)* | storage analog of 0008 + config-RPC grant realign + TRUNCATE revoke. |
| 12 | `…120012_sacrament_engine.sql` | **the agentic sacrament engine** (`sacrament_requests`/`sacrament_events`, one state machine + human gate + register dispatch for baptism/wedding/confirmation/funeral) — previously applied to prod ONLY as a root script, now migrationized with explicit grants. |

> **The 0011 gap:** `20260712120011_storage_pii_scopedown_and_grant_realign.sql`
> was authored on branch `fix/ci-dep-vulns` (commit `9d62bf5`) and **is already
> applied to prod**, whose migration ledger was initialized 2026-07-27 for
> 0001–0011. Until that branch lands, this branch's tree has no 0011 file —
> which is fine for a local `db reset`, but a prod `supabase db push` will
> refuse (remote ledger knows a version the local tree lacks). **Merge
> `fix/ci-dep-vulns` (or cherry-pick `9d62bf5`) before any prod push.**
> 0012 was numbered to leave its slot free.

**Seed** — `supabase/seed.sql` (ex `churchos-saas-seed.sql`): demo
dioceses/parishes/logins. It is DATA, not schema: Supabase applies it on
`supabase db reset` (local) but not on a prod `db push`. Never load it into a
real parish's project.

**Not migrations:** `archive/sql/churchos-saas-rls-probe*.sql` and
`…portal-intake.test.sql` are manual verification probes;
`archive/sql/churchos-saas-ALL.sql` is a **stale generated concat — frozen, do
not apply** (it predates the 0009/0010 security fixes and lacks the sacrament
engine entirely).

Every migration is idempotent (`create … if not exists`, `create or replace`,
`drop policy … before create`) and contains **no** non-transactional statements
(`concurrently`, `vacuum`, `alter type … add value`), so `db push` (which wraps
each migration in a transaction) is safe. New tables/functions must carry
**explicit GRANTs in the migration itself** — grant state applied out-of-band
is this family's known rebuild killer.

## Rebuild a FRESH project (the reproducibility goal)
```bash
supabase link --project-ref <new-ref>
supabase db push          # applies the whole chain = the whole schema
# then, separately (not in migrations):
supabase functions deploy ai scan-extract notify xendit-webhook --use-api
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # runtime secret, dashboard-managed
```

## Prod ledger

Initialized **2026-07-27** for 0001–0011 (branch `fix/ci-dep-vulns`, applied
live): prod's `supabase_migrations` ledger now matches its actual state, after
a long stretch with no ledger at all — during which 0008 was silently skipped
in prod while 0009/0010 landed. The ledger exists precisely so that class of
gap can't recur; keep it honest.

### Reconciling 0012 (operator step — run once, after this branch merges)

Prod ALREADY has the entire sacrament engine (it was applied out-of-band as
`churchos-saas-sacraments.sql` long ago); 0012 only re-homes it into the chain.
Two ways to make the ledger agree, **either is correct**:

```bash
supabase link --project-ref eosbjxavrvmxafpvoroj
# Option A (preferred): mark as applied — zero DDL executed against prod.
supabase migration repair --status applied 20260712120012
# Option B: push it — 0012 is idempotent by construction, so this is a no-op
# apply that also proves the file runs against prod. Requires the 0011 FILE to
# be present locally first (see the 0011 note above), or push will refuse.
supabase db push
supabase migration list   # either way: local == remote through 120012
```

**Decision note:** prefer **A**. The schema is verifiably already live, so
executing DDL against prod buys nothing except risk-surface (Option B's only
edge — proving the file executes — is already covered by the local
`supabase db reset` verification). Use B only if you specifically want prod's
apply history to show the migration ran.

## Going forward

1. Schema change = new `supabase/migrations/<ts>_*.sql` (idempotent, explicit
   grants, unique timestamp — a shared numeric prefix makes the ledger silently
   skip one).
2. `supabase db push` to prod; never `db query` schema by hand again.
3. CI lints `supabase/migrations/` (squawk) — the root `*.sql` glob is gone.
