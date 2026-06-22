-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — multi-tenant SEED (first live test)
-- Run AFTER churchos-saas-setup.sql. Creates 2 dioceses, 3 parishes, 4 logins,
-- and per-parish data — including a planted suspicious waiver — so the diocese
-- cockpit and its oversight panel light up the moment you open them.
--
-- ⚠ Throwaway test passwords below. NEVER run this against a project that will
--   hold real parish data. For a real tenant, create users via the Auth UI.
-- ══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Fixed UUIDs so the seed is re-runnable & referenceable ──
-- dioceses
--   Manila  = 11111111-…   Cubao = 22222222-…
-- parishes
--   St. Mary Magdalene (Manila) = a1…   San Roque (Manila) = a2…   Sto. Niño (Cubao) = b1…
-- users
--   Bp. Tomas (Manila) = d1…  Sec. Aida (St. Mary) = d2…  Sec. Ben (San Roque) = d3…  Bp. Cruz (Cubao) = d4…

-- ══════ 1. Org ══════
insert into public.dioceses (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Archdiocese of Manila'),
  ('22222222-2222-2222-2222-222222222222', 'Diocese of Cubao')
on conflict (id) do nothing;

insert into public.parishes (id, diocese_id, name, billing_status) values
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'St. Mary Magdalene Parish', 'active'),
  ('a2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'San Roque Parish', 'active'),
  ('b1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Sto. Niño Parish', 'active')
on conflict (id) do nothing;

-- ══════ 2. Auth users (email login) ══════
-- handle_new_user() will auto-create a profile shell for each; we UPDATE the
-- shells with parish/diocese/role in step 3.
-- NOTE: direct auth.users seeding is Supabase-version-sensitive. If a login
-- fails, delete these rows and create the 4 users in Dashboard → Authentication,
-- then run steps 3–5 (which match users by email).
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('d1111111-1111-1111-1111-111111111111','bishop.manila@churchos.test','Bishop Tomas'),
      ('d2222222-2222-2222-2222-222222222222','aida@churchos.test','Secretary Aida'),
      ('d3333333-3333-3333-3333-333333333333','ben@churchos.test','Secretary Ben'),
      ('d4444444-4444-4444-4444-444444444444','bishop.cubao@churchos.test','Bishop Cruz')
    ) as t(id, email, name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (
      '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated',
      u.email, crypt('Test1234!', gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      json_build_object('full_name', u.name),
      '', '', '', '')
    on conflict (id) do nothing;

    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (u.email, u.id::uuid, json_build_object('sub', u.id, 'email', u.email), 'email', now(), now(), now())
    on conflict do nothing;
  end loop;
end $$;

-- ══════ 3. Assign tenancy to the auto-created profile shells ══════
update public.profiles set parish_id='a1111111-1111-1111-1111-111111111111', diocese_id='11111111-1111-1111-1111-111111111111', role='secretary',    full_name='Secretary Aida' where id='d2222222-2222-2222-2222-222222222222';
update public.profiles set parish_id='a2222222-2222-2222-2222-222222222222', diocese_id='11111111-1111-1111-1111-111111111111', role='secretary',    full_name='Secretary Ben'  where id='d3333333-3333-3333-3333-333333333333';
update public.profiles set parish_id=null, diocese_id='11111111-1111-1111-1111-111111111111', role='bishop', full_name='Bishop Tomas' where id='d1111111-1111-1111-1111-111111111111';
update public.profiles set parish_id=null, diocese_id='22222222-2222-2222-2222-222222222222', role='bishop', full_name='Bishop Cruz'  where id='d4444444-4444-4444-4444-444444444444';

-- ══════ 4. Per-parish collections (note the clear "lowest Mass") ══════
insert into public.collections (parish_id, client_id, date, mass_time, cash, checks, digital, total, posted_by, status, data) values
  -- St. Mary Magdalene
  ('a1111111-1111-1111-1111-111111111111','SM-C001','2026-06-07','6:00 AM',  8200,0,1500, 9700,'Aida','Posted','{}'),
  ('a1111111-1111-1111-1111-111111111111','SM-C002','2026-06-07','9:00 AM', 15400,2000,3100,20500,'Aida','Posted','{}'),
  ('a1111111-1111-1111-1111-111111111111','SM-C003','2026-06-07','6:00 PM',  5100,0,900,  6000,'Aida','Posted','{}'),
  -- San Roque
  ('a2222222-2222-2222-2222-222222222222','SR-C001','2026-06-07','7:00 AM', 11200,0,1800,13000,'Ben','Posted','{}'),
  ('a2222222-2222-2222-2222-222222222222','SR-C002','2026-06-07','10:00 AM',18900,3500,4200,26600,'Ben','Posted','{}'),
  ('a2222222-2222-2222-2222-222222222222','SR-C003','2026-06-07','5:00 PM',  3900,0,600,  4500,'Ben','Posted','{}'),
  -- Sto. Niño (different diocese — must NEVER appear in Bp. Tomas' cockpit)
  ('b1111111-1111-1111-1111-111111111111','SN-C001','2026-06-07','8:00 AM',  9000,0,1000,10000,'Cubao Sec','Posted','{}')
on conflict (parish_id, client_id) do nothing;

-- ══════ 5. Journal entries (expense lines → Pareto) ══════
insert into public.journal_entries (parish_id, client_id, date, reference, description, status, total_dr, total_cr, posted_by, lines) values
  ('a1111111-1111-1111-1111-111111111111','SM-J001','2026-06-10','JE-1001','June utilities & stipends','Posted',18500,18500,'Aida',
    '[{"accountCode":"5100","accountName":"Utilities","debit":12000,"credit":0},{"accountCode":"5200","accountName":"Clergy stipend","debit":6500,"credit":0}]'),
  ('a2222222-2222-2222-2222-222222222222','SR-J001','2026-06-10','JE-2001','June utilities & repairs','Posted',24000,24000,'Ben',
    '[{"accountCode":"5100","accountName":"Utilities","debit":9000,"credit":0},{"accountCode":"5300","accountName":"Building repairs","debit":15000,"credit":0}]')
on conflict (parish_id, client_id) do nothing;

-- ══════ 6. Sacraments (counts) ══════
insert into public.baptism_records (parish_id, client_id, registry_number, date_of_baptism, data) values
  ('a1111111-1111-1111-1111-111111111111','SM-B001','B-2026-014','2026-06-08','{"childName":"Maria Santos"}'),
  ('a2222222-2222-2222-2222-222222222222','SR-B001','B-2026-031','2026-06-08','{"childName":"Jose Reyes"}')
on conflict (parish_id, client_id) do nothing;

-- ══════ 7. Fee-override audit — ONE planted suspicious waiver (San Roque) ══════
-- A small, reasonable waiver at St. Mary (should NOT be flagged), and a large
-- ₱5,000 funeral waiver at San Roque self-recorded by the priest (SHOULD flag).
insert into public.fee_override_audit (parish_id, client_id, ts, sacrament, registry_id, person_name, override_type, amount, reason, recorded_by, prev_hash, hash) values
  ('a1111111-1111-1111-1111-111111111111','SM-A001','2026-06-09 10:00','Baptism','B-2026-014','Maria Santos','waived', 300,'Indigent family, parish charity','Aida','GENESIS','h1'),
  ('a2222222-2222-2222-2222-222222222222','SR-A001','2026-06-11 16:30','Funeral','F-2026-008','(undisclosed)','waived',5000,'Family hardship','Fr. Delgado','GENESIS','h1')
on conflict (parish_id, client_id) do nothing;

-- ══════ 8. Quick checks ══════
-- select name, role, parish_id, diocese_id from public.profiles join auth.users using (id);
-- Logins (test only):  bishop.manila@churchos.test / aida@churchos.test / ben@churchos.test  —  pw: Test1234!
