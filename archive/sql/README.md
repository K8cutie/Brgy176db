# archive/sql — retired root SQL scripts (FROZEN)

> Archived 2026-08-13 (structural audit §1: "the SQL schema has two
> half-authoritative homes"). **Do not edit these files. Do not apply them.**

**`supabase/migrations/` is the single canonical source of the ChurchOS
schema.** Every object these scripts create now exists in the migration chain;
schema changes are made ONLY as new `supabase/migrations/<ts>_*.sql` files.
See `MIGRATIONS.md` at the repo root for the chain map and operator steps.

These files are kept for provenance only: they are the hand-applied scripts the
production database was actually built from (out-of-band, before the chain was
the source of truth), and the audit trail in their comments is worth keeping.

## Provenance map (what each file became)

| Archived script | Where it lives in the chain |
|---|---|
| `churchos-saas-golive.sql` | `20260712120001_baseline_golive.sql` (byte-identical) |
| `churchos-saas-setup.sql`, `-scheduling`, `-billing`, `-onboarding`, `-portal`, `-reports`, `-security-prep` | consolidated inside `golive.sql` = migration 0001 (portal/reports later edits superseded by 0009/0010 — see below) |
| `churchos-saas-feature-tables.sql` | `20260712120002_feature_tables.sql` (byte-identical) |
| `churchos-saas-portal-config.sql` | `20260712120003_portal_config.sql` (byte-identical) |
| `churchos-saas-ai-cost-guardrails.sql` | `20260712120004_ai_cost_guardrails.sql` (byte-identical) |
| `churchos-saas-hardening.sql` | `20260712120005_hardening.sql` (byte-identical) |
| `churchos-saas-form-scans.sql` | `20260712120006_form_scans.sql` (byte-identical) |
| `churchos-saas-authz-fix.sql` | `20260712120007_authz_fix.sql` + deltas in 0009/0010 (see history below) |
| `churchos-saas-sacraments.sql` | `20260712120012_sacrament_engine.sql` (verbatim + fresh-build §0 guard + explicit grants) |
| `churchos-saas-seed.sql` | `supabase/seed.sql` (byte-identical; demo data, local reset only) |
| `churchos-saas-rls-probe.sql`, `-rls-probe-grouped.sql`, `-portal-intake.test.sql` | not schema — manual verification probes; run by hand when needed |
| `churchos-saas-ALL.sql` | **nowhere — stale generated concat, frozen, DO NOT APPLY** (see below) |

## The authz-fix three-version history (why "keep root == 0007" was retired)

`churchos-saas-authz-fix.sql` existed at THREE versions in this repo at once:

1. **Oldest** — embedded in `churchos-saas-golive.sql` lines ~1529-1911
   (= migration 0001). The original fix wave (BUG-1a..1g, BUG-2, BUG-XFF,
   BUG-RL, BUG-VERIFY-AUDIT, BUG-AUDIT-ATTR, BUG-APPROVAL).
2. **Middle** — `supabase/migrations/20260712120007_authz_fix.sql`, the chain
   back-port, whose header demanded it stay byte-identical to the root file.
3. **Newest** — the root file itself, which commits `95eff62` and `9240bb9`
   kept editing after the back-port (BUG-1h `derive_report`, server-chained
   `prev_hash` in `derive_audit`, case-insensitive GENESIS in `verify_audit`)
   without touching 0007 — so the "byte-for-byte" contract silently broke.

**Verified 2026-08-13 (line-level diff): every root-only delta is absorbed by
the chain** — BUG-1h is migration 0009; the `derive_audit` server-chaining and
case-insensitive genesis are migration 0010. The chain end-state is in fact
STRICTER than the root file: 0010 also adds the 8 KB anon-intake details cap to
the `req_public_submit` RLS policy, which the root file never got. Re-applying
the archived root file today would REGRESS that policy — one more reason these
files are frozen.

The contract now: the chain is edited directly; no root twin exists to keep in
sync.

## `churchos-saas-ALL.sql` — stale generated concat. DO NOT APPLY.

A machine-generated concatenation frozen at a mid-era snapshot: it carries the
middle-era authz content (has BUG-1e/1g) but NOT the 0009/0010 fixes
(`derive_report` re-gate, server-chained `prev_hash`, case-insensitive genesis,
8 KB RLS intake cap) and NOT the sacrament engine at all. Applying it over a
live database would regress security fixes. It is kept only as a historical
artifact of the pre-`golive.sql` era.
