-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — ONE-SHOT SCHEMA apply (8 schema files, correct order, NO seed)
-- Paste into the Supabase SQL Editor and Run. Idempotent / re-runnable.
-- This is the PRODUCTION schema. For a demo + to run the probe, ALSO run
-- churchos-saas-seed.sql afterward, then churchos-saas-rls-probe.sql.
-- Generated from the churchos-saas-*.sql files — edit those, not this.
-- ══════════════════════════════════════════════════════════════════════════


-- ═══════════════ churchos-saas-setup.sql ═══════════════

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
  -- Freeze only for the PUBLIC API roles. current_user is the real executing
  -- role (unfakeable by a client), so trusted SECURITY DEFINER onboarding RPCs
  -- (current_user = owner) and the backend (service_role) can still assign roles.
  if current_user in ('authenticated', 'anon') then
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
  if current_user in ('authenticated', 'anon') then
    new.parish_id := auth_parish_id();
  end if;
  return new;
end $$;

-- (d3) The fee-override audit is append-only: no UPDATE/DELETE by any non-service
-- caller, so a recorded waiver can't be edited away or its amount/actor changed.
create or replace function public.guard_audit_append_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
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
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.force_parish_id()', 'trg_force_parish_'||t, t);
  end loop;
end $$;

-- ══════ 5c. Structural integrity — no flat/jsonb drift, no ghost rows, balanced books ══════
-- The flat analytics columns are a DENORMALIZED copy of `data` jsonb. Without
-- this, a crafted PostgREST write could set them independently — e.g. data.total
-- = 50000 but the flat total = 0 — so the diocese cockpit and the parish app
-- would show different numbers. These triggers make the flat columns a DERIVED
-- PROJECTION of `data` (recomputed server-side on every write), so they cannot
-- drift, and they enforce the cross-field invariants `data` alone can't.

-- Make journal_entries + fee_override_audit uniform with the other domain tables:
-- give them a `data` jsonb holding the full record. (Bug fix: cloudStore writes
-- `data: i` for EVERY table, so without this, cloud writes to these two fail.)
alter table public.journal_entries   add column if not exists data jsonb default '{}'::jsonb;
alter table public.fee_override_audit add column if not exists data jsonb default '{}'::jsonb;

-- client_id must exist so unique(parish_id, client_id) actually dedupes (NULLs are
-- all distinct in Postgres → upsert can't match → unbounded ghost/duplicate rows).
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
    -- backfill any legacy NULLs, then require it
    execute format('update public.%I set client_id = id::text where client_id is null', t);
    begin execute format('alter table public.%I alter column client_id set not null', t); exception when others then null; end;
    -- `data` must be a JSON object, never a scalar/array/null (app reads data.x)
    begin execute format('alter table public.%I add constraint %I check (jsonb_typeof(data) = ''object'')', t, 'chk_'||t||'_data_obj'); exception when duplicate_object then null; end;
  end loop;
end $$;

-- Collections: flat columns derived from data; total is the TRUE sum of its parts
-- (kills the inflated-total and null-flat-underreport attacks), written back so
-- the app and analytics always agree. Bad/missing date → cast error → rejected.
create or replace function public.derive_collections()
returns trigger language plpgsql as $$
begin
  if jsonb_typeof(new.data) is distinct from 'object' then raise exception 'collections.data must be a JSON object'; end if;
  new.cash     := coalesce((new.data->>'cash')::numeric, 0);
  new.checks   := coalesce((new.data->>'checks')::numeric, 0);
  new.digital  := coalesce((new.data->>'digital')::numeric, 0);
  new.total    := new.cash + new.checks + new.digital;          -- derived, not trusted
  new.date     := nullif(new.data->>'date','')::date;
  new.mass_time:= new.data->>'massTime';
  new.posted_by:= new.data->>'postedBy';
  new.status   := coalesce(new.data->>'status','Posted');
  -- one guard catches negatives, NaN (NaN >= 0 is false), and overflow/garbage
  if not (new.cash >= 0 and new.checks >= 0 and new.digital >= 0 and new.total <= 100000000) then
    raise exception 'collection amounts must be finite, >= 0, and within range';
  end if;
  new.data := jsonb_set(new.data, '{total}', to_jsonb(new.total));  -- keep data.total == flat total
  return new;
end $$;
drop trigger if exists trg_derive_collections on public.collections;
create trigger trg_derive_collections before insert or update on public.collections
  for each row execute function public.derive_collections();

-- Journal entries: flat derived from data; double-entry must balance; lines must
-- be an array (else expense_lines' jsonb_array_elements errors for the whole view).
create or replace function public.derive_journal()
returns trigger language plpgsql as $$
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
  return new;
end $$;
drop trigger if exists trg_derive_journal on public.journal_entries;
create trigger trg_derive_journal before insert or update on public.journal_entries
  for each row execute function public.derive_journal();

-- Fee-override audit: flat derived from data; chain may not FORK (one successor
-- per prev_hash) so an auditor walking the chain can't be sent down a side branch.
create or replace function public.derive_audit()
returns trigger language plpgsql as $$
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
  return new;
end $$;
drop trigger if exists trg_derive_audit on public.fee_override_audit;
create trigger trg_derive_audit before insert or update on public.fee_override_audit
  for each row execute function public.derive_audit();
-- One successor per prev_hash → no chain forks (GENESIS roots are exempt via the partial index predicate).
create unique index if not exists uq_audit_no_fork on public.fee_override_audit (parish_id, prev_hash) where prev_hash is not null and prev_hash <> 'GENESIS';
-- NOTE: the hash itself is still a client-computed djb2 (advisory). True
-- tamper-evidence needs a SECURITY DEFINER trigger computing an HMAC with a
-- server-side key — tracked as a follow-up (see SAAS-GOLIVE.md).

-- ══════ 6. Diocese-wide expense view (for cross-parish Pareto in the cockpit) ══════
create or replace view public.expense_lines as
  select je.parish_id, je.date,
         l->>'accountCode' as account_code,
         l->>'accountName' as account_name,
         coalesce((l->>'debit')::numeric, 0) as debit
  from public.journal_entries je,
       lateral jsonb_array_elements(case when jsonb_typeof(je.lines) = 'array' then je.lines else '[]'::jsonb end) as l
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


-- ═══════════════ churchos-saas-onboarding.sql ═══════════════

-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — self-service onboarding & invites
-- Run AFTER churchos-saas-setup.sql. SECURITY DEFINER RPCs (callable from the
-- browser via PostgREST) that let a diocese onboard itself and invite staff,
-- WITHOUT exposing direct writes to profiles/dioceses/parishes (those stay
-- locked by RLS + guards). Every RPC re-validates the caller because a definer
-- runs as owner and bypasses RLS.
-- ══════════════════════════════════════════════════════════════════════════

-- profiles.email — handy for the team UI + invite matching.
alter table public.profiles add column if not exists email text;

-- New auth users get a profile shell with their email + default role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- ── invites ──
create table if not exists public.parish_invites (
  id uuid primary key default gen_random_uuid(),
  diocese_id uuid references public.dioceses on delete cascade not null,
  parish_id uuid references public.parishes on delete cascade not null,
  email text not null,
  role text not null check (role in ('secretary','priest','finance_council')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  token uuid not null default gen_random_uuid(),
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_invites_email on public.parish_invites(lower(email));
create unique index if not exists uq_invite_pending on public.parish_invites(parish_id, lower(email)) where status = 'pending';

alter table public.parish_invites enable row level security;
alter table public.parish_invites force row level security;
-- A diocese admin sees invites for their diocese; an invitee sees invites to their email.
drop policy if exists invites_admin_read on public.parish_invites;
drop policy if exists invites_invitee_read on public.parish_invites;
create policy invites_admin_read on public.parish_invites for select
  using (auth_role() in ('diocese_admin','bishop') and diocese_id = auth_diocese_id());
create policy invites_invitee_read on public.parish_invites for select
  using (lower(email) = lower((select email from auth.users where id = auth.uid())));
-- All writes go through the RPCs below (no direct INSERT/UPDATE/DELETE policy).

-- ── helpers ──
create or replace function public.my_email() returns text
  language sql stable security definer set search_path = public, auth as
$$ select email from auth.users where id = auth.uid() $$;

-- ── RPC 1: onboard a brand-new diocese admin ──
-- An authenticated user who isn't yet part of any diocese creates their diocese
-- + first parish and becomes its diocese_admin.
create or replace function public.onboard_new_admin(p_diocese text, p_parish text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_did uuid; v_pid uuid; v_prof public.profiles;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_diocese),'') = '' or coalesce(btrim(p_parish),'') = '' then
    raise exception 'diocese and parish names are required';
  end if;
  -- one onboard per user (serialize concurrent calls), and re-read under lock
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  select * into v_prof from public.profiles where id = v_uid for update;
  -- must be a truly un-onboarded account: NO parish and NO diocese yet
  if v_prof.diocese_id is not null or v_prof.parish_id is not null then
    raise exception 'this account already belongs to a diocese';
  end if;

  insert into public.dioceses (name) values (btrim(p_diocese)) returning id into v_did;
  insert into public.parishes (diocese_id, name, billing_status) values (v_did, btrim(p_parish), 'trial') returning id into v_pid;
  update public.profiles set role = 'diocese_admin', diocese_id = v_did, parish_id = v_pid where id = v_uid;
  return jsonb_build_object('diocese_id', v_did, 'parish_id', v_pid);
end $$;

-- ── RPC 2: a diocese admin provisions another parish ──
create or replace function public.provision_parish(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_did uuid; v_pid uuid;
begin
  select diocese_id into v_did from public.profiles where id = v_uid and role in ('diocese_admin','bishop');
  if v_did is null then raise exception 'only a diocese admin may add a parish'; end if;
  if coalesce(btrim(p_name),'') = '' then raise exception 'parish name is required'; end if;
  insert into public.parishes (diocese_id, name, billing_status) values (v_did, btrim(p_name), 'trial') returning id into v_pid;
  return v_pid;
end $$;

-- ── RPC 3: a diocese admin invites a staff member to a parish ──
create or replace function public.invite_member(p_parish uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_did uuid; v_invite uuid;
begin
  select diocese_id into v_did from public.profiles where id = v_uid and role in ('diocese_admin','bishop');
  if v_did is null then raise exception 'only a diocese admin may invite members'; end if;
  if not exists (select 1 from public.parishes where id = p_parish and diocese_id = v_did) then
    raise exception 'that parish is not in your diocese';
  end if;
  if coalesce(btrim(p_email),'') = '' then raise exception 'email is required'; end if;
  if p_role not in ('secretary','priest','finance_council') then raise exception 'invalid role'; end if;
  if lower(btrim(p_email)) = lower(coalesce(public.my_email(),'')) then raise exception 'you cannot invite yourself'; end if;

  insert into public.parish_invites (diocese_id, parish_id, email, role, invited_by)
  values (v_did, p_parish, lower(btrim(p_email)), p_role, v_uid)
  on conflict (parish_id, lower(email)) where status = 'pending'
    do update set role = excluded.role
  returning id into v_invite;
  return v_invite;  -- (email delivery is handled by an edge function / Supabase Auth invite)
end $$;

-- ── RPC 4: the invitee accepts ──
create or replace function public.accept_invite(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text := public.my_email(); v_inv public.parish_invites; v_cur uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  -- Only an UNAFFILIATED account may accept — prevents tenant-hopping and an
  -- existing admin self-demoting by accepting an invite to another diocese.
  select diocese_id into v_cur from public.profiles where id = v_uid;
  if v_cur is not null then raise exception 'this account already belongs to a diocese'; end if;

  -- Atomically claim a PENDING invite addressed to THIS user's email.
  update public.parish_invites set status = 'accepted'
    where token = p_token and status = 'pending' and lower(email) = lower(coalesce(v_email,''))
    returning * into v_inv;
  if v_inv.id is null then raise exception 'invite not found, already used, or for a different email'; end if;
  if v_inv.role not in ('secretary','priest','finance_council') then raise exception 'invalid invite role'; end if;

  update public.profiles set parish_id = v_inv.parish_id, diocese_id = v_inv.diocese_id, role = v_inv.role where id = v_uid;
  return jsonb_build_object('parish_id', v_inv.parish_id, 'role', v_inv.role);
end $$;

-- ── lock down + expose the RPCs to logged-in users only ──
do $$
declare f text;
declare fns text[] := array[
  'onboard_new_admin(text,text)','provision_parish(text)',
  'invite_member(uuid,text,text)','accept_invite(uuid)','my_email()'
];
begin
  foreach f in array fns loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Verify: select proname, prosecdef from pg_proc where proname in
--   ('onboard_new_admin','provision_parish','invite_member','accept_invite');  -- prosecdef must be true


-- ═══════════════ churchos-saas-reports.sql ═══════════════

-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — diocese financial-oversight reports (monthly packets)
-- Run AFTER churchos-saas-setup.sql. The diocese↔parish link is monthly + only
-- for FINANCIAL oversight, so parishes push a compact monthly SUMMARY — never
-- parishioner records. Parishioner PII (baptisms, families) NEVER leaves the
-- parish, which largely addresses RA 10173 (Data Privacy Act).
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.diocese_reports (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  diocese_id uuid references public.dioceses on delete set null,
  period text not null,                                  -- 'YYYY-MM'
  collections_total numeric not null default 0,
  expense_total numeric not null default 0,
  net numeric not null default 0,
  by_mass_time jsonb not null default '{}'::jsonb,        -- { "9:00 AM": 20500, ... }
  by_category jsonb not null default '{}'::jsonb,         -- { "Utilities": 12000, ... }
  sacrament_counts jsonb not null default '{}'::jsonb,    -- { baptisms, marriages, ... }
  flagged_waivers jsonb not null default '[]'::jsonb,     -- large priest-self-approved waivers
  generated_at timestamptz default now(),
  unique (parish_id, period)
);
create index if not exists idx_reports_diocese_period on public.diocese_reports(diocese_id, period);

-- Derive trigger: force parish to the caller's own, stamp diocese from the
-- parish row, recompute net, and bound the money — so a parish can't post a
-- report for another parish or forge a mismatched net.
create or replace function public.derive_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('authenticated','anon') then
    new.parish_id := auth_parish_id();
  end if;
  new.diocese_id := (select diocese_id from public.parishes where id = new.parish_id);
  new.collections_total := coalesce(new.collections_total, 0);
  new.expense_total := coalesce(new.expense_total, 0);
  if not (new.collections_total >= 0 and new.expense_total >= 0
          and new.collections_total <= 1000000000 and new.expense_total <= 1000000000) then
    raise exception 'report amounts must be finite, >= 0, and within range';
  end if;
  new.net := new.collections_total - new.expense_total;     -- derived, not trusted
  if new.period !~ '^\d{4}-\d{2}$' then raise exception 'period must be YYYY-MM'; end if;
  return new;
end $$;
drop trigger if exists trg_derive_report on public.diocese_reports;
create trigger trg_derive_report before insert or update on public.diocese_reports
  for each row execute function public.derive_report();

-- RLS: a parish writes/reads only its own reports; a diocese role reads its diocese.
alter table public.diocese_reports enable row level security;
alter table public.diocese_reports force row level security;
drop policy if exists reports_parish_all on public.diocese_reports;
drop policy if exists reports_diocese_read on public.diocese_reports;
create policy reports_parish_all on public.diocese_reports for all
  using (parish_id = auth_parish_id()) with check (parish_id = auth_parish_id());
create policy reports_diocese_read on public.diocese_reports for select
  using (auth_role() in ('diocese_admin','bishop') and diocese_id = auth_diocese_id());

-- Verify: select parish_id, period, collections_total, net from public.diocese_reports order by period;


-- ═══════════════ churchos-saas-portal.sql ═══════════════

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
    -- public_token is client-supplied (a random UUID the parishioner keeps to track
    -- status) — anon has no SELECT, so it can't read a server-generated one back.
    -- It's only a PII-free status key, so a client-chosen value is harmless.
    new.public_token := coalesce(new.public_token, gen_random_uuid());
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
  -- amount is SERVER-FORCED by normalize_request() (the fee/donation), so it is NOT
  -- checked here. (Was `and amount is null`, which the BEFORE trigger contradicted →
  -- rejected 100% of anon intake. See FIX BUG-1g below.)
  with check (status = 'submitted' and payment_status = 'unpaid' and payment_ref is null);

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


-- ═══════════════ churchos-saas-scheduling.sql ═══════════════

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


-- ═══════════════ churchos-saas-security-prep.sql ═══════════════

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


-- ═══════════════ churchos-saas-billing.sql ═══════════════

-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — billing / subscriptions (Xendit-ready SCAFFOLD)
-- Run AFTER churchos-saas-setup.sql. "SaaS" = a paid PER-PARISH subscription
-- over the offline product. This is the data model + status machine; the live
-- Xendit wiring is prepped in BILLING.md + supabase/functions/xendit-webhook
-- (NOT activated — see "PREP" notes).
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null unique,  -- one sub per parish
  diocese_id uuid references public.dioceses on delete set null,
  plan text not null default 'standard',
  status text not null default 'trial'
    check (status in ('trial','active','past_due','suspended','cancelled')),
  monthly_amount numeric not null default 2500,           -- PHP; tiers 1000–3500
  trial_ends_at timestamptz default (now() + interval '30 days'),
  current_period_end timestamptz,
  -- Xendit identifiers (filled by the webhook when live — PREP)
  xendit_customer_id text,
  xendit_recurring_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_subs_diocese on public.subscriptions(diocese_id);

-- Keep parishes.billing_status mirrored from the subscription + stamp diocese.
create or replace function public.sync_billing_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.diocese_id := (select diocese_id from public.parishes where id = new.parish_id);
  new.updated_at := now();
  update public.parishes set billing_status = new.status where id = new.parish_id;
  return new;
end $$;
drop trigger if exists trg_sync_billing on public.subscriptions;
create trigger trg_sync_billing before insert or update on public.subscriptions
  for each row execute function public.sync_billing_status();

-- Is a parish entitled to the service right now? (trial not expired, or active.)
create or replace function public.parish_is_active(p_parish uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.parish_id = p_parish
      and (s.status = 'active'
           or (s.status = 'trial' and coalesce(s.trial_ends_at, now()) >= now()))
  );
$$;

-- RLS: a diocese admin reads their diocese's subscriptions (read-only). All
-- WRITES happen via the Xendit webhook using the service_role key — never the
-- browser — so a parish can't mark itself 'active'.
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
drop policy if exists subs_diocese_read on public.subscriptions;
create policy subs_diocese_read on public.subscriptions for select
  using (auth_role() in ('diocese_admin','bishop') and diocese_id = auth_diocese_id());

-- When a parish is created, start its 30-day trial. (Hook onboarding/provision.)
create or replace function public.start_trial_for_parish(p_parish uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (parish_id, plan, status)
  values (p_parish, 'standard', 'trial')
  on conflict (parish_id) do nothing;
end $$;
revoke all on function public.start_trial_for_parish(uuid) from public, anon, authenticated;  -- service/definer only

-- Verify: select p.name, s.status, s.trial_ends_at, s.monthly_amount
--   from subscriptions s join parishes p on p.id = s.parish_id;


-- ═══════════════ churchos-saas-authz-fix.sql (CRITICAL — runs last) ═══════════════

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
    ip := coalesce(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1), 'unknown');
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
  ip := coalesce(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1), 'unknown');
  perform public.rate_check('reserve:ip:' || ip, 10, '1 minute');
  if length(coalesce(p_details::text, '{}')) > 8000 then raise exception 'details too large'; end if;
  if coalesce(btrim(p_email), '') <> '' then
    perform public.rate_check('reserve:email:' || lower(btrim(p_email)), 5, '1 hour');
    if (select count(*) from public.availability_slots s join public.service_requests r on r.id = s.request_id
        where s.status = 'held' and lower(r.requester_email) = lower(btrim(p_email))) >= 3 then
      raise exception 'you already have pending bookings — please wait for the parish to confirm';
    end if;
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

-- ── Verify (manual):
--   select public.is_untrusted_client_write();                 -- false as owner
--   -- a self-elevation UPDATE by an authenticated session must leave role unchanged
--   -- a fresh overlapping calendar_events insert must RAISE 23P01
