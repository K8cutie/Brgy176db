-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — DB-level double-booking hardening for calendar_events
--
-- WHAT THIS DOES
--   Adds btree_gist EXCLUDE constraints so the DATABASE ITSELF rejects two
--   events for the same parish that overlap in time at the same location or
--   with the same officiant — even if every application/trigger guard is
--   bypassed (bulk COPY, session_replication_role='replica' which disables
--   triggers but NOT constraints, a buggy client, or direct SQL).
--
--   It complements (does not replace) the trg_calendar_overlap BEFORE trigger
--   installed by churchos-saas-authz-fix.sql / churchos-saas-ALL.sql: the
--   trigger raises a friendlier message first; these constraints are the
--   last line of defense.
--
-- WHEN TO RUN
--   Operator-run, LAST — after ALL other churchos-saas-*.sql files (setup,
--   onboarding, seed, scheduling, portal, billing, reports, security-prep,
--   and alongside/after churchos-saas-authz-fix.sql, whose de-dupe pass
--   removes the planted seed overlap that would otherwise block the
--   constraint build). RE-RUNNABLE (idempotent): guarded DDL throughout.
--   NOT applied by the app; paste into the Supabase SQL editor (PostgreSQL 15).
--
-- TIME MODEL / ASSUMPTIONS (documented, since calendar_events has NO
-- end/duration column — only: id, parish_id, date date, type, officiant,
-- location, data jsonb, client_id):
--   • Model A (server/seed shape): data->>'start' is a timestamp string,
--     optional data->>'end'. Missing/invalid end → 60-minute default block.
--   • Model B (app client shape, written by cloudStore): the `date` column
--     plus data->>'startTime' / data->>'endTime' as 'HH:MM'. Missing/invalid
--     end → 60-minute default block. (The authz-fix trigger only understands
--     Model A, so Model B rows previously had NO overlap protection at all —
--     these constraints cover both.)
--   • public.calendar_event_slot() below is declared IMMUTABLE although
--     text→timestamptz casting technically depends on the session TimeZone
--     GUC. This is safe here because (a) Supabase runs the DB at UTC for all
--     connections, (b) events are only compared WITHIN one parish, so any
--     consistent offset preserves overlap semantics, and (c) PH has no DST.
--     Same trade-off the existing calendar_event_range() helper already makes.
--   • data->>'start'/'end' values, when present, must be valid timestamp
--     strings (they are seed/tool-written); a malformed one will make the
--     constraint build fail loudly — fix the row, re-run.
--   • Blank/NULL location or officiant does not double-book (an unassigned
--     placeholder must not block everything) — matching the trigger.
--
-- HOW TO VERIFY (after running)
--   1) Constraints exist:
--        select conname from pg_constraint
--        where conrelid = 'public.calendar_events'::regclass and contype = 'x';
--      → calendar_events_excl_location_overlap,
--        calendar_events_excl_officiant_overlap
--   2) Live rejection test (needs a role RLS lets write, e.g. service_role;
--      run inside a transaction and roll back):
--        begin;
--        insert into public.calendar_events (parish_id, date, location, officiant, data)
--          select id, date '2030-01-07', 'Main Church', 'Fr. Test',
--                 '{"startTime":"09:00","endTime":"10:00"}'::jsonb
--          from public.parishes limit 1;
--        -- this second insert MUST fail with 23P01 (exclusion_violation,
--        -- raised by the trigger or by these constraints):
--        insert into public.calendar_events (parish_id, date, location, officiant, data)
--          select id, date '2030-01-07', 'Main Church', 'Fr. Other',
--                 '{"startTime":"09:30","endTime":"10:30"}'::jsonb
--          from public.parishes limit 1;
--        rollback;
--
-- ROLLBACK
--   alter table public.calendar_events drop constraint if exists calendar_events_excl_location_overlap;
--   alter table public.calendar_events drop constraint if exists calendar_events_excl_officiant_overlap;
--   drop function if exists public.calendar_event_slot(date, jsonb);
--   (Leave the btree_gist extension installed — other objects may use it.)
--   Note: re-running this file after changing calendar_event_slot() is a
--   no-op while the constraints exist; to rebuild, drop the constraints
--   first (they index the function's output).
-- ══════════════════════════════════════════════════════════════════════════

-- gist opclasses for uuid/text equality alongside range overlap
create extension if not exists btree_gist;

-- ── unified [start,end) slot for BOTH row shapes (see header) ──
-- Separate from calendar_event_range() so the authz-fix trigger's behavior is
-- untouched; this one also understands the app-client shape and guards against
-- reversed/zero-length windows (which tstzrange would reject or match nothing).
create or replace function public.calendar_event_slot(p_date date, p_data jsonb)
returns tstzrange language sql immutable set search_path = public as $$
  select case
    -- Model A: explicit timestamps in data->>'start' / data->>'end'
    when coalesce(p_data->>'start', '') <> '' then
      tstzrange(
        (p_data->>'start')::timestamptz,
        case
          when coalesce(p_data->>'end', '') <> ''
           and (p_data->>'end')::timestamptz > (p_data->>'start')::timestamptz
            then (p_data->>'end')::timestamptz
          else (p_data->>'start')::timestamptz + interval '60 minutes'
        end,
        '[)')
    -- Model B: date column + 'HH:MM' times in data->>'startTime' / 'endTime'
    when p_date is not null
     and coalesce(p_data->>'startTime', '') ~ '^\d{2}:\d{2}$' then
      tstzrange(
        (p_date::text || ' ' || (p_data->>'startTime'))::timestamptz,
        case
          when coalesce(p_data->>'endTime', '') ~ '^\d{2}:\d{2}$'
           and (p_data->>'endTime') > (p_data->>'startTime')  -- zero-padded HH:MM compares lexicographically
            then (p_date::text || ' ' || (p_data->>'endTime'))::timestamptz
          else (p_date::text || ' ' || (p_data->>'startTime'))::timestamptz + interval '60 minutes'
        end,
        '[)')
    else null  -- no usable time window → exempt from the constraints
  end
$$;

-- ── pre-flight: fail LOUDLY if existing rows already violate the invariant ──
-- (No silent data deletion here — this is live operator data, not seed data.
--  authz-fix already removed the known planted seed overlap.)
do $$
declare v_cnt bigint;
begin
  select count(*) into v_cnt
  from public.calendar_events a
  join public.calendar_events b
    on a.parish_id = b.parish_id
   and a.id < b.id
   and public.calendar_event_slot(a.date, a.data) && public.calendar_event_slot(b.date, b.data)
   and (
     (nullif(btrim(coalesce(a.location, '')), '') is not null
       and lower(btrim(a.location)) = lower(btrim(coalesce(b.location, ''))))
     or
     (nullif(btrim(coalesce(a.officiant, '')), '') is not null
       and lower(btrim(a.officiant)) = lower(btrim(coalesce(b.officiant, ''))))
   );
  if v_cnt > 0 then
    raise exception using
      errcode = '23P01',
      message = format('churchos-saas-hardening: %s pre-existing overlapping calendar_events pair(s) block the EXCLUDE constraints', v_cnt),
      hint    = 'List them by re-running the pre-flight SELECT in churchos-saas-hardening.sql as a plain query (drop the count(*) for full rows), reschedule or delete the duplicates, then re-run this file.';
  end if;
end $$;

-- ── EXCLUDE: no two events in the same parish may overlap at one LOCATION ──
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.calendar_events'::regclass
      and conname  = 'calendar_events_excl_location_overlap'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_excl_location_overlap
      exclude using gist (
        parish_id with =,
        (lower(btrim(location))) with =,
        (public.calendar_event_slot(date, data)) with &&
      )
      where (
        nullif(btrim(coalesce(location, '')), '') is not null
        and public.calendar_event_slot(date, data) is not null
      );
  end if;
end $$;

-- ── EXCLUDE: no two events in the same parish may overlap for one OFFICIANT ──
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.calendar_events'::regclass
      and conname  = 'calendar_events_excl_officiant_overlap'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_excl_officiant_overlap
      exclude using gist (
        parish_id with =,
        (lower(btrim(officiant))) with =,
        (public.calendar_event_slot(date, data)) with &&
      )
      where (
        nullif(btrim(coalesce(officiant, '')), '') is not null
        and public.calendar_event_slot(date, data) is not null
      );
  end if;
end $$;
