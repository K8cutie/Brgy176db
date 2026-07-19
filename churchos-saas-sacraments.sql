-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS — Agentic Sacrament engine  (baptism · wedding · confirmation · funeral)
-- Generalizes churchos-saas-baptism.sql: ONE state machine + human gate + append-
-- only audit + capacity for every register-terminating sacrament, discriminated by
-- `sacrament`. On completion the register write DISPATCHES to the right book:
--   baptism→baptism_records · wedding→marriage_records
--   confirmation→confirmation_records · funeral→death_records
-- Run AFTER setup/portal/scheduling/authz-fix. REPLACES the (empty) baptism_* objects.
-- Re-runnable. Per-sacrament requirements come from sacramentRequirements.ts; per-
-- sacrament fees from public_config.fees[sacrament]; batch via availability_slots.capacity.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. Retire the baptism-specific objects (empty → safe; preflight confirms) ─
drop trigger if exists trg_normalize_baptism on public.baptism_requests;
drop trigger if exists trg_guard_baptism_approval on public.baptism_requests;
drop trigger if exists trg_touch_baptism on public.baptism_requests;
drop trigger if exists trg_log_baptism_event on public.baptism_requests;
drop trigger if exists trg_baptism_events_no_mutate on public.baptism_events;
drop function if exists public.normalize_baptism() cascade;
drop function if exists public.guard_baptism_approval() cascade;
drop function if exists public.log_baptism_event() cascade;
drop function if exists public.guard_baptism_events_append_only() cascade;
drop function if exists public.baptism_status(uuid) cascade;
drop function if exists public.baptism_claim_slot(uuid,uuid) cascade;
drop function if exists public.baptism_choose_slot(uuid,uuid) cascade;
drop function if exists public.baptism_submit(uuid,uuid,text,date,text,text,text,jsonb) cascade;
drop table if exists public.baptism_events cascade;
drop table if exists public.baptism_requests cascade;

-- ── 1. The request — one state machine for every register-terminating sacrament ──
create table if not exists public.sacrament_requests (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  public_token uuid not null default gen_random_uuid(),
  sacrament text not null check (sacrament in ('baptism','wedding','confirmation','funeral')),
  status text not null default 'submitted' check (status in (
    'submitted','intake_review','awaiting_documents','awaiting_parishioner','eligibility_check',
    'scheduling','seminar_enrollment','pending_approval','changes_requested',
    'approved','booked','awaiting_rite','completed','declined','cancelled'
  )),
  subject_name text,                 -- child / candidate / deceased / "Bride & Groom"
  subject_date date,                 -- dob / date of death / null
  requester_name text, requester_email text, requester_phone text,
  requested_date date,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  eligibility jsonb not null default '{}'::jsonb check (jsonb_typeof(eligibility) = 'object'),
  stipend numeric,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','waived')),
  scheduled_slot_id uuid references public.availability_slots on delete set null,
  approved_by uuid, approved_at timestamptz, approval_note text,
  register_id uuid,                  -- the register row (table chosen by `sacrament`); no single FK
  client_id text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists idx_sacrament_parish_status on public.sacrament_requests(parish_id, sacrament, status);
create index if not exists idx_sacrament_token on public.sacrament_requests(public_token);
create unique index if not exists uq_sacrament_client on public.sacrament_requests(parish_id, client_id) where client_id is not null;

-- ── 2. Append-only event log ─────────────────────────────────────────────────
create table if not exists public.sacrament_events (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  request_id uuid references public.sacrament_requests on delete cascade not null,
  ts timestamptz not null default now(),
  action text not null, from_status text, to_status text,
  actor text, actor_uid uuid, note text,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object')
);
create index if not exists idx_sacrament_events_req on public.sacrament_events(request_id, ts);

-- ── 3. Server-forced intake (public can only create a clean 'submitted' row) ──
create or replace function public.normalize_sacrament()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare ip text;
begin
  if public.is_untrusted_client_write() then
    if not exists (select 1 from public.parishes
                   where id = new.parish_id and (public_config->>'intake_enabled') = 'true') then
      raise exception 'this parish is not accepting online requests';
    end if;
    ip := public.client_ip();
    perform public.rate_check('sacrament:' || ip || ':' || new.parish_id::text, 5,  '1 minute');
    perform public.rate_check('sacrament:parish:' || new.parish_id::text,        30, '1 minute');
    if length(coalesce(new.details, '{}'::jsonb)::text) > 8000 then raise exception 'request details too large'; end if;

    new.status         := 'submitted';
    new.payment_status := 'unpaid';
    new.eligibility    := '{}'::jsonb;
    new.approved_by := null; new.approved_at := null; new.approval_note := null;
    new.register_id := null; new.scheduled_slot_id := null;
    new.public_token := coalesce(new.public_token, gen_random_uuid());
    new.stipend := coalesce((select (public_config->'fees'->>new.sacrament)::numeric
                             from public.parishes where id = new.parish_id), 0);
    new.requester_name  := left(regexp_replace(coalesce(new.requester_name, ''),  '[\r\n]', ' ', 'g'), 120);
    new.requester_email := left(regexp_replace(coalesce(new.requester_email, ''), '[\r\n]', '',  'g'), 200);
    new.requester_phone := left(regexp_replace(coalesce(new.requester_phone, ''), '[\r\n]', '',  'g'), 40);
    new.subject_name    := left(regexp_replace(coalesce(new.subject_name, ''),    '[\r\n]', ' ', 'g'), 200);
    if new.requested_date is not null and (new.requested_date < current_date
         or new.requested_date > current_date + interval '2 years') then
      raise exception 'requested date is out of range';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_normalize_sacrament on public.sacrament_requests;
create trigger trg_normalize_sacrament before insert on public.sacrament_requests
  for each row execute function public.normalize_sacrament();

-- ── 4. THE HUMAN GATE + register dispatch on completion ──────────────────────
-- A signed-in parish staffer (the secretary) approves; the AI never does. No
-- booking/completion before an approval is recorded; WHO/WHEN stamped server-side.
-- On 'completed' the immutable register row is written to the sacrament's own book.
create or replace function public.guard_sacrament_approval()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_role text; v_reg uuid; v_no text; v_data jsonb;
begin
  if public.is_untrusted_client_write() then
    v_role := public.auth_role();
    if new.status in ('approved','declined') and old.status is distinct from new.status then
      if coalesce(v_role,'') not in ('secretary','priest','finance_council','diocese_admin','bishop') then
        raise exception 'approval requires a signed-in parish staff account (role: %)', coalesce(v_role,'none');
      end if;
    end if;
    if new.status in ('booked','awaiting_rite','completed') and old.status is distinct from new.status then
      if old.approved_at is null and new.approved_at is null then
        raise exception 'a sacrament cannot be booked or completed before it is approved';
      end if;
    end if;
    if new.status = 'approved' and old.status is distinct from 'approved' then
      new.approved_by := auth.uid(); new.approved_at := now();
    end if;

    if new.status = 'completed' and old.status is distinct from 'completed' and new.register_id is null then
      v_no := coalesce(nullif(new.details->>'registryNumber',''),
                upper(left(new.sacrament,3))||'-'||to_char(coalesce(new.requested_date,current_date),'YYYY')
                ||'-'||substr(new.id::text,1,8));
      v_data := jsonb_build_object('subjectName', new.subject_name,
                'date', coalesce(new.requested_date,current_date),
                'parties', coalesce(new.details->'parties','[]'::jsonb), 'stipend', new.stipend,
                'source','sacrament_request', 'sacrament', new.sacrament, 'requestId', new.id);
      if new.sacrament = 'baptism' then
        insert into public.baptism_records(parish_id,registry_number,date_of_baptism,data,client_id)
        values(new.parish_id,v_no,coalesce(new.requested_date,current_date),v_data,'sac-'||substr(new.id::text,1,12))
        returning id into v_reg;
      elsif new.sacrament = 'wedding' then
        insert into public.marriage_records(parish_id,registry_number,date_of_marriage,data,client_id)
        values(new.parish_id,v_no,coalesce(new.requested_date,current_date),v_data,'sac-'||substr(new.id::text,1,12))
        returning id into v_reg;
      elsif new.sacrament = 'confirmation' then
        insert into public.confirmation_records(parish_id,registry_number,date_of_confirmation,data,client_id)
        values(new.parish_id,v_no,coalesce(new.requested_date,current_date),v_data,'sac-'||substr(new.id::text,1,12))
        returning id into v_reg;
      elsif new.sacrament = 'funeral' then
        insert into public.death_records(parish_id,registry_number,date_of_burial,data,client_id)
        values(new.parish_id,v_no,coalesce(new.requested_date,current_date),v_data,'sac-'||substr(new.id::text,1,12))
        returning id into v_reg;
      end if;
      new.register_id := v_reg;
    elsif new.register_id is distinct from old.register_id then
      new.register_id := old.register_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_sacrament_approval on public.sacrament_requests;
create trigger trg_guard_sacrament_approval before update on public.sacrament_requests
  for each row execute function public.guard_sacrament_approval();

drop trigger if exists trg_touch_sacrament on public.sacrament_requests;
create trigger trg_touch_sacrament before update on public.sacrament_requests
  for each row execute function public.touch_updated_at();

-- ── 5. Automatic append-only audit ───────────────────────────────────────────
create or replace function public.log_sacrament_event()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_actor text; v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is not null then
    select coalesce(nullif(btrim(full_name),''), v_uid::text) into v_actor from public.profiles where id = v_uid;
    v_actor := coalesce(v_actor, v_uid::text);
  else v_actor := 'parishioner'; end if;

  if tg_op = 'INSERT' then
    insert into public.sacrament_events(parish_id, request_id, action, from_status, to_status, actor, actor_uid)
    values (new.parish_id, new.id, 'submitted', null, new.status, v_actor, v_uid);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.sacrament_events(parish_id, request_id, action, from_status, to_status, actor, actor_uid, note)
    values (new.parish_id, new.id, 'status_change', old.status, new.status, v_actor, v_uid, new.approval_note);
    if new.status = 'approved' then
      insert into public.sacrament_events(parish_id, request_id, action, from_status, to_status, actor, actor_uid, note, data)
      values (new.parish_id, new.id, 'notify_queued', old.status, new.status, v_actor, v_uid,
              'approved — notify priest + finance head',
              jsonb_build_object('recipients', jsonb_build_array('priest','finance_council'), 'reason','approval'));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_log_sacrament_event on public.sacrament_requests;
create trigger trg_log_sacrament_event after insert or update on public.sacrament_requests
  for each row execute function public.log_sacrament_event();

create or replace function public.guard_sacrament_events_append_only()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if public.is_untrusted_client_write() then raise exception 'sacrament_events is append-only'; end if;
  return null;
end $$;
drop trigger if exists trg_sacrament_events_no_mutate on public.sacrament_events;
create trigger trg_sacrament_events_no_mutate before update or delete on public.sacrament_events
  for each row execute function public.guard_sacrament_events_append_only();

-- ── 6. RLS — anon may only SUBMIT; staff manage their parish; diocese reads ───
alter table public.sacrament_requests enable row level security;
alter table public.sacrament_requests force row level security;
drop policy if exists sacrament_public_submit on public.sacrament_requests;
create policy sacrament_public_submit on public.sacrament_requests for insert to anon with check (status = 'submitted');
drop policy if exists sacrament_parish_all on public.sacrament_requests;
create policy sacrament_parish_all on public.sacrament_requests for all to authenticated
  using (parish_id = auth_parish_id()) with check (parish_id = auth_parish_id());
-- Parishioner/sacrament PII stays PARISH-LOCAL (RA 10173), consistent with migration
-- 20260712120008_diocese_read_pii_scopedown. Diocese roles do NOT read raw sacrament
-- rows (subject_name/date, requester_*, eligibility) across parishes. We DROP any policy
-- an earlier apply left behind and DO NOT (re)create it — so this out-of-chain layer is
-- safe regardless of its apply order relative to 0008 (which drops it only `if exists`,
-- a no-op on a fresh build where these tables don't yet exist).
drop policy if exists sacrament_diocese_read on public.sacrament_requests;

alter table public.sacrament_events enable row level security;
alter table public.sacrament_events force row level security;
drop policy if exists sacrament_events_parish_all on public.sacrament_events;
create policy sacrament_events_parish_all on public.sacrament_events for all to authenticated
  using (parish_id = auth_parish_id()) with check (parish_id = auth_parish_id());
-- Parish-local (see sacrament_requests above); diocese-read intentionally NOT re-created.
drop policy if exists sacrament_events_diocese_read on public.sacrament_events;

-- ── 7. Anon status lookup by token ───────────────────────────────────────────
create or replace function public.sacrament_status(p_token uuid)
returns table(sacrament text, status text, subject_name text, requested_date date, stipend numeric, payment_status text)
language sql stable security definer set search_path = public as $$
  select sacrament, status, subject_name, requested_date, stipend, payment_status
  from public.sacrament_requests where public_token = p_token;
$$;
revoke all on function public.sacrament_status(uuid) from public;
grant execute on function public.sacrament_status(uuid) to anon, authenticated;

-- ── 8. Scheduling — capacity (batch = per-parish setting) + slot-type widening ─
alter table public.availability_slots add column if not exists capacity int not null default 1;
do $$ begin
  alter table public.availability_slots add constraint chk_slot_capacity check (capacity between 1 and 200);
exception when duplicate_object then null; end $$;
-- widen the slot-type CHECK to include confirmation (was baptism/wedding/funeral)
do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid='public.availability_slots'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%type%baptism%'
  loop execute format('alter table public.availability_slots drop constraint %I', c); end loop;
  begin
    alter table public.availability_slots
      add constraint availability_slots_type_check check (type in ('baptism','wedding','confirmation','funeral'));
  exception when duplicate_object then null; end;
end $$;

-- Atomically claim one place in a slot (race-safe; slot type must match the sacrament).
create or replace function public.sacrament_claim_slot(p_request_id uuid, p_slot_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_req_parish uuid; v_status text; v_sacr text; v_cap int; v_used int;
        v_slot_parish uuid; v_slot_type text; v_slot_at timestamptz;
begin
  select parish_id, status, sacrament into v_req_parish, v_status, v_sacr
    from public.sacrament_requests where id = p_request_id;
  if v_req_parish is null then raise exception 'request not found'; end if;
  if auth.uid() is not null and v_req_parish is distinct from public.auth_parish_id() then
    raise exception 'not authorized'; end if;
  if v_status in ('cancelled','declined','completed') then raise exception 'request is not schedulable'; end if;
  select parish_id, type, capacity, slot_at into v_slot_parish, v_slot_type, v_cap, v_slot_at
    from public.availability_slots where id = p_slot_id for update;
  if v_slot_parish is null then raise exception 'slot not found'; end if;
  if v_slot_parish is distinct from v_req_parish then raise exception 'slot belongs to another parish'; end if;
  if v_slot_type is distinct from v_sacr then raise exception 'slot type % does not match sacrament %', v_slot_type, v_sacr; end if;
  select count(*) into v_used from public.sacrament_requests
    where scheduled_slot_id = p_slot_id and id <> p_request_id and status not in ('cancelled','declined');
  if v_used >= v_cap then raise exception 'this date is fully booked'; end if;
  update public.sacrament_requests
     set scheduled_slot_id = p_slot_id, requested_date = coalesce(v_slot_at::date, requested_date)
   where id = p_request_id;
  if v_used + 1 >= v_cap then
    update public.availability_slots set status = 'booked' where id = p_slot_id; end if;
end $$;
revoke all on function public.sacrament_claim_slot(uuid,uuid) from public;
grant execute on function public.sacrament_claim_slot(uuid,uuid) to authenticated;

-- Anon picks an offered alternative via token.
create or replace function public.sacrament_choose_slot(p_token uuid, p_slot_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  select id into v_id from public.sacrament_requests where public_token = p_token;
  if v_id is null then raise exception 'request not found'; end if;
  perform public.sacrament_claim_slot(v_id, p_slot_id);
  update public.sacrament_requests set status = 'scheduling' where id = v_id and status = 'awaiting_parishioner';
end $$;
revoke all on function public.sacrament_choose_slot(uuid,uuid) from public;
grant execute on function public.sacrament_choose_slot(uuid,uuid) to anon, authenticated;

-- ── 9. Slot-first submit (Calendly path). p_slot NULL = no pre-published slot
-- (e.g. an urgent funeral the office schedules by hand). Returns the public_token.
create or replace function public.sacrament_submit(
  p_parish uuid, p_sacrament text, p_slot uuid,
  p_subject_name text, p_subject_date date,
  p_requester_name text, p_requester_email text, p_requester_phone text,
  p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid; v_token uuid;
begin
  insert into public.sacrament_requests
    (parish_id, sacrament, subject_name, subject_date, requested_date,
     requester_name, requester_email, requester_phone, details)
  values
    (p_parish, p_sacrament, p_subject_name, p_subject_date,
     (select slot_at::date from public.availability_slots where id = p_slot),
     p_requester_name, p_requester_email, p_requester_phone, coalesce(p_details,'{}'::jsonb))
  returning id, public_token into v_id, v_token;
  if p_slot is not null then perform public.sacrament_claim_slot(v_id, p_slot); end if;
  return v_token;
end $$;
revoke all on function public.sacrament_submit(uuid,text,uuid,text,date,text,text,text,jsonb) from public;
grant execute on function public.sacrament_submit(uuid,text,uuid,text,date,text,text,text,jsonb) to anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- Verify: baptism_* gone, sacrament_* present w/ RLS; register dispatch on
-- 'completed' writes baptism/marriage/confirmation/death _records by sacrament;
-- non-staff approve → RAISE; book-before-approve → RAISE; fully-booked → RAISE;
-- claim a mismatched slot type → RAISE.
-- ══════════════════════════════════════════════════════════════════════════
