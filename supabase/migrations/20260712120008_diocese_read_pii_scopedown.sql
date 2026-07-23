-- ══════════════════════════════════════════════════════════════════════════
-- 20260712120008_diocese_read_pii_scopedown.sql   (idempotent; safe to re-run)
--
-- FINDING (portfolio audit 2026-07-20, HIGH): setup.sql §5 and feature-tables.sql
-- §4 clone a uniform `diocese_read_<t>` SELECT policy onto EVERY domain table,
-- including the parishioner/donor/sacrament PII tables. That let a diocese_admin/
-- bishop `select *` full parishioner records (child/spouse/deceased names, family
-- directory, aid recipients, donor names + giving history, sacrament subjects)
-- across every parish in their diocese.
--
-- This DIRECTLY CONTRADICTS the product's documented privacy posture
-- (churchos-saas-reports.sql: "parishioner PII … NEVER leaves the parish, which
-- largely addresses RA 10173"). The diocese is meant to see only the compact
-- monthly SUMMARY in `diocese_reports`.
--
-- VERIFIED SAFE: the only diocese-facing surface, src/pages/DioceseCockpit.tsx,
-- reads exclusively from `diocese_reports` (totals + flagged_waivers). NO app code
-- reads any raw PII table cross-diocese, so these policies are unused attack
-- surface. Dropping them changes no working feature.
--
-- SCOPE: drop diocese_read from tables carrying parishioner/donor/sacrament identity
-- (+ the waiver audit, whose tenant-scoped read path is verify_audit()), AND from the
-- history/AR/audit tables whose free-text `data`/`description` embeds parishioner names.
-- LEAVE diocese_read intact ONLY on operational / financial-aggregate tables that carry
-- NO parishioner identity (collections, journal_entries, budget_items, or_series,
-- donation_campaigns, calendar_events, certificate_templates, parish_settings) — those
-- remain within a diocese's legitimate oversight remit.
--
-- CORRECTION (api_exposure audit 2026-07-20): audit_log / accounts_receivable /
-- import_history were originally KEPT here as "operational"; that was wrong. audit_log
-- rows store the full entry in `data`, and its details embed person names (e.g.
-- "Archived baptism record for <name>", incl. DEATH-record subjects) + the acting staff
-- name — a confirmed HIGH cross-diocese parishioner-identity read. They are now dropped
-- too. DioceseCockpit reads only diocese_reports, so no diocese feature depends on them.
--
-- Parish staff access is UNCHANGED (parish_all_<t> stays). Diocese roll-ups keep
-- flowing through diocese_reports. Reconcile source files (setup.sql /
-- feature-tables.sql / sacraments.sql) on next edit so a fresh ALL.sql build
-- matches this canonical migration.
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
-- parishioner PII (setup.sql §5) + donor/giving PII (feature-tables §4) + waiver audit
-- + history/AR/audit whose free-text `data`/`description` embeds parishioner names.
declare pii_tables text[] := array[
  'baptism_records','marriage_records','confirmation_records','death_records',
  'families','ministries','ssdm_applications','ssdm_beneficiaries','ssdm_disbursements',
  'fee_override_audit',
  'donors','pledges','contributions','mass_intentions','attendance_records',
  'audit_log','accounts_receivable','import_history'
];
begin
  foreach t in array pii_tables loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('drop policy if exists %I on public.%I', 'diocese_read_'||t, t);
    end if;
  end loop;
end $$;

-- Sacrament PII (churchos-saas-sacraments.sql — applied out-of-band; guard by existence
-- so this migration is safe whether or not the sacraments layer is present).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'sacrament_requests') then
    execute 'drop policy if exists sacrament_diocese_read on public.sacrament_requests';
  end if;
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'sacrament_events') then
    execute 'drop policy if exists sacrament_events_diocese_read on public.sacrament_events';
  end if;
end $$;

-- ── Verify: no diocese_read_* policy should remain on any PII table ──
-- select tablename, policyname from pg_policies
--   where schemaname='public' and policyname like '%diocese_read%'
--   order by tablename;   -- expect only the operational/financial tables listed above
