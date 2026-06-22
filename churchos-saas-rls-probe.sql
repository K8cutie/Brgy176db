-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — LIVE RLS probe (the first real test of tenant isolation)
--
-- Run in Supabase → SQL Editor AFTER churchos-saas-setup.sql + churchos-saas-seed.sql.
-- It impersonates the seeded users (set role authenticated + JWT claims) and
-- asserts each isolation property the JS sim can only model. Every row returned
-- must show pass = true. Any pass = false is a release blocker.
--
-- Seeded ids: St.Mary=a1.. SanRoque=a2.. StoNiño(Cubao)=b1..  Aida(StMary sec)=d2..
--             Ben(SanRoque sec)=d3..  Bp.Tomas(Manila)=d1..
-- ══════════════════════════════════════════════════════════════════════════

-- ── A. Secretary Aida sees ONLY her parish ──
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}';

  select 'a1 aida sees only st.mary collections' as check,
         count(*) filter (where parish_id <> 'a1111111-1111-1111-1111-111111111111') = 0 as pass
  from public.collections;

  select 'a2 aida cross-parish read blocked (san roque)' as check,
         count(*) = 0 as pass
  from public.collections where parish_id = 'a2222222-2222-2222-2222-222222222222';

  select 'b1 aida cross-diocese read blocked (sto niño)' as check,
         count(*) = 0 as pass
  from public.collections where parish_id = 'b1111111-1111-1111-1111-111111111111';

  -- expense_lines VIEW must respect RLS too (security_invoker), not leak all parishes
  select 'a3 expense_lines view does not leak other parishes' as check,
         count(*) filter (where parish_id <> 'a1111111-1111-1111-1111-111111111111') = 0 as pass
  from public.expense_lines;
rollback;

-- ── B. Privilege: Aida cannot self-promote or forge a parish ──
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}';

  -- the guard trigger freezes role on update → she stays a secretary
  update public.profiles set role = 'bishop' where id = auth.uid();
  select 'c1 aida cannot self-promote to bishop' as check,
         (select role from public.profiles where id = auth.uid()) = 'secretary' as pass;

  -- force_parish_id rewrites a forged parish_id back to her own (values via `data`)
  insert into public.collections (parish_id, client_id, data)
    values ('a2222222-2222-2222-2222-222222222222', 'PROBE-1', '{"date":"2026-06-07","massTime":"6:00 AM","cash":100}');
  select 'c2 forged parish_id on insert is forced back to own parish' as check,
         (select parish_id from public.collections where client_id = 'PROBE-1') = 'a1111111-1111-1111-1111-111111111111' as pass;
  -- and the flat total is DERIVED from data (drift-proof): 100, not client-supplied
  select 'c2b flat total derived from data' as check,
         (select total from public.collections where client_id = 'PROBE-1') = 100 as pass;
rollback;

-- ── C. Audit is append-only (expect this block to ERROR on the UPDATE) ──
-- Run it separately; a raised exception 'fee_override_audit is append-only' is the PASS.
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"d3333333-3333-3333-3333-333333333333","role":"authenticated"}';
--   update public.fee_override_audit set amount = 0 where client_id = 'SR-A001';  -- must raise
-- rollback;

-- ── D. Bishop Tomas sees his whole diocese — but NOT the other diocese ──
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}';

  select 'd1 bishop sees st.mary + san roque' as check,
         count(distinct parish_id) = 2 as pass
  from public.collections
  where parish_id in ('a1111111-1111-1111-1111-111111111111','a2222222-2222-2222-2222-222222222222');

  select 'd2 bishop cannot see other diocese (sto niño / cubao)' as check,
         count(*) = 0 as pass
  from public.collections where parish_id = 'b1111111-1111-1111-1111-111111111111';

  -- diocese role is READ-only: a write must not succeed (0 rows affected, no escalation)
  select 'd3 bishop has no parish to write into (read-only)' as check,
         public.auth_parish_id() is null as pass;
rollback;
