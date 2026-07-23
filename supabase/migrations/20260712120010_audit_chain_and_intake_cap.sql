-- ══════════════════════════════════════════════════════════════════════════
-- 20260712120010_audit_chain_and_intake_cap.sql   (idempotent; safe to re-run)
--
-- FIX BUG-AUDIT-CHAIN (red-team, MEDIUM) — verify_audit reported EVERY parish's
-- fee_override_audit chain as 0/N verified even though each row's HMAC is valid.
-- Two compounding causes:
--   (a) the client (donors.recordFeeWaiver) sets prev_hash from the PREVIOUS entry's
--       client-side djb2 hash, but the server stores the keyed HMAC in `hash` — so the
--       verifier's linkage walk `next.prev_hash = current.hash` never matches past the
--       root, leaving every non-root row "unreachable" → ok=false;
--   (b) the client writes the root marker as lowercase 'genesis', but the hardened
--       verify_audit only recognises 'GENESIS' → the root itself is never anchored.
-- FIX: (1) derive_audit now SERVER-CHAINS prev_hash for untrusted client writes — it is
--      set to the current chain tip's stored hash (or 'GENESIS' for the first row), so
--      the whole chain is server-built and audit_hmac (which fires after) attests the
--      real linkage. Concurrent appends still serialise via uq_audit_no_fork(prev_hash).
--      (2) verify_audit's genesis check is case-insensitive (defensive for legacy rows).
--
-- FIX BUG-INTAKE-CAP (red-team, LOW) — the 8 KB details cap in normalize_request lives
-- behind is_untrusted_client_write(), which can intermittently skip (null auth.role()),
-- so an oversized anon payload slipped through. Enforce the same cap at the RLS layer,
-- which ALWAYS runs, as a belt-and-suspenders bound.
-- ══════════════════════════════════════════════════════════════════════════

-- ── (1) derive_audit: server-side prev_hash chaining ──────────────────────
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
  -- Trust-critical override: for a direct public-API write, WHO/WHEN and now the CHAIN
  -- LINKAGE are set by the server, not the client — this is what the HMAC then attests.
  if public.is_untrusted_client_write() then
    new.ts := now();
    select coalesce(nullif(btrim(p.full_name), ''), auth.uid()::text)
      into v_actor from public.profiles p where p.id = auth.uid();
    new.recorded_by := coalesce(v_actor, auth.uid()::text);
    -- Server-chain: link to the real stored hash of the current tip (or GENESIS). The
    -- client cannot know the server HMAC, so it must not own the linkage.
    new.prev_hash := coalesce(
      (select a.hash from public.fee_override_audit a
        where a.parish_id = new.parish_id order by a.ts desc, a.id desc limit 1),
      'GENESIS');
  end if;
  return new;
end $$;

-- ── (2) verify_audit: case-insensitive genesis anchor ─────────────────────
create or replace function public.verify_audit(p_parish uuid default null)
returns table(client_id text, ok boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare k text; v_role text; v_genesis_count int;
begin
  if p_parish is null then p_parish := public.auth_parish_id(); end if;
  if p_parish is null then return; end if;
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

  select count(*) into v_genesis_count
  from public.fee_override_audit a
  where a.parish_id = p_parish and (a.prev_hash is null or upper(a.prev_hash) = 'GENESIS');

  return query
  with recursive chain as (
    select a.id, a.hash,
           (a.hash = encode(hmac(public.audit_payload(a), k, 'sha256'), 'hex')) as hmac_ok
    from public.fee_override_audit a
    where a.parish_id = p_parish
      and (a.prev_hash is null or upper(a.prev_hash) = 'GENESIS')
      and v_genesis_count = 1
    union all
    select n.id, n.hash,
           (n.hash = encode(hmac(public.audit_payload(n), k, 'sha256'), 'hex'))
    from public.fee_override_audit n
    join chain c on n.prev_hash = c.hash
    where n.parish_id = p_parish
  )
  select a.client_id,
         (c.id is not null and coalesce(c.hmac_ok, false)) as ok
  from public.fee_override_audit a
  left join chain c on c.id = a.id
  where a.parish_id = p_parish;
end $$;
revoke all on function public.verify_audit(uuid) from public, anon;
grant execute on function public.verify_audit(uuid) to authenticated;

-- ── (3) RLS-layer intake details cap (always runs, unlike the definer trigger) ──
drop policy if exists req_public_submit on public.service_requests;
create policy req_public_submit on public.service_requests for insert to anon
  with check (
    status = 'submitted' and payment_status = 'unpaid' and payment_ref is null
    and length(coalesce(details, '{}'::jsonb)::text) <= 8000
  );
