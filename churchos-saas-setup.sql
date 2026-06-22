-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — Supabase setup (urban / online edition)
-- Run in Supabase Dashboard → SQL Editor. Implements the tenancy + schema + RLS
-- from CHURCHOS-SAAS-BLUEPRINT.md. Re-runnable (drops policies before creating).
-- ══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ══════ 1. Org & identity ══════
create table if not exists public.dioceses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.parishes (
  id uuid primary key default gen_random_uuid(),
  diocese_id uuid references public.dioceses on delete set null,
  name text not null,
  config jsonb default '{}'::jsonb,
  billing_status text default 'trial',
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  parish_id uuid references public.parishes on delete set null,
  diocese_id uuid references public.dioceses on delete set null,
  role text not null default 'secretary'
    check (role in ('secretary','priest','finance_council','diocese_admin','bishop')),
  full_name text,
  created_at timestamptz default now()
);

-- New auth users get a profile shell; parish/diocese + role are assigned at
-- onboarding (invite flow), not derived from signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ══════ 2. Tenancy helper functions (security definer → no RLS recursion) ══════
create or replace function public.auth_parish_id() returns uuid
  language sql stable security definer set search_path = public as
$$ select parish_id from public.profiles where id = auth.uid() $$;

create or replace function public.auth_diocese_id() returns uuid
  language sql stable security definer set search_path = public as
$$ select diocese_id from public.profiles where id = auth.uid() $$;

create or replace function public.auth_role() returns text
  language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- ══════ 3. updated_at helper ══════
create or replace function public.touch_updated_at()
returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

-- ══════ 4. Domain tables (parish_id + analytics-critical columns + data jsonb) ══════
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  date date not null, mass_time text,
  cash numeric, checks numeric, digital numeric, total numeric,
  posted_by text, status text default 'Posted',
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists idx_collections_parish_date on public.collections(parish_id, date);
create index if not exists idx_collections_parish_mass on public.collections(parish_id, mass_time);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  date date not null, reference text, description text, status text,
  total_dr numeric, total_cr numeric, posted_by text,
  lines jsonb default '[]'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists idx_journal_parish_date on public.journal_entries(parish_id, date);

create table if not exists public.fee_override_audit (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  ts timestamptz, sacrament text, registry_id text, person_name text,
  override_type text, amount numeric, reason text, recorded_by text,
  prev_hash text, hash text
);
create index if not exists idx_audit_parish on public.fee_override_audit(parish_id, ts);

-- Sacrament registries + directory + ministry + ssdm + calendar + budget:
-- same shape (parish_id + a couple indexed keys + data jsonb).
create table if not exists public.baptism_records      ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, registry_number text, date_of_baptism date, data jsonb default '{}'::jsonb );
create table if not exists public.marriage_records     ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, registry_number text, date_of_marriage date, data jsonb default '{}'::jsonb );
create table if not exists public.confirmation_records ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, registry_number text, date_of_confirmation date, data jsonb default '{}'::jsonb );
create table if not exists public.death_records        ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, registry_number text, date_of_burial date, data jsonb default '{}'::jsonb );
create table if not exists public.families             ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, family_name text, barangay text, data jsonb default '{}'::jsonb );
create table if not exists public.ministries           ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, name text, data jsonb default '{}'::jsonb );
create table if not exists public.ssdm_applications    ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, program_type text, status text, data jsonb default '{}'::jsonb );
create table if not exists public.ssdm_beneficiaries   ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, program text, data jsonb default '{}'::jsonb );
create table if not exists public.ssdm_disbursements   ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, date date, amount numeric, data jsonb default '{}'::jsonb );
create table if not exists public.calendar_events      ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, date date, type text, officiant text, location text, data jsonb default '{}'::jsonb );
create table if not exists public.budget_items         ( id uuid primary key default gen_random_uuid(), parish_id uuid references public.parishes on delete cascade not null, account_code text, data jsonb default '{}'::jsonb );

-- ══════ 4b. client_id — the app's own record id, unique per parish ══════
-- Lets the client upsert/reconcile by its own string ids (e.g. 'SC-001','fx1')
-- which can repeat across parishes, while the PK stays a clean uuid.
do $$
declare t text;
declare dtables text[] := array[
  'collections','journal_entries','fee_override_audit',
  'baptism_records','marriage_records','confirmation_records','death_records',
  'families','ministries','ssdm_applications','ssdm_beneficiaries',
  'ssdm_disbursements','calendar_events','budget_items'
];
begin
  foreach t in array dtables loop
    execute format('alter table public.%I add column if not exists client_id text', t);
    execute format('create unique index if not exists %I on public.%I (parish_id, client_id)', 'uq_'||t||'_client', t);
  end loop;
end $$;

-- ══════ 4c. Amount sanity — no negative money (red-team vector c5) ══════
-- RLS controls WHO writes; these CHECKs control WHAT they can write, so a
-- secretary can't post a negative collection/waiver to skim or distort totals.
do $$
begin
  begin alter table public.collections add constraint chk_coll_total check (total   >= 0); exception when duplicate_object then null; end;
  begin alter table public.collections add constraint chk_coll_cash  check (cash    >= 0); exception when duplicate_object then null; end;
  begin alter table public.collections add constraint chk_coll_chk   check (checks  >= 0); exception when duplicate_object then null; end;
  begin alter table public.collections add constraint chk_coll_dig   check (digital >= 0); exception when duplicate_object then null; end;
  begin alter table public.fee_override_audit add constraint chk_audit_amt check (amount >= 0); exception when duplicate_object then null; end;
  begin alter table public.ssdm_disbursements add constraint chk_disb_amt check (amount >= 0); exception when duplicate_object then null; end;
end $$;

-- ══════ 5. RLS — parish staff write their parish; diocese reads its parishes ══════
-- profiles: a user may READ and UPDATE only their own row — but NOT insert or
-- delete one. The row is created solely by handle_new_user() (security definer)
-- with the default role, so nobody can self-provision a profile as 'bishop', nor
-- delete-and-recreate one with a chosen role/parish. (red-team: profiles-insert-self-elevation)
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_select_self on public.profiles for select using (id = auth.uid());
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Don't let authenticated/anon create objects in public (search-path hijack of
-- the SECURITY DEFINER helpers). (red-team: definer-helper-search-path)
revoke create on schema public from anon, authenticated;

-- dioceses / parishes: members read their own; diocese roles read their diocese.
alter table public.parishes enable row level security;
drop policy if exists parish_visible on public.parishes;
create policy parish_visible on public.parishes for select using (
  id = auth_parish_id()
  or (auth_role() in ('diocese_admin','bishop') and diocese_id = auth_diocese_id())
);

alter table public.dioceses enable row level security;
drop policy if exists diocese_visible on public.dioceses;
create policy diocese_visible on public.dioceses for select using ( id = auth_diocese_id() );

-- All domain tables: clone the two policies (parish write-all + diocese read).
do $$
declare t text;
declare tables text[] := array[
  'collections','journal_entries','fee_override_audit',
  'baptism_records','marriage_records','confirmation_records','death_records',
  'families','ministries','ssdm_applications','ssdm_beneficiaries',
  'ssdm_disbursements','calendar_events','budget_items'
];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    -- FORCE so even the table owner is subject to RLS (red-team: rls-not-forced-on-owner).
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', 'parish_all_'||t, t);
    execute format(
      'create policy %I on public.%I for all using (parish_id = auth_parish_id()) with check (parish_id = auth_parish_id())',
      'parish_all_'||t, t);
    execute format('drop policy if exists %I on public.%I', 'diocese_read_'||t, t);
    execute format(
      'create policy %I on public.%I for select using (auth_role() in (''diocese_admin'',''bishop'') and parish_id in (select id from public.parishes where diocese_id = auth_diocese_id()))',
      'diocese_read_'||t, t);
  end loop;
end $$;

-- ══════ 5b. Guard triggers — Yayamove pattern (freeze trust columns, append-only audit) ══════
-- RLS says WHICH ROWS you may touch; these triggers say WHICH COLUMNS/OPERATIONS,
-- closing mass-assignment holes RLS alone leaves open. service_role (the backend
-- onboarding/admin path) bypasses; nested trusted triggers (depth > 1) pass through.

-- (c1) A user may edit their own profile (full_name) but NOT self-promote: role,
-- parish_id and diocese_id are frozen to their old values for any non-service write.
create or replace function public.guard_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Gate on ROLE, not pg_trigger_depth(): a depth check can be sidestepped by an
  -- attacker-influenced cascade (red-team: trigger-depth-bypass).
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    new.role       := old.role;
    new.parish_id  := old.parish_id;
    new.diocese_id := old.diocese_id;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_columns();

-- (d5) Force parish_id on INSERT to the caller's own parish, so a forged
-- parish_id can't plant a row under (or frame) another parish.
create or replace function public.force_parish_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    new.parish_id := auth_parish_id();
  end if;
  return new;
end $$;

-- (d3) The fee-override audit is append-only: no UPDATE/DELETE by any non-service
-- caller, so a recorded waiver can't be edited away or its amount/actor changed.
create or replace function public.guard_audit_append_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'fee_override_audit is append-only';
  end if;
  return null;
end $$;
drop trigger if exists trg_audit_no_mutate on public.fee_override_audit;
create trigger trg_audit_no_mutate before update or delete on public.fee_override_audit
  for each row execute function public.guard_audit_append_only();

do $$
declare t text;
declare tables text[] := array[
  'collections','journal_entries','fee_override_audit',
  'baptism_records','marriage_records','confirmation_records','death_records',
  'families','ministries','ssdm_applications','ssdm_beneficiaries',
  'ssdm_disbursements','calendar_events','budget_items'
];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists %I on public.%I', 'trg_force_parish_'||t, t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.force_parish_id()', 'trg_force_parish_'||t, t);
  end loop;
end $$;

-- ══════ 6. Diocese-wide expense view (for cross-parish Pareto in the cockpit) ══════
create or replace view public.expense_lines as
  select je.parish_id, je.date,
         l->>'accountCode' as account_code,
         l->>'accountName' as account_name,
         coalesce((l->>'debit')::numeric, 0) as debit
  from public.journal_entries je,
       lateral jsonb_array_elements(je.lines) as l
  where coalesce((l->>'debit')::numeric,0) > 0;
-- A view runs with its OWNER's rights by default, bypassing RLS on the tables it
-- reads — so without this a member could read every parish's expenses through the
-- view. security_invoker makes it run as the caller, restoring tenant isolation.
-- (red-team: expense-lines-view-rls-bypass) — requires Postgres 15+ (Supabase is).
alter view public.expense_lines set (security_invoker = on);

-- ══════ 6b. Security notes — residual items from the red-team (accepted / ops) ══════
-- DEFENDED (verified): cross-parish writes by a bishop are blocked — a diocese
--   user's auth_parish_id() is NULL, so the parish_all USING (parish_id = NULL)
--   is never true, and diocese_read_* is FOR SELECT only. parish_id is NOT NULL
--   on every domain table, so a bishop's forced-NULL insert fails the constraint.
-- ACCEPTED BY DESIGN (intra-parish): every in-parish role can write its parish's
--   rows (the parish is one trust domain); financial integrity rests on the
--   append-only fee_override_audit + attribution, not per-column role gating. If a
--   diocese wants "only finance_council edits finances", add role-scoped policies
--   on collections/journal_entries/ssdm_disbursements — a v-next enhancement.
-- OPS (outside this file):
--   • service_role key must stay server-side only — never VITE_/NEXT_PUBLIC_ in
--     the browser bundle (it bypasses ALL RLS + triggers). cloudStore uses the
--     anon key only; the edge function reads service_role from Deno env.
--   • Supabase Realtime authorization is separate from RLS — only add tables to
--     the `supabase_realtime` publication with RLS-aware Realtime enabled.
--   • Any future SECURITY DEFINER RPC must re-check parish_id = auth_parish_id()
--     internally (definers bypass RLS) and never resolve client_id without parish.

-- ══════ 7. Verify (run after applying — every tenant table must be locked down) ══════
-- Each public table MUST show rls_enabled = true with at least one policy.
-- Anything with rls_enabled = false is readable/writable by anyone with the
-- public anon key — treat a 'false' here as a release blocker.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       count(p.polname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relrowsecurity, c.relname;

-- Confirm the guard triggers are present:
-- select tgname, tgrelid::regclass from pg_trigger
--   where tgname in ('trg_guard_profile','trg_audit_no_mutate') or tgname like 'trg_force_parish_%';

-- Spot-check tenancy / analytics once seeded:
-- select role, parish_id, diocese_id from public.profiles where id = auth.uid();
-- select mass_time, sum(total) from public.collections group by mass_time order by 2;  -- the "lowest Mass" query
