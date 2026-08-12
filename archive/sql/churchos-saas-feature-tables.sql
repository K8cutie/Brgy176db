-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — feature tables (donors, receivables, attendance, audit,
-- intentions, certificate templates, import history, and the per-parish
-- settings key/value store).
--
-- These datasets flow through the same storage seam as the tables in
-- churchos-saas-setup.sql (cloudStore.ts → tableFor()/FLAT), but their tables
-- were missing, so in cloud mode every write was silently dropped (cloudSet
-- returned true and wrote nothing). This migration adds the backing tables so
-- the write-through actually persists.
--
-- PREREQUISITE: churchos-saas-setup.sql must already be applied — this file
-- reuses its helper functions (auth_parish_id / auth_role / auth_diocese_id /
-- force_parish_id) and the parishes/profiles tenancy.
--
-- Run in Supabase Dashboard → SQL Editor (or via CLI). Idempotent &
-- re-runnable: create table if not exists / drop policy if exists.
-- ══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ══════ 1. Record tables (one row per item; parish_id + client_id + data jsonb
--             + a few flat analytics columns — same shape as the setup.sql
--             domain tables) ══════

-- Donors, pledges & Official Receipts (lib/donors.ts)
create table if not exists public.donors (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  name text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.donation_campaigns (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  name text, active boolean,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.pledges (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  donor_id text, amount numeric,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.contributions (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  donor_id text, date date, amount numeric, method text, or_number text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Official Receipt series counter (one row per year; client_id = 'OR-<year>')
create table if not exists public.or_series (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  prefix text, year integer, last_number integer,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Accounts receivable (unpaid / bill-later sacramental fees)
create table if not exists public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  date date, description text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Mass attendance / headcount
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  event_id text, date date, count integer,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Mass Intention register (Canon 958)
create table if not exists public.mass_intentions (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  status text, mass_date date, stipend numeric,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Certificate templates (editor: create/edit/duplicate)
create table if not exists public.certificate_templates (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  name text, sacrament text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Import history (last 50 imports)
create table if not exists public.import_history (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  date text, target_module text, status text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- App-wide audit trail (shared 'audit_log' key — Finance/Registry/Directory/
-- Intentions/Donors/Import all append here). `table` is a reserved word, so the
-- flat column is table_name.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  client_id text,
  ts timestamptz, action text, table_name text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ══════ 2. Per-parish settings key/value store (singleton values: objects,
--             arrays, or scalars — one row per (parish_id, setting_key)) ══════
-- Backs module_overrides, fee_schedule, mass_schedule, request_stamps,
-- calendar_show_liturgical, ai_context_optout, notify_outbox. `data` may be any
-- JSON shape, so NO jsonb-object CHECK here (unlike the record tables above).
create table if not exists public.parish_settings (
  id uuid primary key default gen_random_uuid(),
  parish_id uuid references public.parishes on delete cascade not null,
  setting_key text not null,
  data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists uq_parish_settings_key on public.parish_settings (parish_id, setting_key);

-- ══════ 3. client_id — the app's own record id, unique per parish (mirrors
--             setup.sql §4b): required so upsert(onConflict parish_id,client_id)
--             actually dedupes (NULLs are all distinct → duplicate/ghost rows).
do $$
declare t text;
declare dtables text[] := array[
  'donors','donation_campaigns','pledges','contributions','or_series',
  'accounts_receivable','attendance_records','mass_intentions',
  'certificate_templates','import_history','audit_log'
];
begin
  foreach t in array dtables loop
    execute format('alter table public.%I add column if not exists client_id text', t);
    execute format('update public.%I set client_id = id::text where client_id is null', t);
    begin execute format('alter table public.%I alter column client_id set not null', t); exception when others then null; end;
    execute format('create unique index if not exists %I on public.%I (parish_id, client_id)', 'uq_'||t||'_client', t);
    -- `data` must be a JSON object, never a scalar/array/null (the app reads data.x)
    begin execute format('alter table public.%I add constraint %I check (jsonb_typeof(data) = ''object'')', t, 'chk_'||t||'_data_obj'); exception when duplicate_object then null; end;
  end loop;
end $$;

-- ══════ 4. RLS — parish staff read/write their own parish; diocese roles read
--             their parishes (clone of setup.sql §5, incl. parish_settings) ══════
do $$
declare t text;
declare tables text[] := array[
  'donors','donation_campaigns','pledges','contributions','or_series',
  'accounts_receivable','attendance_records','mass_intentions',
  'certificate_templates','import_history','audit_log','parish_settings'
];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    -- FORCE so even the table owner is subject to RLS.
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

-- ══════ 5. force_parish_id trigger — stamp INSERT/UPDATE with the caller's own
--             parish (reuses public.force_parish_id() from setup.sql) ══════
do $$
declare t text;
declare tables text[] := array[
  'donors','donation_campaigns','pledges','contributions','or_series',
  'accounts_receivable','attendance_records','mass_intentions',
  'certificate_templates','import_history','audit_log','parish_settings'
];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists %I on public.%I', 'trg_force_parish_'||t, t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.force_parish_id()', 'trg_force_parish_'||t, t);
  end loop;
end $$;

-- ══════ 6. Verify — every new table must show rls_enabled = true with policies.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       count(p.polname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in (
    'donors','donation_campaigns','pledges','contributions','or_series',
    'accounts_receivable','attendance_records','mass_intentions',
    'certificate_templates','import_history','audit_log','parish_settings'
  )
group by c.relname, c.relrowsecurity
order by c.relrowsecurity, c.relname;
