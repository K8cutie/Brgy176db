-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS — parishioner self-service portal (INBOUND intake)
-- Run AFTER churchos-saas-setup.sql. A public, always-on cloud queue: a
-- parishioner books a service + (optionally) pays; the parish PULLS it into a
-- desktop "Requests" inbox when online. Security pattern (Megyprints orders):
-- the public may ONLY submit an UNPAID request — the PARISH sets the fee + status.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Public parish profile (so the website can render a parish by its slug) ──
alter table public.parishes add column if not exists slug text;
create unique index if not exists uq_parish_slug on public.parishes(slug) where slug is not null;
alter table public.parishes add column if not exists public_config jsonb default '{}'::jsonb;  -- { services:[], contact:{}, fees:{ mass_intention:200, certificate:150 } }

-- Anon resolves a parish by slug via a definer fn (we never expose the parishes table to anon).
create or replace function public.parish_public(p_slug text)
returns table(id uuid, name text, slug text, public_config jsonb)
language sql stable security definer set search_path = public as $$
  select id, name, slug, public_config from public.parishes where slug = p_slug;
$$;
revoke all on function public.parish_public(text) from public;
grant execute on function public.parish_public(text) to anon, authenticated;

-- ── The intake queue ──
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  public_token uuid not null default gen_random_uuid(),     -- parishioner status lookup (unguessable)
  type text not null check (type in ('mass_intention','certificate','donation','event_booking')),
  status text not null default 'submitted'
    check (status in ('submitted','in_review','scheduled','confirmed','completed','rejected','cancelled')),
  requester_name text, requester_email text, requester_phone text,
  requested_date date,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  amount numeric,                                            -- the fee — set by the PARISH/server, never the requester
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','paid','waived','refunded')),
  payment_ref text,                                          -- Xendit invoice id (set by webhook/service role)
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists idx_requests_parish_status on public.service_requests(parish_id, status);
create index if not exists idx_requests_token on public.service_requests(public_token);

-- ── Server-forced intake fields: a public submission can NEVER set its own price,
--    payment, or status. The fee is the parish's published fee; a donation uses the
--    requester's chosen (bounded) amount. Runs for client inserts only.
-- (shared) rate-limit infra — idempotent (also in churchos-saas-security-prep.sql).
create table if not exists public.rate_limits (
  key text not null, window_start timestamptz not null default date_trunc('minute', now()),
  count int not null default 0, primary key (key, window_start)
);
create or replace function public.rate_check(p_key text, p_limit int, p_window interval default '1 minute')
returns void language plpgsql security definer set search_path = public as $$
declare c int;
begin
  delete from public.rate_limits where window_start < now() - (p_window * 3);
  insert into public.rate_limits (key, window_start, count) values (p_key, date_trunc('minute', now()), 1)
    on conflict (key, window_start) do update set count = public.rate_limits.count + 1
    returning count into c;
  if c > p_limit then raise exception 'too many requests — please wait a moment'; end if;
end $$;

create or replace function public.normalize_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare ip text; amt jsonb;
begin
  if current_user in ('anon','authenticated') then
    -- (#4) the parish must EXIST and have opted into public intake (secure default: off)
    if not exists (select 1 from public.parishes where id = new.parish_id and (public_config->>'intake_enabled') = 'true') then
      raise exception 'this parish is not accepting online requests';
    end if;
    -- (#1) rate-limit anon submissions per IP per parish
    ip := coalesce(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1), 'unknown');
    perform public.rate_check('intake:' || ip || ':' || new.parish_id::text, 10, '1 minute');
    -- (#12) cap the details payload size
    if length(coalesce(new.details, '{}'::jsonb)::text) > 8000 then raise exception 'request details too large'; end if;

    new.status := 'submitted'; new.payment_status := 'unpaid'; new.payment_ref := null;
    new.public_token := gen_random_uuid();
    -- (#3) donation amount must be a JSON number, then clamped; else 0
    if new.type = 'donation' then
      amt := new.details -> 'amount';
      new.amount := case when jsonb_typeof(amt) = 'number' then least(greatest((amt)::text::numeric, 0), 1000000) else 0 end;
    else
      new.amount := coalesce((select (public_config->'fees'->>new.type)::numeric from public.parishes where id = new.parish_id), 0);
    end if;
    -- (#14) CRLF-strip + bound contact fields (no header injection / spam relay)
    new.requester_name  := left(regexp_replace(coalesce(new.requester_name, ''),  '[\r\n]', ' ', 'g'), 120);
    new.requester_email := left(regexp_replace(coalesce(new.requester_email, ''), '[\r\n]', '',  'g'), 200);
    new.requester_phone := left(regexp_replace(coalesce(new.requester_phone, ''), '[\r\n]', '',  'g'), 40);
    -- (#15) sane requested-date window
    if new.requested_date is not null and (new.requested_date < current_date - interval '1 year'
         or new.requested_date > current_date + interval '2 years') then
      raise exception 'requested date is out of range';
    end if;
  end if;
  return new;
end $$;
-- (#11) stored-XSS: the staff desktop is React (auto-escapes text) — render details/
-- name/email as TEXT, NEVER via dangerouslySetInnerHTML. Enforced in the inbox UI.
drop trigger if exists trg_normalize_request on public.service_requests;
create trigger trg_normalize_request before insert on public.service_requests
  for each row execute function public.normalize_request();

-- ── RLS ──
alter table public.service_requests enable row level security;
alter table public.service_requests force row level security;

-- (1) Anyone may SUBMIT a request — but only a clean, unpaid one (the trigger also
-- hard-forces this). No reading others' requests, no setting price/status.
drop policy if exists req_public_submit on public.service_requests;
-- anon-ONLY: an authenticated staffer inserts via req_parish_all (their own parish),
-- so this loose public policy can't be used to plant rows in ANOTHER parish (#5).
create policy req_public_submit on public.service_requests for insert to anon
  with check (status = 'submitted' and payment_status = 'unpaid' and amount is null and payment_ref is null);

-- (2) Parish staff read + manage their own parish's requests (the inbox).
drop policy if exists req_parish_all on public.service_requests;
create policy req_parish_all on public.service_requests for all to authenticated
  using (parish_id = auth_parish_id()) with check (parish_id = auth_parish_id());

-- ── Parishioner status lookup by token (no table access) ──
create or replace function public.request_status(p_token uuid)
returns table(type text, status text, requested_date date, amount numeric, payment_status text)
language sql stable security definer set search_path = public as $$
  select type, status, requested_date, amount, payment_status
  from public.service_requests where public_token = p_token;
$$;
revoke all on function public.request_status(uuid) from public;
grant execute on function public.request_status(uuid) to anon, authenticated;

-- NOTE: spam/abuse rate-limiting on the public insert + Xendit invoice creation on
-- 'confirm' are prepped in churchos-saas-security-prep.sql / BILLING.md.
-- Verify: select type, status, payment_status, amount from public.service_requests order by created_at desc;
