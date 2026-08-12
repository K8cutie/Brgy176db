-- ChurchOS — AI-cost operability guardrails (Overseer audit L004: findings #1, #2, #3)
-- Idempotent. Apply:  supabase db query --linked --file churchos-saas-ai-cost-guardrails.sql
-- (#5, the per-parish intake cap, lives in churchos-saas-portal.sql — its single source of truth.)

-- ── (#1) rate_allow — a NON-RAISING sibling of rate_check, for the edge function ──────────────
-- rate_check RAISES on exceed, because the portal trigger (normalize_request → `perform
-- rate_check`) needs the raise to abort the insert. The AI edge function could only detect that
-- by string-matching the exception message — and the match was wrong (`/rate limit/i` vs the
-- raised 'too many requests…'), so the per-user AI throttle was a SILENT NO-OP. rate_allow
-- returns a boolean the edge gates on directly. Same counting/bucketing as rate_check.
create or replace function public.rate_allow(p_key text, p_limit int, p_window interval default '1 minute')
returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  delete from public.rate_limits where window_start < now() - (p_window * 3);
  insert into public.rate_limits (key, window_start, count) values (p_key, date_trunc('minute', now()), 1)
    on conflict (key, window_start) do update set count = public.rate_limits.count + 1
    returning count into c;
  return c <= p_limit;   -- true = under the limit / allowed
end $$;
revoke all on function public.rate_allow(text, int, interval) from public;
grant execute on function public.rate_allow(text, int, interval) to authenticated;

-- ── (#2 + #3) per-tenant AI budget + kill-switch ──────────────────────────────────────────────
-- The ONLY spend ceiling before this was per-request (max_tokens/steps) or per-user (the dead
-- throttle). This adds a real per-tenant daily cap and an operator kill-switch, AND closes the
-- denial-of-wallet hole where a brand-new self-signup with no tenancy still fires (billed)
-- Anthropic calls: tenant = the caller's parish_id, or diocese_id for a bishop (COALESCE); a
-- signup with NEITHER returns 'no_tenant' and is rejected before any spend.
-- Zero-config: a tenant with no ai_budget row uses the default cap and is enabled. An operator
-- INSERTs a row to lower a cap or flip the kill-switch. Both tables are locked down (RLS on, no
-- policies, no grants) — only the SECURITY DEFINER function below ever touches them.
create table if not exists public.ai_budget (
  tenant_id uuid primary key,             -- a parish_id or a diocese_id
  daily_cap int,                          -- null → use the default
  enabled   boolean not null default true -- the kill-switch
);
alter table public.ai_budget enable row level security;
alter table public.ai_budget force row level security;

create table if not exists public.ai_usage (
  tenant_id uuid not null,
  day       date not null default current_date,
  count     int  not null default 0,
  primary key (tenant_id, day)
);
alter table public.ai_usage enable row level security;
alter table public.ai_usage force row level security;

create or replace function public.ai_budget_allow()
returns text language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_cap int; v_enabled boolean; v_count int;
begin
  select coalesce(parish_id, diocese_id) into v_tenant from public.profiles where id = auth.uid();
  if v_tenant is null then return 'no_tenant'; end if;      -- unassigned / brand-new signup → reject
  select enabled, daily_cap into v_enabled, v_cap from public.ai_budget where tenant_id = v_tenant;
  if v_enabled is false then return 'disabled'; end if;     -- explicit kill-switch
  v_cap := coalesce(v_cap, 2000);                           -- default daily request cap per tenant
  insert into public.ai_usage (tenant_id, day, count) values (v_tenant, current_date, 1)
    on conflict (tenant_id, day) do update set count = public.ai_usage.count + 1
    returning count into v_count;
  if v_count > v_cap then return 'budget_exceeded'; end if;
  return 'ok';
end $$;
revoke all on function public.ai_budget_allow() from public;
grant execute on function public.ai_budget_allow() to authenticated;

-- VERIFY (after running):
--   select public.rate_allow('smoke', 1);                    -- true, then false on the 2nd call in the minute
--   select public.ai_budget_allow();                         -- 'no_tenant' as a bare session, 'ok' as a real staffer
--   -- lower a parish's cap / kill its AI:
--   -- insert into public.ai_budget(tenant_id, daily_cap, enabled) values ('<parish-uuid>', 500, true)
--   --   on conflict (tenant_id) do update set daily_cap = excluded.daily_cap, enabled = excluded.enabled;
