# ChurchOS — local-first cloud sync

> Owner: Platform / on-call &nbsp;|&nbsp; Last reviewed: 2026-06-24

ChurchOS is **local-first**: the secretary works fully **offline** on the desktop
app (local scrypt login + local SQLite + backups). When online, the app **pushes**
the parish's data up to the cloud so the **diocese cockpit** can roll it up. Daily
work never depends on the internet — sync is a background extra, not the path in.

## Model (why it's simple)
- **One desktop install per parish** (single-instance lock) → **single writer** →
  push-dominant, **last-write-wins by `client_id`**, almost no conflict logic.
- The app pushes only `{ parish_id, client_id, data }` per record; the cloud
  **derive triggers** recompute the flat analytics columns, so the mapping lives
  in one place. (`electron/sync.cjs`)
- Auth uses the **parish's cloud account** (created via onboarding/invite), stored
  locally. The local login is separate, so offline work is unaffected.

## Connecting (Settings → Backup → "Cloud Sync")
Enter the **Cloud URL**, **anon key**, and the parish **cloud email + password**,
Save, then **Sync Now** (or it runs when online). The diocese sees the roll-up; it
cannot edit a parish's records.

## Hardening done (red-team → fix; `tests/sync-test.cjs`)
- **Tenant safety:** a tampered local store can't push into another parish —
  `buildRows` stamps the resolved cloud `parish_id`, and the cloud `force_parish_id`
  trigger (now `BEFORE INSERT OR UPDATE`) + RLS `WITH CHECK` override it server-side.
- **Append-only audit:** the audit dataset pushes **insert-only** (`ignore-duplicates`),
  so it never trips the append-only trigger / corrupts history.
- **Resilience:** per-dataset failure isolation (one table failing doesn't block the
  rest; next sync re-pushes — idempotent), **chunked** batches (payload/timeout safe),
  **id dedup** + bad-id (`"null"`/`""`) drop so one batch can't double-hit ON CONFLICT.
- **Clean failure** when the account has no parish yet (onboarding incomplete).

## Known v1 limitations (tracked, not shipped yet)
- **Deletes don't propagate** (no tombstones). A record deleted locally lingers in
  the cloud. Fine for add/edit-heavy parish work; **v1.1**: soft-delete via a local
  deletion log → push `deleted_at`; diocese views filter it out. Audit is never
  tombstoned (immutable by design).
- **Credentials at rest** are plaintext in the local DB (like the AI key). **v1.1**:
  Windows DPAPI / a device-scoped refresh token instead of a reusable password.
- **Stale-snapshot push:** restoring an old backup and syncing would overwrite newer
  cloud state (blind LWW). **v1.1**: a server-side `updated_at`/version guard.
- **Token expiry** on a very large first sync. Mitigated by chunking + idempotent
  retry; **v1.1**: refresh-and-resume.

## First live test
After the cloud is up (`SAAS-GOLIVE.md`): create a parish account via onboarding,
enter its credentials here, click **Sync Now**, then open the diocese cockpit and
watch this parish's collections appear in the roll-up.
