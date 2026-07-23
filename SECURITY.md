# Security Policy

## Reporting a vulnerability
Please report security issues **privately** to **archgarcia@gmail.com**
(subject: `ChurchOS security`). Do **not** open a public issue for a security bug.

We aim to acknowledge a report within **3 business days** and to keep you updated
through to a fix. Responsible disclosure is appreciated — please give us a
reasonable window to remediate before any public write-up.

A machine-readable version of this contact is published at
[`/.well-known/security.txt`](./public/.well-known/security.txt) (RFC 9116).

## Supported version
The live cloud SaaS at **churchos-fawn.vercel.app** is the supported version.
Fixes ship there; there is no separate maintained release line.

## How ChurchOS protects parish data

**Encryption**
- **In transit:** all traffic is HTTPS/TLS (Vercel edge + Supabase). No plaintext endpoints.
- **At rest:** Supabase (Postgres + Storage) encrypts data at rest by default (AES-256) — this covers every parish record and every scanned form image.

**Tenant isolation**
- Per-parish **row-level security (RLS)** on every domain table, plus a
  `force_parish_id` trigger that stamps the owner server-side — a parish can
  never read or write another parish's rows.
- Scanned original forms live in a **private per-parish Storage bucket**
  (`form-scans`), isolated by an object-path prefix that the RLS `WITH CHECK`
  pins to the caller's parish; private objects are served only via short-lived
  signed URLs.
- Diocese-level roles get **read-only** access scoped to their own diocese's parishes.

**Secrets & AI**
- The Anthropic API key and Supabase service key live only in Supabase
  edge-function secrets — never in the browser bundle or the git repo.
- Every billed AI call passes a **per-parish rate limit + daily budget cap**
  (denial-of-wallet guard), checked before any spend.

**Integrity / audit**
- The fee-override ledger is **append-only** and HMAC-hash-chained; registry
  edits are recorded as struck-through (never erased) marginal annotations.

## Database access
Schema, RLS, functions, and triggers are defined in the repo
(`supabase/migrations/`, see `MIGRATIONS.md`) — not managed ad-hoc in a
dashboard. Dynamic SQL in the schema (`execute format(...)`) operates only on
hard-coded identifiers, never on user input.
