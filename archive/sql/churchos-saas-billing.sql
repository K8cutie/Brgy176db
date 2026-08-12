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
