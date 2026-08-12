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
