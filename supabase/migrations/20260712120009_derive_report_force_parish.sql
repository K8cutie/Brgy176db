-- ══════════════════════════════════════════════════════════════════════════
-- 20260712120009_derive_report_force_parish.sql   (idempotent; safe to re-run)
--
-- FIX BUG-1h — derive_report()'s server-side parish_id auto-set is DEAD CODE. Like
-- the guards fixed in 20260712120007_authz_fix.sql it gates on
--     current_user in ('authenticated','anon')
-- but inside a SECURITY DEFINER body current_user is always the owner ('postgres'),
-- so the branch NEVER runs. A client INSERT into diocese_reports that omits parish_id
-- (relying on the server to stamp it) keeps parish_id = NULL → violates the NOT NULL
-- column AND fails the RLS WITH CHECK (parish_id = auth_parish_id()), so a parish
-- cannot push its monthly diocese packet.
--
-- Re-gate on public.is_untrusted_client_write() (defined in 0007): a JWT-derived role
-- + a transaction-local capability nonce that DO survive the definer boundary. Untrusted
-- public-API writes get parish_id forced to auth_parish_id(); trusted service_role/owner/
-- seed writes keep their supplied parish_id. Mirrors force_parish_id (BUG-1b). The body
-- is otherwise byte-for-byte identical (diocese/net derivation, bounds, period regex).
-- trg_derive_report already points at this function, so create-or-replace applies the
-- fix with no trigger change. RLS is unchanged — this is defense-in-depth alongside it.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.derive_report()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if public.is_untrusted_client_write() then
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
