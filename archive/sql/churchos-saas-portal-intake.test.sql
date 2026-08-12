-- ════════════════════════════════════════════════════════════════════════
--  REGRESSION TEST — public portal intake RLS (FIX BUG-1g)
--
--  Run:  psql "<conn>" -f churchos-saas-portal-intake.test.sql
--  (or via pglite). Exits silently (NOTICE: PASS); RAISES (non-zero) on failure.
--
--  Proves an anon portal submission is ACCEPTED after normalize_request() server-
--  forces a NON-NULL amount — the exact case the old `amount is null` WITH CHECK
--  rejected (100% of mass intentions / certificates / donations). Self-contained in
--  an isolated `_t` schema + a rolled-back transaction, so it never touches public.
-- ════════════════════════════════════════════════════════════════════════
begin;
create schema _t;
set local search_path = _t;

create table service_requests (id uuid primary key default gen_random_uuid(), parish_id uuid,
  status text, payment_status text, payment_ref text, amount numeric, type text, public_token uuid);

-- minimal stand-in for the real BEFORE trigger: it SERVER-FORCES the fields, incl. a
-- non-null amount (the fee/donation). This is what made the old `amount is null` reject.
create function normalize_request() returns trigger language plpgsql as $fn$
begin
  new.status := 'submitted'; new.payment_status := 'unpaid'; new.payment_ref := null;
  new.amount := 5;
  new.public_token := coalesce(new.public_token, gen_random_uuid());
  return new;
end $fn$;
create trigger trg_normalize_request before insert on service_requests
  for each row execute function normalize_request();

create role _t_anon nologin;
grant usage on schema _t to _t_anon;
grant insert, select on service_requests to _t_anon;
alter table service_requests enable row level security;
alter table service_requests force row level security;

-- the FIXED policy (no `amount is null` clause — the trigger owns amount)
create policy req_public_submit on service_requests for insert to _t_anon
  with check (status = 'submitted' and payment_status = 'unpaid' and payment_ref is null);
create policy req_public_read on service_requests for select to _t_anon using (true);

do $assert$
declare n int;
begin
  set local role _t_anon;                 -- act as the anonymous portal visitor
  insert into service_requests (parish_id, type) values (gen_random_uuid(), 'baptism');
  select count(*) into n from service_requests;
  reset role;
  if n <> 1 then raise exception 'FAIL: anon portal intake was rejected (got % rows)', n; end if;
  raise notice 'PASS: anon portal intake is accepted (server-forced amount no longer rejected)';
end $assert$;
rollback;
