-- ═══════════════════════════════════════════════════════════════════════════
-- form-scans — private per-parish Storage bucket for scanned ORIGINAL forms
--
-- These are the digital paper trail: the scanned source document attached to a
-- sacramental record so a typo can always be traced back to the original. The
-- record itself carries only the object PATH (see RecordAttachment); the bytes
-- live here, private, served only via short-lived signed URLs.
--
-- TENANCY: storage.objects has no parish_id column and can't take the
-- force_parish_id() BEFORE trigger the domain tables use — so the object-PATH
-- prefix IS the tenancy key, and the WITH CHECK policy is the load-bearing
-- cross-parish boundary (not defence-in-depth). Object path convention:
--   <parish_id>/<record_id>/<uuid>.<ext>
-- so (storage.foldername(name))[1] = the owning parish uuid.
--
-- Re-runnable. Apply out-of-band like the other churchos-saas-*.sql scripts:
--   npx supabase db query --linked --file churchos-saas-form-scans.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Private bucket (public=false → objects reachable only via createSignedUrl).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-scans', 'form-scans', false, 10485760,
        array['image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Parish staff: full read/write, but ONLY within their own parish's prefix.
-- The WITH CHECK pins the first path segment to the caller's parish, so a
-- client can never plant an object under another parish's folder.
drop policy if exists form_scans_parish_all on storage.objects;
create policy form_scans_parish_all on storage.objects
  for all to authenticated
  using (
    bucket_id = 'form-scans'
    and (storage.foldername(name))[1] = public.auth_parish_id()::text
  )
  with check (
    bucket_id = 'form-scans'
    and (storage.foldername(name))[1] = public.auth_parish_id()::text
  );

-- Diocese admins / bishops: read-only across their diocese's parishes (mirrors
-- the diocese_read_* table policies). Parish-level auth_parish_id() is NULL for
-- these users, so the parish_all policy already grants them nothing here.
drop policy if exists form_scans_diocese_read on storage.objects;
create policy form_scans_diocese_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'form-scans'
    and public.auth_role() in ('diocese_admin', 'bishop')
    and (storage.foldername(name))[1] in (
      select id::text from public.parishes where diocese_id = public.auth_diocese_id()
    )
  );
