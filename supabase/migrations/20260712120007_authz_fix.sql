-- ══════════════════════════════════════════════════════════════════════════
-- 20260712120007_authz_fix.sql
-- BACK-PORT of churchos-saas-authz-fix.sql into the canonical migration chain.
-- These fixes were applied to the LIVE DB out-of-band on 2026-07-13 but were
-- never in supabase/migrations/, so any fresh tenant / db reset / db push was
-- born WITHOUT them (verify_audit cross-parish read; rate_limits open to the
-- anon key; client_ip() undefined; audit back-dating; >=100k approval bypass).
-- Runs LAST — depends on objects from 0001..0006. Idempotent (create-or-replace
-- + guarded DDL), so re-applying against the already-patched live DB is a no-op.
-- Source of truth reconciled: keep this file == churchos-saas-authz-fix.sql.
-- ══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — corrective AUTHZ + calendar-overlap fix
-- Run AFTER the 8 churchos-saas-*.sql files. RE-RUNNABLE (idempotent):
-- uses `create or replace function` for the fixed guards/RPCs and guarded DDL.
-- Does NOT rewrite the original schema files.
--
-- Fixes:
--   BUG-1 (CRITICAL) profile self-elevation / tenant-hop. The original guard
--     functions gate on `current_user in ('authenticated','anon')`, but they are
--     SECURITY DEFINER so inside them `current_user` (and `session_user`) is the
--     owner `postgres` — the gate is dead code and never fires. A parish user
--     can UPDATE their own profiles.role / parish_id / diocese_id and hop tenants.
--   BUG-2 (MEDIUM) no calendar overlap detection: two events for the same parish
--     + same officiant/location overlapping in time both persist silently.
--
-- Detection mechanism for "untrusted direct user write" inside a DEFINER trigger:
--   • current_user / session_user are USELESS here (always 'postgres').
--   • auth.role() IS reliable — it is JWT-derived from the per-request GUC
--     `request.jwt.claims`, which survives the SECURITY DEFINER boundary.
--     Proven: inside a definer trigger, current_user=postgres but
--     auth.role()='authenticated'.
--   • But auth.role() ALSO returns 'authenticated' inside the legit onboarding
--     RPCs (onboard_new_admin / accept_invite), which run as DEFINER yet inherit
--     the caller's JWT. So auth.role() alone would wrongly block them too.
--   • Therefore: a transaction-local CAPABILITY GUC `app.privileged_write`.
--     SUBTLETY: a custom GUC like app.privileged_write CAN be set by the
--     `authenticated` role itself (verified: `set local app.privileged_write='on'`
--     succeeds as that role). So a constant 'on' flag is SPOOFABLE in principle.
--     We therefore make the capability an UNGUESSABLE SECRET NONCE: the legit RPCs
--     read a per-install secret from public.app_secrets (RLS-locked, readable only
--     by SECURITY DEFINER functions — never by anon/authenticated) and set the GUC
--     to that value; the guard compares the GUC against the same secret. A client
--     cannot read the secret, so cannot forge the capability even if it can set
--     the GUC name. The GUC is transaction-local (set_config(...,true)).
--   • service_role (backend / seed) is auth.role()='service_role' → not gated.
-- ══════════════════════════════════════════════════════════════════════════

-- ── per-install privileged-write capability secret (unguessable nonce) ──
-- Stored in app_secrets, which is RLS-locked + revoked from anon/authenticated,
-- so only SECURITY DEFINER functions can read it. An authenticated client can set
-- the GUC NAME but cannot learn this value, so cannot forge the capability.
insert into public.app_secrets (key, value)
  select 'privileged_write_token', encode(gen_random_bytes(32), 'hex')
  where not exists (select 1 from public.app_secrets where key = 'privileged_write_token');

create or replace function public.privileged_write_token() returns text
  language sql stable security definer set search_path = public as
$$ select value from public.app_secrets where key = 'privileged_write_token' $$;
revoke all on function public.privileged_write_token() from public, anon, authenticated;

-- legit RPCs call this to grant the capability for the rest of the txn (or to
-- revoke it). Sets the GUC to the secret nonce (or clears it). DEFINER so it can
-- read the secret; not granted to clients.
create or replace function public.grant_privileged_write(p_on boolean)
  returns void language plpgsql security definer set search_path = public as
$$ begin
     perform set_config('app.privileged_write',
       case when p_on then public.privileged_write_token() else '' end, true);
   end $$;
revoke all on function public.grant_privileged_write(boolean) from public, anon, authenticated;

-- ── small helper: is this an untrusted direct write by a public API client? ──
-- TRUE only for authenticated/anon callers that have NOT been granted the
-- transaction-local privileged-write capability. service_role, the owner, and
-- the legit DEFINER RPCs (which set the capability) all return FALSE.
create or replace function public.is_untrusted_client_write()
returns boolean language plpgsql stable security definer set search_path = public, auth as $$
declare v_role text; v_priv text;
begin
  -- JWT-derived role (survives the SECURITY DEFINER boundary, unlike current_user)
  begin v_role := auth.role(); exception when others then v_role := null; end;
  -- service_role and the owner are always trusted, regardless of the GUC.
  if coalesce(v_role,'') not in ('authenticated','anon') then
    return false;
  end if;
  -- transaction-local capability: must equal the unguessable per-install secret.
  -- A client can set the GUC name but cannot know this value → cannot forge it.
  v_priv := current_setting('app.privileged_write', true);
  if coalesce(v_priv,'') <> '' and v_priv = public.privileged_write_token() then
    return false;                       -- legit RPC opted in with the real token
  end if;
  return true;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-1a — freeze server-owned profile columns against direct user writes
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.guard_profile_columns()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  -- Detect the caller via auth.role()+capability GUC, NOT current_user:
  -- current_user is always 'postgres' inside this SECURITY DEFINER body.
  if public.is_untrusted_client_write() then
    -- Freeze the trust/tenancy + server-owned columns to their old values, so a
    -- direct PostgREST UPDATE cannot self-promote or tenant-hop. A normal edit
    -- (e.g. full_name) still succeeds — only these columns revert.
    new.role       := old.role;
    new.parish_id  := old.parish_id;
    new.diocese_id := old.diocese_id;
    new.email      := old.email;        -- email is server-owned (set from auth.users)
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_columns();

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-1b — force parish_id on INSERT to the caller's own parish
-- (defense-in-depth alongside the RLS WITH CHECK; previously dead code)
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.force_parish_id()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if public.is_untrusted_client_write() then
    new.parish_id := auth_parish_id();
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-1c — fee_override_audit stays append-only against users
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.guard_audit_append_only()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if public.is_untrusted_client_write() then
    raise exception 'fee_override_audit is append-only';
  end if;
  return null;  -- (only reached for trusted callers on UPDATE/DELETE)
end $$;
drop trigger if exists trg_audit_no_mutate on public.fee_override_audit;
create trigger trg_audit_no_mutate before update or delete on public.fee_override_audit
  for each row execute function public.guard_audit_append_only();

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-1d — teach the legit onboarding RPCs to opt in to privileged writes.
-- These are the ONLY sanctioned places a role/parish/diocese is assigned to a
-- profile from an authenticated session. They re-validate the caller, then set
-- the transaction-local capability so guard_profile_columns lets the assignment
-- through. Bodies are otherwise byte-for-byte identical to the originals.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.onboard_new_admin(p_diocese text, p_parish text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_did uuid; v_pid uuid; v_prof public.profiles;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_diocese),'') = '' or coalesce(btrim(p_parish),'') = '' then
    raise exception 'diocese and parish names are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  select * into v_prof from public.profiles where id = v_uid for update;
  if v_prof.diocese_id is not null or v_prof.parish_id is not null then
    raise exception 'this account already belongs to a diocese';
  end if;

  insert into public.dioceses (name) values (btrim(p_diocese)) returning id into v_did;
  insert into public.parishes (diocese_id, name, billing_status) values (v_did, btrim(p_parish), 'trial') returning id into v_pid;
  perform public.grant_privileged_write(true);   -- sanctioned trust-column write (txn-local, secret-gated)
  update public.profiles set role = 'diocese_admin', diocese_id = v_did, parish_id = v_pid where id = v_uid;
  perform public.grant_privileged_write(false);
  return jsonb_build_object('diocese_id', v_did, 'parish_id', v_pid);
end $$;

create or replace function public.accept_invite(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text := public.my_email(); v_inv public.parish_invites; v_cur uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select diocese_id into v_cur from public.profiles where id = v_uid;
  if v_cur is not null then raise exception 'this account already belongs to a diocese'; end if;

  update public.parish_invites set status = 'accepted'
    where token = p_token and status = 'pending' and lower(email) = lower(coalesce(v_email,''))
    returning * into v_inv;
  if v_inv.id is null then raise exception 'invite not found, already used, or for a different email'; end if;
  if v_inv.role not in ('secretary','priest','finance_council') then raise exception 'invalid invite role'; end if;

  perform public.grant_privileged_write(true);   -- sanctioned trust-column write (txn-local, secret-gated)
  update public.profiles set parish_id = v_inv.parish_id, diocese_id = v_inv.diocese_id, role = v_inv.role where id = v_uid;
  perform public.grant_privileged_write(false);
  return jsonb_build_object('parish_id', v_inv.parish_id, 'role', v_inv.role);
end $$;
-- keep RPC grants as the original onboarding file set them (authenticated only).

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-2 — calendar overlap prevention for calendar_events
-- A BEFORE INSERT/UPDATE trigger raising on overlap (safer than an exclusion
-- constraint, which would fail to install against the planted overlap and which
-- the jsonb/optional-end time model doesn't fit cleanly).
--
-- Time model: each event has data->>'start' (timestamptz). Optional data->>'end';
-- when absent the event is treated as a 1-hour block [start, start+1h).
-- Conflict = same parish + overlapping [start,end) + (same officiant OR same
-- location), excluding the row itself. NULL/blank officiant & location don't
-- conflict (an unassigned placeholder shouldn't block everything).
-- ════════════════════════════════════════════════════════════════════════

-- helper: derive an event's [start,end) range from its row
create or replace function public.calendar_event_range(p_data jsonb)
returns tstzrange language sql immutable set search_path = public as $$
  select case
    when p_data ? 'start' and coalesce(p_data->>'start','') <> '' then
      tstzrange(
        (p_data->>'start')::timestamptz,
        case
          when p_data ? 'end' and coalesce(p_data->>'end','') <> ''
            then (p_data->>'end')::timestamptz
          else (p_data->>'start')::timestamptz + interval '1 hour'
        end,
        '[)')
    else null
  end
$$;

create or replace function public.guard_calendar_overlap()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_range tstzrange; v_conflict record;
begin
  v_range := public.calendar_event_range(new.data);
  if v_range is null then
    return new;  -- no usable time window → nothing to check
  end if;

  select id, officiant, location, data->>'start' as starts
    into v_conflict
  from public.calendar_events e
  where e.parish_id = new.parish_id
    and (tg_op = 'INSERT' or e.id <> new.id)
    and public.calendar_event_range(e.data) && v_range
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

-- Clean the 1 planted overlap so the BEFORE trigger can be installed against
-- valid data: drop the LATER-created of the two seeded conflicting rows. (The
-- original report flagged exactly one such pair: St. Mary / Main Church /
-- Fr. Reyes / 2026-06-02 10:00.) Idempotent: only acts while a dup exists.
do $$
declare v_drop uuid; r record;
begin
  for r in
    select parish_id, location, officiant, (data->>'start')::timestamptz as st
    from public.calendar_events
    where data ? 'start'
    group by 1,2,3,4 having count(*) > 1
  loop
    -- keep the lowest id of this exact-dup group, drop the rest
    for v_drop in
      select id from public.calendar_events e
      where e.parish_id = r.parish_id and e.location = r.location
        and e.officiant = r.officiant and (e.data->>'start')::timestamptz = r.st
      order by id
      offset 1
    loop
      delete from public.calendar_events where id = v_drop;
      raise notice 'authz-fix: removed planted overlapping calendar_event %', v_drop;
    end loop;
  end loop;
end $$;

drop trigger if exists trg_calendar_overlap on public.calendar_events;
create trigger trg_calendar_overlap before insert or update on public.calendar_events
  for each row execute function public.guard_calendar_overlap();

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-1e — portal intake guard (added after the original fix). Same dead-
-- `current_user` bug: normalize_request is SECURITY DEFINER, so its
-- `current_user in ('anon','authenticated')` gate NEVER fired → the public
-- intake's opt-in / rate-limit / size / CRLF / fee-set guards were all dead.
-- Re-gate on is_untrusted_client_write(). (Trigger already created in portal.sql.)
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.normalize_request()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare ip text; amt jsonb;
begin
  if public.is_untrusted_client_write() then
    if not exists (select 1 from public.parishes where id = new.parish_id and (public_config->>'intake_enabled') = 'true') then
      raise exception 'this parish is not accepting online requests';
    end if;
    ip := public.client_ip();   -- BUG-XFF: trusted-proxy hop, not the client-forged leftmost token
    perform public.rate_check('intake:' || ip || ':' || new.parish_id::text, 10, '1 minute');
    if length(coalesce(new.details, '{}'::jsonb)::text) > 8000 then raise exception 'request details too large'; end if;
    new.status := 'submitted'; new.payment_status := 'unpaid'; new.payment_ref := null;
    new.public_token := coalesce(new.public_token, gen_random_uuid());
    if new.type = 'donation' then
      amt := new.details -> 'amount';
      new.amount := case when jsonb_typeof(amt) = 'number' then least(greatest((amt)::text::numeric, 0), 1000000) else 0 end;
    else
      new.amount := coalesce((select (public_config->'fees'->>new.type)::numeric from public.parishes where id = new.parish_id), 0);
    end if;
    new.requester_name  := left(regexp_replace(coalesce(new.requester_name, ''),  '[\r\n]', ' ', 'g'), 120);
    new.requester_email := left(regexp_replace(coalesce(new.requester_email, ''), '[\r\n]', '',  'g'), 200);
    new.requester_phone := left(regexp_replace(coalesce(new.requester_phone, ''), '[\r\n]', '',  'g'), 40);
    if new.requested_date is not null and (new.requested_date < current_date - interval '1 year'
         or new.requested_date > current_date + interval '2 years') then
      raise exception 'requested date is out of range';
    end if;
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-1g — align the public-intake RLS with BUG-1e's trigger. normalize_request
-- now SERVER-FORCES new.amount (the fee/donation) for untrusted writes, but the
-- req_public_submit policy still required `amount is null` in its WITH CHECK. BEFORE
-- triggers run first, so the post-trigger amount is non-null → the policy rejected
-- 100% of anon submissions (mass intentions, certificates, donations). The trigger is
-- the authoritative amount-forcer, so the policy must NOT constrain amount. Proven via
-- pglite: old policy → RLS reject, fixed policy → accept. (Re-created here so the
-- runs-last fixes file is authoritative; portal.sql + ALL.sql are fixed at source too.)
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists req_public_submit on public.service_requests;
create policy req_public_submit on public.service_requests for insert to anon
  with check (status = 'submitted' and payment_status = 'unpaid' and payment_ref is null);

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-1f — reserve_slot is the sanctioned booking path; it sets the request
-- fields itself, so it must BYPASS normalize_request (whose intake_enabled check
-- would otherwise wrongly block a slot booking on a parish that publishes slots
-- without enabling the generic intake form). Opt in to privileged write around
-- the insert (txn-local, secret-gated — same mechanism as the onboarding RPCs).
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.reserve_slot(p_slot uuid, p_name text, p_email text, p_phone text, p_details jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_type text; v_at timestamptz; v_token uuid := gen_random_uuid(); v_req uuid; v_fee numeric; ip text;
begin
  ip := public.client_ip();   -- BUG-XFF: trusted-proxy hop, not the client-forged leftmost token
  perform public.rate_check('reserve:ip:' || ip, 10, '1 minute');
  if length(coalesce(p_details::text, '{}')) > 8000 then raise exception 'details too large'; end if;
  -- BUG-HOLD-DOS: a real email is REQUIRED so the per-email anti-griefing caps below
  -- ALWAYS apply. Previously a blank (or rotating) email skipped both caps, letting
  -- anon flip every bookable slot of a parish to 'held'.
  if coalesce(btrim(p_email), '') = '' then
    raise exception 'an email address is required to reserve a time';
  end if;
  perform public.rate_check('reserve:email:' || lower(btrim(p_email)), 5, '1 hour');
  if (select count(*) from public.availability_slots s join public.service_requests r on r.id = s.request_id
      where s.status = 'held' and lower(r.requester_email) = lower(btrim(p_email))) >= 3 then
    raise exception 'you already have pending bookings — please wait for the parish to confirm';
  end if;
  -- Per-parish ceiling on concurrent ACTIVE holds, INDEPENDENT of email — so an
  -- attacker rotating email addresses still cannot blanket a parish's published
  -- window in 'held'. Derived from the target slot's parish before the flip.
  select parish_id into v_pid from public.availability_slots where id = p_slot;
  if v_pid is not null and (
       select count(*) from public.availability_slots s
       where s.parish_id = v_pid and s.status = 'held' and coalesce(s.held_until, now()) > now()
     ) >= 20 then
    raise exception 'too many pending reservations for this parish right now — please try again shortly';
  end if;

  update public.availability_slots
    set status = 'held', held_until = now() + interval '30 minutes', updated_at = now()
    where id = p_slot and status = 'open' and slot_at > now()
    returning parish_id, type, slot_at into v_pid, v_type, v_at;
  if v_pid is null then raise exception 'that time is no longer available — please pick another'; end if;

  v_fee := coalesce((select (public_config->'fees'->>'event_booking')::numeric from public.parishes where id = v_pid), 0);
  perform public.grant_privileged_write(true);   -- sanctioned: reserve_slot sets the request fields itself
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
  perform public.grant_privileged_write(false);
  update public.availability_slots set request_id = v_req where id = p_slot;
  return v_token;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-XFF — trustworthy client IP for rate limiting.
-- The rate-limit key derived the client IP as the LEFTMOST X-Forwarded-For token
-- (split_part(...,',',1)). In XFF the leftmost value is the one the CLIENT asserts;
-- the trusted gateway APPENDS the real client address to the RIGHT. So the leftmost
-- token is attacker-controlled — rotating it per request made every request a
-- distinct key and the per-IP caps never accumulated. Take the LAST (trusted-proxy-
-- appended) hop instead. Used by normalize_request (anon intake) and reserve_slot.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.client_ip()
  returns text language plpgsql stable set search_path = public as $$
declare xff text; parts text[];
begin
  xff := nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for';
  if xff is null or btrim(xff) = '' then return 'unknown'; end if;
  parts := string_to_array(xff, ',');
  return coalesce(nullif(btrim(parts[array_length(parts, 1)]), ''), 'unknown');
exception when others then
  return 'unknown';
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-RL — rate_limits table is unprotected. Every domain table uses
-- enable+force RLS or an explicit revoke (see app_secrets); rate_limits got
-- NEITHER, so with the default Supabase grants an anon/authenticated caller can
-- SELECT/DELETE/UPDATE the whole throttle store via PostgREST (wipe counters so no
-- throttle ever trips, or lock a specific user out). rate_check() is SECURITY
-- DEFINER (runs as owner, bypasses this revoke), so throttling keeps working. Do
-- NOT force RLS here or the definer loses access — a plain revoke is the clean fix.
-- ════════════════════════════════════════════════════════════════════════
revoke all on public.rate_limits from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-VERIFY-AUDIT — verify_audit(uuid) was SECURITY DEFINER (bypasses RLS)
-- and granted to every authenticated user with NO tenant check: any signed-in user
-- could pass another parish's uuid (freely enumerable via parish_public(slug)) and
-- read that parish's audit client_ids + integrity flags, across diocese boundaries.
-- Two fixes here:
--   (1) tenant guard — parish-scoped roles may only verify their OWN parish;
--       diocese_admin/bishop only parishes within their OWN diocese.
--   (2) real chain verification — the old body recomputed each row's HMAC in
--       ISOLATION, so a back-dated/misattributed/injected row with a random
--       prev_hash still returned ok=true and an out-of-chain insert was invisible.
--       Now walk the chain from the genesis root by prev_hash→hash linkage: a row
--       is ok ONLY if its own HMAC validates AND it is reachable from a UNIQUE
--       genesis via unbroken linkage. Forked/gapped/injected rows report ok=false.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.verify_audit(p_parish uuid default null)
returns table(client_id text, ok boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare k text; v_role text; v_genesis_count int;
begin
  -- Derive scope from the caller when no parish is given (the app-facing use). A
  -- parish-scoped user thus need not know — or send — any parish uuid.
  if p_parish is null then p_parish := public.auth_parish_id(); end if;
  if p_parish is null then return; end if;   -- no scope (e.g. diocese role, no arg) → nothing
  v_role := public.auth_role();
  if v_role in ('diocese_admin','bishop') then
    if not exists (select 1 from public.parishes
                   where id = p_parish and diocese_id = public.auth_diocese_id()) then
      raise exception 'not authorized';
    end if;
  elsif p_parish is distinct from public.auth_parish_id() then
    raise exception 'not authorized';
  end if;

  select value into k from public.app_secrets where key = 'audit_hmac_key';

  -- A well-formed chain has exactly ONE genesis root. If there are 0 or >1, the
  -- chain is structurally broken/forked at the root → nothing can be certified ok.
  select count(*) into v_genesis_count
  from public.fee_override_audit a
  where a.parish_id = p_parish and (a.prev_hash is null or a.prev_hash = 'GENESIS');

  return query
  with recursive chain as (
    select a.id, a.hash,
           (a.hash = encode(hmac(public.audit_payload(a), k, 'sha256'), 'hex')) as hmac_ok
    from public.fee_override_audit a
    where a.parish_id = p_parish
      and (a.prev_hash is null or a.prev_hash = 'GENESIS')
      and v_genesis_count = 1
    union all
    select n.id, n.hash,
           (n.hash = encode(hmac(public.audit_payload(n), k, 'sha256'), 'hex'))
    from public.fee_override_audit n
    join chain c on n.prev_hash = c.hash
    where n.parish_id = p_parish
  )
  select a.client_id,
         -- ok ⇔ this row is reachable from the unique genesis via unbroken
         -- prev_hash→hash linkage AND its own server HMAC validates. A tampered,
         -- back-dated, misattributed, forked or injected (random prev_hash) row is
         -- either unreachable (c.id is null) or fails its HMAC → ok = false.
         (c.id is not null and coalesce(c.hmac_ok, false)) as ok
  from public.fee_override_audit a
  left join chain c on c.id = a.id
  where a.parish_id = p_parish;
end $$;
revoke all on function public.verify_audit(uuid) from public, anon;
grant execute on function public.verify_audit(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-AUDIT-ATTR — the server HMAC certified CLIENT-SUPPLIED ts and recorded_by
-- (derive_audit copied ts:=data->>'timestamp', recorded_by:=data->>'recordedBy'),
-- so an insider could back-date a waiver and attribute it to another priest and the
-- HMAC/verify_audit would still say ok=true. Set the trust-critical fields
-- SERVER-SIDE for untrusted client writes: ts:=now(), recorded_by:=the real
-- authenticated caller. Re-derives the flat columns exactly as the original then
-- overrides the two trust fields; audit_hmac() (fires AFTER, name sorts later) signs
-- these server-set values. service_role/seed writes (is_untrusted_client_write()=false)
-- keep their supplied values so historical back-fills remain importable.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.derive_audit()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_actor text;
begin
  if jsonb_typeof(new.data) is distinct from 'object' then raise exception 'audit.data must be a JSON object'; end if;
  new.ts           := nullif(new.data->>'timestamp','')::timestamptz;
  new.sacrament    := new.data->>'sacrament';
  new.registry_id  := new.data->>'registryId';
  new.person_name  := new.data->>'personName';
  new.override_type:= new.data->>'overrideType';
  new.amount       := coalesce((new.data->>'amount')::numeric, 0);
  new.reason       := new.data->>'reason';
  new.recorded_by  := new.data->>'recordedBy';
  new.prev_hash    := new.data->>'prevHash';
  new.hash         := new.data->>'hash';
  if not (new.amount >= 0 and new.amount <= 100000000) then raise exception 'waiver amount must be finite, >= 0, and within range'; end if;
  -- Trust-critical override: for a direct public-API write, WHO and WHEN are set by
  -- the server, not the client — this is what the HMAC then attests. (auth is only
  -- reliable via auth.uid()/auth.role(); current_user is 'postgres' in a definer.)
  if public.is_untrusted_client_write() then
    new.ts := now();
    select coalesce(nullif(btrim(p.full_name), ''), auth.uid()::text)
      into v_actor from public.profiles p where p.id = auth.uid();
    new.recorded_by := coalesce(v_actor, auth.uid()::text);
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- FIX BUG-APPROVAL — the ≥₱100k extraordinary-administration approval routing was
-- purely client-side/advisory. derive_journal copied status verbatim and only
-- checked that lines balance, so the Import wizard (always status:'Posted') and any
-- raw PostgREST insert could land a multi-million entry as Posted, bypassing the
-- Council/Bishop review a manual entry triggers. Enforce it SERVER-SIDE: an
-- untrusted client write whose largest side ≥ ₱100k and whose status is a posting
-- status is FORCED into the Pending approval queue (data.status kept in sync so the
-- app reads Pending too). service_role/seed writes are unaffected. Mirrors
-- getAmountApprovalLevel's first tier (financeData.ts).
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.derive_journal()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if jsonb_typeof(new.data) is distinct from 'object' then raise exception 'journal.data must be a JSON object'; end if;
  if new.data ? 'lines' and jsonb_typeof(new.data->'lines') is distinct from 'array' then raise exception 'journal lines must be an array'; end if;
  new.lines    := coalesce(new.data->'lines', '[]'::jsonb);
  new.total_dr := coalesce((new.data->>'totalDr')::numeric, 0);
  new.total_cr := coalesce((new.data->>'totalCr')::numeric, 0);
  new.date     := nullif(new.data->>'date','')::date;
  new.reference:= new.data->>'reference';
  new.description := new.data->>'description';
  new.status   := new.data->>'status';
  new.posted_by:= new.data->>'postedBy';
  if new.total_dr <> new.total_cr then raise exception 'journal entry is not balanced (dr % <> cr %)', new.total_dr, new.total_cr; end if;
  if public.is_untrusted_client_write()
     and greatest(coalesce(new.total_dr,0), coalesce(new.total_cr,0)) >= 100000
     and coalesce(new.status,'') not in ('Pending','Rejected','Draft') then
    new.status := 'Pending';
    new.data   := jsonb_set(new.data, '{status}', to_jsonb('Pending'::text));
  end if;
  return new;
end $$;

-- ── Verify (manual):
--   select public.is_untrusted_client_write();                 -- false as owner
--   -- a self-elevation UPDATE by an authenticated session must leave role unchanged
--   -- a fresh overlapping calendar_events insert must RAISE 23P01
--   -- verify_audit('<other-parish-uuid>') as a parish user must RAISE 'not authorized'
--   -- select on public.rate_limits with the anon key must return 0 rows / be denied
--   -- an anon reserve_slot with p_email='' must RAISE 'an email address is required'
--   -- a ≥100k journal insert via the anon/authenticated key must land status='Pending'
