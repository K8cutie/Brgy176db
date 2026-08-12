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

-- Present as service_role for this session so the guard triggers (force_parish_id,
-- profile column-freeze, append-only audit) step aside while we load + assign data.
-- The derive_* triggers still run, normalizing flat columns from `data`. Without
-- this, force_parish_id would null the parish_id and the freeze would revert the
-- profile role assignments below — and the seed would fail.
set request.jwt.claims = '{"role":"service_role"}';

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

-- Public portal slug + intake config (requires churchos-saas-portal.sql).
-- After seeding, the public site is at  …/#/portal/st-mary
update public.parishes set slug = 'st-mary',
  public_config = '{"intake_enabled":true,"services":["mass_intention","certificate","donation","event_booking"],"fees":{"mass_intention":200,"certificate":150},"contact":{"phone":"(02) 8xxx","email":"office@stmary.test"}}'::jsonb
  where id = 'a1111111-1111-1111-1111-111111111111';
update public.parishes set slug = 'san-roque',
  public_config = '{"intake_enabled":true,"fees":{"mass_intention":250,"certificate":150}}'::jsonb
  where id = 'a2222222-2222-2222-2222-222222222222';

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
-- Values live in `data` (the app's camelCase keys); the derive_collections
-- trigger projects the flat columns and computes total = cash+checks+digital.
insert into public.collections (parish_id, client_id, data) values
  -- St. Mary Magdalene
  ('a1111111-1111-1111-1111-111111111111','SM-C001','{"date":"2026-06-07","massTime":"6:00 AM","cash":8200,"checks":0,"digital":1500,"postedBy":"Aida","status":"Posted"}'),
  ('a1111111-1111-1111-1111-111111111111','SM-C002','{"date":"2026-06-07","massTime":"9:00 AM","cash":15400,"checks":2000,"digital":3100,"postedBy":"Aida","status":"Posted"}'),
  ('a1111111-1111-1111-1111-111111111111','SM-C003','{"date":"2026-06-07","massTime":"6:00 PM","cash":5100,"checks":0,"digital":900,"postedBy":"Aida","status":"Posted"}'),
  -- San Roque
  ('a2222222-2222-2222-2222-222222222222','SR-C001','{"date":"2026-06-07","massTime":"7:00 AM","cash":11200,"checks":0,"digital":1800,"postedBy":"Ben","status":"Posted"}'),
  ('a2222222-2222-2222-2222-222222222222','SR-C002','{"date":"2026-06-07","massTime":"10:00 AM","cash":18900,"checks":3500,"digital":4200,"postedBy":"Ben","status":"Posted"}'),
  ('a2222222-2222-2222-2222-222222222222','SR-C003','{"date":"2026-06-07","massTime":"5:00 PM","cash":3900,"checks":0,"digital":600,"postedBy":"Ben","status":"Posted"}'),
  -- Sto. Niño (different diocese — must NEVER appear in Bp. Tomas' cockpit)
  ('b1111111-1111-1111-1111-111111111111','SN-C001','{"date":"2026-06-07","massTime":"8:00 AM","cash":9000,"checks":0,"digital":1000,"postedBy":"Cubao Sec","status":"Posted"}')
on conflict (parish_id, client_id) do nothing;

-- ══════ 5. Journal entries (expense lines → Pareto) ══════
-- Values live in `data`; derive_journal projects the flat columns, enforces
-- total_dr = total_cr, and requires lines to be a JSON array.
insert into public.journal_entries (parish_id, client_id, data) values
  ('a1111111-1111-1111-1111-111111111111','SM-J001',
    '{"date":"2026-06-10","reference":"JE-1001","description":"June utilities & stipends","status":"Posted","totalDr":18500,"totalCr":18500,"postedBy":"Aida","lines":[{"accountCode":"5100","accountName":"Utilities","debit":12000,"credit":0},{"accountCode":"5200","accountName":"Clergy stipend","debit":6500,"credit":0}]}'),
  ('a2222222-2222-2222-2222-222222222222','SR-J001',
    '{"date":"2026-06-10","reference":"JE-2001","description":"June utilities & repairs","status":"Posted","totalDr":24000,"totalCr":24000,"postedBy":"Ben","lines":[{"accountCode":"5100","accountName":"Utilities","debit":9000,"credit":0},{"accountCode":"5300","accountName":"Building repairs","debit":15000,"credit":0}]}')
on conflict (parish_id, client_id) do nothing;

-- ══════ 6. Sacraments (counts) ══════
insert into public.baptism_records (parish_id, client_id, registry_number, date_of_baptism, data) values
  ('a1111111-1111-1111-1111-111111111111','SM-B001','B-2026-014','2026-06-08','{"childName":"Maria Santos"}'),
  ('a2222222-2222-2222-2222-222222222222','SR-B001','B-2026-031','2026-06-08','{"childName":"Jose Reyes"}')
on conflict (parish_id, client_id) do nothing;

-- ══════ 7. Fee-override audit — ONE planted suspicious waiver (San Roque) ══════
-- A small, reasonable waiver at St. Mary (should NOT be flagged), and a large
-- ₱5,000 funeral waiver at San Roque self-recorded by the priest (SHOULD flag).
-- Values live in `data`; derive_audit projects the flat columns.
insert into public.fee_override_audit (parish_id, client_id, data) values
  ('a1111111-1111-1111-1111-111111111111','SM-A001',
    '{"timestamp":"2026-06-09T10:00:00","sacrament":"Baptism","registryId":"B-2026-014","personName":"Maria Santos","overrideType":"waived","amount":300,"reason":"Indigent family, parish charity","recordedBy":"Aida","prevHash":"GENESIS","hash":"h1"}'),
  ('a2222222-2222-2222-2222-222222222222','SR-A001',
    '{"timestamp":"2026-06-11T16:30:00","sacrament":"Funeral","registryId":"F-2026-008","personName":"(undisclosed)","overrideType":"waived","amount":5000,"reason":"Family hardship","recordedBy":"Fr. Delgado","prevHash":"GENESIS","hash":"h1"}')
on conflict (parish_id, client_id) do nothing;

-- ══════ 8. Diocese monthly packets (what the desktop sync would push) ══════
-- So the bishop's cockpit shows data from pure SQL (no desktop sync needed).
-- Run AFTER churchos-saas-reports.sql. derive_report stamps diocese_id + net.
insert into public.diocese_reports (parish_id, period, collections_total, expense_total, by_mass_time, by_category, sacrament_counts, flagged_waivers) values
  ('a1111111-1111-1111-1111-111111111111','2026-06',36200,18500,
    '{"6:00 AM":9700,"9:00 AM":20500,"6:00 PM":6000}','{"Utilities":12000,"Clergy stipend":6500}',
    '{"baptisms":1,"marriages":0,"confirmations":0,"deaths":0}','[]'),
  ('a2222222-2222-2222-2222-222222222222','2026-06',44100,24000,
    '{"7:00 AM":13000,"10:00 AM":26600,"5:00 PM":4500}','{"Utilities":9000,"Building repairs":15000}',
    '{"baptisms":1,"marriages":0,"confirmations":0,"deaths":0}',
    '[{"by":"Fr. Delgado","amount":5000,"person":"(undisclosed)"}]'),
  -- Sto. Niño (Cubao) — must NOT appear in Bishop Tomas' (Manila) cockpit
  ('b1111111-1111-1111-1111-111111111111','2026-06',10000,0,
    '{"8:00 AM":10000}','{}','{"baptisms":0,"marriages":0,"confirmations":0,"deaths":0}','[]')
on conflict (parish_id, period) do nothing;

-- ══════ 9. Quick checks ══════
-- select name, role, parish_id, diocese_id from public.profiles join auth.users using (id);
-- Logins (test only):  bishop.manila@churchos.test / aida@churchos.test / ben@churchos.test  —  pw: Test1234!
