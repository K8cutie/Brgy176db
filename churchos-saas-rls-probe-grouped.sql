-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — RLS probe, GROUPED so every check is visible.
-- The Supabase editor only shows the LAST result set, so this is two
-- self-contained blocks, each ending in ONE result table.
--
--   ▶ RUN EACH BLOCK SEPARATELY: highlight the block (BEGIN … ROLLBACK) and Run.
--   ▶ Every `pass` column must read TRUE. A single false is a release blocker.
-- ══════════════════════════════════════════════════════════════════════════

-- ═══ BLOCK 1 — Secretary Aida (St. Mary Magdalene). Highlight to its ROLLBACK, Run. ═══
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}';

  -- attempt self-promotion + tenant hop (the guard must freeze these)
  update public.profiles
     set role='bishop', parish_id='a2222222-2222-2222-2222-222222222222', diocese_id='22222222-2222-2222-2222-222222222222'
   where id = auth.uid();
  -- attempt a forged-parish insert (force_parish_id must rewrite it to her own)
  insert into public.collections (parish_id, client_id, data)
    values ('a2222222-2222-2222-2222-222222222222','PROBE-1','{"date":"2026-06-07","massTime":"6:00 AM","cash":100}');

  select * from (values
    ('a1 aida sees only st.mary collections',         (select count(*) filter (where parish_id <> 'a1111111-1111-1111-1111-111111111111') = 0 from public.collections)),
    ('a2 aida cross-parish read blocked (san roque)', (select count(*) = 0 from public.collections where parish_id='a2222222-2222-2222-2222-222222222222')),
    ('b1 aida cross-diocese read blocked (sto niño)', (select count(*) = 0 from public.collections where parish_id='b1111111-1111-1111-1111-111111111111')),
    ('a3 expense_lines view does not leak',           (select count(*) filter (where parish_id <> 'a1111111-1111-1111-1111-111111111111') = 0 from public.expense_lines)),
    ('c1 aida cannot self-promote to bishop',         (select role from public.profiles where id=auth.uid()) = 'secretary'),
    ('c1b aida cannot tenant-hop (parish frozen)',    (select parish_id from public.profiles where id=auth.uid()) = 'a1111111-1111-1111-1111-111111111111'),
    ('c2 forged parish_id forced back to own parish', (select parish_id from public.collections where client_id='PROBE-1') = 'a1111111-1111-1111-1111-111111111111'),
    ('c2b flat total derived from data (=100)',       (select total from public.collections where client_id='PROBE-1') = 100)
  ) as t(check, pass);
rollback;

-- ═══ BLOCK 2 — Bishop Tomás (Manila diocese). Highlight from this BEGIN to its ROLLBACK, Run. ═══
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}';

  select * from (values
    ('d1 bishop sees st.mary + san roque',            (select count(distinct parish_id) = 2 from public.collections where parish_id in ('a1111111-1111-1111-1111-111111111111','a2222222-2222-2222-2222-222222222222'))),
    ('d2 bishop cannot see other diocese (sto niño)', (select count(*) = 0 from public.collections where parish_id='b1111111-1111-1111-1111-111111111111')),
    ('d3 bishop read-only (no parish to write)',      public.auth_parish_id() is null)
  ) as t(check, pass);
rollback;
