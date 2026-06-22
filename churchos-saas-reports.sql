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
