-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS — self-service scheduling (Calendly-for-sacraments)
-- Run AFTER churchos-saas-portal.sql (+ security-prep for rate_check). The parish
-- calendar stays LOCAL; the desktop publishes only DERIVED open slots (computed
-- from availability rules − existing events − the 1-hr transition buffer). The
-- public site shows open slots; a parishioner reserves one ATOMICALLY (no
-- double-booking); the secretary confirms → it becomes a calendar event.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  type text not null check (type in ('baptism','wedding','funeral')),
  slot_at timestamptz not null,
  duration_min int not null default 60,
  status text not null default 'open' check (status in ('open','held','booked')),
  request_id uuid references public.service_requests on delete set null,
  held_until timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (parish_id, type, slot_at)
);
create index if not exists idx_slots_parish_open on public.availability_slots(parish_id, type, slot_at) where status = 'open';

alter table public.availability_slots enable row level security;
alter table public.availability_slots force row level security;
-- Public sees only OPEN, future slots (to render the picker). No writes by anon.
drop policy if exists slots_public_read on public.availability_slots;
create policy slots_public_read on public.availability_slots for select to anon
  using (status = 'open' and slot_at > now());
-- Parish staff publish + manage their own parish's slots.
drop policy if exists slots_parish_all on public.availability_slots;
create policy slots_parish_all on public.availability_slots for all to authenticated
  using (parish_id = auth_parish_id()) with check (parish_id = auth_parish_id());

-- ── Reserve a slot (anon) — atomic claim + create the booking ticket, returns the token ──
create or replace function public.reserve_slot(p_slot uuid, p_name text, p_email text, p_phone text, p_details jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_type text; v_at timestamptz; v_token uuid := gen_random_uuid(); v_req uuid; v_fee numeric; ip text;
begin
  ip := coalesce(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1), 'unknown');
  perform public.rate_check('reserve:ip:' || ip, 10, '1 minute');
  if length(coalesce(p_details::text, '{}')) > 8000 then raise exception 'details too large'; end if;
  -- Multi-dimensional limits (red-team: IP rotation + hold-and-never-pay griefing):
  -- cap reservations + concurrent holds per email so one actor can't exhaust a
  -- small parish's whole 2-month window.
  if coalesce(btrim(p_email), '') <> '' then
    perform public.rate_check('reserve:email:' || lower(btrim(p_email)), 5, '1 hour');
    if (select count(*) from public.availability_slots s join public.service_requests r on r.id = s.request_id
        where s.status = 'held' and lower(r.requester_email) = lower(btrim(p_email))) >= 3 then
      raise exception 'you already have pending bookings — please wait for the parish to confirm';
    end if;
  end if;

  -- Atomic claim: only ONE concurrent caller can flip an open slot to held.
  update public.availability_slots
    set status = 'held', held_until = now() + interval '30 minutes', updated_at = now()
    where id = p_slot and status = 'open' and slot_at > now()
    returning parish_id, type, slot_at into v_pid, v_type, v_at;
  if v_pid is null then raise exception 'that time is no longer available — please pick another'; end if;

  v_fee := coalesce((select (public_config->'fees'->>'event_booking')::numeric from public.parishes where id = v_pid), 0);
  insert into public.service_requests
    (parish_id, public_token, type, status, requester_name, requester_email, requester_phone, requested_date, details, amount, payment_status)
  values
    (v_pid, v_token, 'event_booking', 'submitted',
     left(regexp_replace(coalesce(p_name, ''),  '[\r\n]', ' ', 'g'), 120),
     left(regexp_replace(coalesce(p_email, ''), '[\r\n]', '',  'g'), 200),
     left(regexp_replace(coalesce(p_phone, ''), '[\r\n]', '',  'g'), 40),
     v_at::date,
     coalesce(p_details, '{}'::jsonb) || jsonb_build_object('event_type', v_type, 'slot_at', v_at),
     v_fee, 'unpaid')
  returning id into v_req;
  update public.availability_slots set request_id = v_req where id = p_slot;
  return v_token;
end $$;
revoke all on function public.reserve_slot(uuid, text, text, text, jsonb) from public;
grant execute on function public.reserve_slot(uuid, text, text, text, jsonb) to anon, authenticated;

-- ── Keep the slot in lockstep with the ticket the secretary works ──
create or replace function public.sync_slot_from_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Guard on request_id = NEW.id AND parish match: a stale edit on an OLD request
  -- (whose slot was since reopened + re-reserved) can't touch the new owner's slot,
  -- and no cross-parish slot write is possible. (red-team: stale-request / cross-parish)
  if new.status = 'confirmed' then
    update public.availability_slots set status = 'booked', updated_at = now()
      where request_id = new.id and parish_id = new.parish_id;
  elsif new.status in ('rejected', 'cancelled') then
    update public.availability_slots set status = 'open', held_until = null, request_id = null, updated_at = now()
      where request_id = new.id and parish_id = new.parish_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_slot on public.service_requests;
create trigger trg_sync_slot after update of status on public.service_requests
  for each row execute function public.sync_slot_from_request();

-- ── Release abandoned holds (run on each desktop publish / sync) ──
create or replace function public.release_expired_holds()
returns void language sql security definer set search_path = public as $$
  -- Only release ABANDONED/orphaned holds — never yank a slot out from under a
  -- parishioner whose booking is still active (red-team: release-yanks-mid-confirm).
  update public.availability_slots s set status = 'open', held_until = null, request_id = null, updated_at = now()
  where s.status = 'held' and s.held_until < now()
    and not exists (select 1 from public.service_requests r
                    where r.id = s.request_id and r.status in ('submitted', 'in_review', 'scheduled'));
$$;
grant execute on function public.release_expired_holds() to authenticated;

-- Verify: select type, slot_at, status from public.availability_slots order by slot_at;
