-- ════════════════════════════════════════════════════════════════════════
-- Calendar double-booking race — serialize the overlap check per parish.
--
-- guard_calendar_overlap() (20260712120007) checks for an overlapping event
-- and then lets the INSERT proceed. That is read → check → write: a
-- concurrent insert's row is uncommitted, so the check cannot see it.
-- PROVEN LIVE 2026-10-08 against the VERBATIM chain functions on a throwaway
-- Postgres 16 (10 secretaries booking Fr. Reyes / Main Church / 10:00 at the
-- same instant):
--   • one at a time            → 2nd insert refused (the trigger works)
--   • trigger alone, concurrent → 10/10 inserted — Fr. Reyes booked 10 times
--   • trigger + the two EXCLUDE constraints (0001/0005) → 1/10 inserted, but
--     ALL 9 losers got 40P01 "deadlock detected" (two exclusion indexes
--     checked by concurrent inserts), never the 23P01 "calendar conflict"
--     the UI is written to explain.
--
-- Fix: one transaction-scoped advisory lock per parish, taken before the
-- check. Same-parish calendar writes queue; each runs its check after the
-- previous one committed, so the loser gets the friendly 23P01. One lock
-- per transaction means no lock-ordering deadlock. Calendar writes are a
-- handful per parish per day, so serializing them per parish costs nothing.
-- The EXCLUDE constraints stay as the database's own backstop.
--
-- Second change: the window now comes from calendar_event_slot(date, data),
-- the SAME function the EXCLUDE constraints use. calendar_event_range(data)
-- only understood data->>'start', so events stored as date + 'HH:MM'
-- startTime (Model B) were never checked by the trigger at all, and a
-- data->>'end' earlier than 'start' made it throw a range error. Trigger
-- and constraint now agree on what "overlap" means.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.guard_calendar_overlap()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_range tstzrange; v_conflict record;
begin
  v_range := public.calendar_event_slot(new.date, new.data);
  if v_range is null then
    return new;  -- no usable time window → nothing to check
  end if;

  -- Serialize same-parish calendar writes so the check below sees every
  -- committed booking (READ COMMITTED takes a fresh snapshot per statement).
  perform pg_advisory_xact_lock(hashtext('public.calendar_events'), hashtext(new.parish_id::text));

  select id, officiant, location, data->>'start' as starts
    into v_conflict
  from public.calendar_events e
  where e.parish_id = new.parish_id
    and (tg_op = 'INSERT' or e.id <> new.id)
    and public.calendar_event_slot(e.date, e.data) && v_range
    and (
      (nullif(btrim(coalesce(new.officiant,'')),'') is not null
        and lower(btrim(new.officiant)) = lower(btrim(coalesce(e.officiant,''))))
      or
      (nullif(btrim(coalesce(new.location,'')),'') is not null
        and lower(btrim(new.location)) = lower(btrim(coalesce(e.location,''))))
    )
  limit 1;

  if found then
    raise exception 'calendar conflict: % overlaps existing event % (officiant/location busy at that time)',
      coalesce(new.data->>'title', new.type, 'event'), v_conflict.id
      using errcode = '23P01';  -- exclusion_violation
  end if;
  return new;
end $$;
