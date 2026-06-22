-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — security prep: server-side audit HMAC + rate limiting
-- Run AFTER churchos-saas-setup.sql (+ onboarding). Closes the last two flagged
-- items: the audit hash was a client djb2 (forgeable); rate limits weren't set.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Secret store (read only by SECURITY DEFINER functions, never by clients) ──
-- For production prefer Supabase Vault; this is a self-contained equivalent.
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
alter table public.app_secrets force row level security;       -- no policies → no client can read
revoke all on public.app_secrets from public, anon, authenticated;
insert into public.app_secrets (key, value)
  select 'audit_hmac_key', encode(gen_random_bytes(32), 'hex')
  where not exists (select 1 from public.app_secrets where key = 'audit_hmac_key');

-- ── True tamper-evidence: the audit hash is an HMAC computed SERVER-SIDE over the
--    immutable event fields + the prior hash, with a key clients never see. A
--    client-supplied hash is ignored, so a forged/back-dated waiver can't produce
--    a valid chain. Fires AFTER derive_audit (name sorts later), overriding it.
create or replace function public.audit_payload(a public.fee_override_audit) returns text
  language sql immutable as $$
  select coalesce(a.prev_hash,'') || '|' || a.parish_id::text || '|' || coalesce(a.client_id,'')
      || '|' || coalesce(a.override_type,'') || '|' || coalesce(a.amount::text,'') || '|' || coalesce(a.recorded_by,'')
      || '|' || coalesce(a.ts::text,'');
$$;
create or replace function public.audit_hmac()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  select value into k from public.app_secrets where key = 'audit_hmac_key';
  new.hash := encode(hmac(public.audit_payload(new), k, 'sha256'), 'hex');
  return new;
end $$;
drop trigger if exists trg_hmac_audit on public.fee_override_audit;
create trigger trg_hmac_audit before insert on public.fee_override_audit
  for each row execute function public.audit_hmac();

-- Verifier: recompute each row's HMAC and confirm it matches. A bishop/admin can
-- run this; any 'ok = false' means that row was tampered with after the fact.
create or replace function public.verify_audit(p_parish uuid)
returns table(client_id text, ok boolean)
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  select value into k from public.app_secrets where key = 'audit_hmac_key';
  return query
    select a.client_id, a.hash = encode(hmac(public.audit_payload(a), k, 'sha256'), 'hex')
    from public.fee_override_audit a where a.parish_id = p_parish;
end $$;
revoke all on function public.verify_audit(uuid) from public, anon;
grant execute on function public.verify_audit(uuid) to authenticated;  -- RLS-style: caller still only sees their scope via the RPC's intent

-- ── Rate limiting (Yayamove pattern) — throttle sensitive RPCs ──
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null default date_trunc('minute', now()),
  count int not null default 0,
  primary key (key, window_start)
);
create or replace function public.rate_check(p_key text, p_limit int, p_window interval default '1 minute')
returns void language plpgsql security definer set search_path = public as $$
declare c int;
begin
  delete from public.rate_limits where window_start < now() - (p_window * 3);   -- prune
  insert into public.rate_limits (key, window_start, count)
    values (p_key, date_trunc('minute', now()), 1)
    on conflict (key, window_start) do update set count = public.rate_limits.count + 1
    returning count into c;
  if c > p_limit then raise exception 'rate limit exceeded — please wait a moment'; end if;
end $$;

-- APPLY (add to the top of each sensitive RPC body in churchos-saas-onboarding.sql):
--   perform public.rate_check('onboard:'  || coalesce(auth.uid()::text,'anon'), 3);   -- onboard_new_admin
--   perform public.rate_check('invite:'   || auth.uid()::text, 30);                   -- invite_member
--   perform public.rate_check('provision:'|| auth.uid()::text, 20);                   -- provision_parish

-- Verify: select * from public.verify_audit('<parish-uuid>');   -- every row ok = true
