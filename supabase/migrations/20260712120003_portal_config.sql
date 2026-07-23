-- ══════════════════════════════════════════════════════════════════════════
-- ChurchOS SaaS — in-app editor for the public-portal config (public_config)
--
-- WHAT THIS DOES
--   Lets a signed-in parish staffer READ and WRITE their OWN parish's
--   public_config (the services offered, per-service fees, office contact, and
--   the intake master switch) from inside ChurchOS — instead of an operator
--   hand-editing JSON in the database.
--
--   parishes has ONLY a SELECT policy (parish_visible, in churchos-saas-setup.sql)
--   and RLS is FORCEd — there is NO staff-facing UPDATE policy on parishes, so a
--   direct client .update() is (correctly) blocked. Rather than open a broad
--   UPDATE policy on the whole parishes row (which would also expose name,
--   billing_status, diocese_id, config, slug to client mass-assignment), we add
--   two narrow SECURITY DEFINER RPCs that touch ONLY public_config for the
--   caller's own parish, resolved from the JWT via the same auth_parish_id()
--   helper the rest of the RLS uses:
--     • get_public_config()            → returns the caller's parish public_config
--     • set_public_config(p_config jsonb) → overwrites ONLY that parish's
--                                            public_config, after validating the
--                                            payload is a JSON object.
--
--   set_public_config MERGES over the existing public_config, so keys the in-app
--   editor does NOT manage (e.g. a hand-authored `requirements` sacrament
--   override) are PRESERVED — the editor only owns intake_enabled/services/
--   fees/contact, and the app sends exactly those.
--
-- WHEN TO RUN
--   Operator-run, AFTER churchos-saas-setup.sql (auth_parish_id) and
--   churchos-saas-portal.sql (the public_config column + parish_public RPC).
--   Safe to run alongside the other churchos-saas-*.sql. RE-RUNNABLE
--   (idempotent): create-or-replace functions + revoke/grant only. NOT applied
--   by the app; paste into the Supabase SQL editor (PostgreSQL 15).
--
-- SECURITY NOTES
--   • Both functions are SECURITY DEFINER with a pinned search_path=public
--     (red-team: definer-helper-search-path) and are granted to `authenticated`
--     only — NOT anon. The public website never calls these.
--   • set_public_config writes ONLY public_config, ONLY WHERE id = auth_parish_id().
--     A caller with no parish (auth_parish_id() IS NULL) updates zero rows — the
--     `where id = null` matches nothing — and the function raises, so a rogue
--     signed-in user can never touch another parish or a NULL-keyed row.
--   • The payload MUST be a jsonb object (jsonb_typeof = 'object'); a non-object
--     is rejected loudly rather than corrupting the column the portal reads.
--   • The DB is the authority for what a service "is": callers may send whatever,
--     but the portal only renders the four known services and coerces fees, and
--     the intake trigger (normalize_request) independently reads intake_enabled
--     + fees, so a malformed config degrades the portal, never the trust model.
--
-- HOW TO VERIFY (after running)
--   1) Functions exist and are definer:
--        select proname, prosecdef from pg_proc
--        where proname in ('get_public_config','set_public_config');
--        → both prosecdef = true
--   2) Round-trip as a signed-in staffer (their JWT resolves auth_parish_id()):
--        select public.get_public_config();                 -- current config
--        select public.set_public_config('{"intake_enabled":true,"services":["mass_intention"],"fees":{"mass_intention":200},"contact":{"phone":"(02) 8xxx"}}'::jsonb);
--        select public.get_public_config();                 -- reflects the write
--   3) Rejection test:
--        select public.set_public_config('"not an object"'::jsonb);  -- MUST raise
-- ══════════════════════════════════════════════════════════════════════════

-- parishes has no updated_at column in the base schema (only created_at); add it
-- idempotently so set_public_config can stamp the last edit. Harmless if present.
alter table public.parishes add column if not exists updated_at timestamptz default now();

-- ── READ: the caller's own parish public_config (resolved from their JWT) ──
create or replace function public.get_public_config()
returns jsonb
language sql stable security definer set search_path = public as $$
  select public_config from public.parishes where id = public.auth_parish_id();
$$;
revoke all on function public.get_public_config() from public;
grant execute on function public.get_public_config() to authenticated;

-- ── WRITE: overwrite ONLY public_config for the caller's own parish ──
-- Merges over the existing config so unmanaged keys (e.g. requirements) survive.
create or replace function public.set_public_config(p_config jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_parish uuid := public.auth_parish_id();
  v_result jsonb;
begin
  if v_parish is null then
    raise exception 'no parish for the current user';
  end if;
  -- Payload must be a JSON object; reject anything else (array/scalar/null) so we
  -- never corrupt the config the public portal + intake trigger read.
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'public_config must be a JSON object';
  end if;

  update public.parishes
     set public_config = coalesce(public_config, '{}'::jsonb) || p_config,
         updated_at = now()
   where id = v_parish
  returning public_config into v_result;

  return v_result;
end $$;
revoke all on function public.set_public_config(jsonb) from public;
grant execute on function public.set_public_config(jsonb) to authenticated;
