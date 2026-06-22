# ChurchOS — Full-SaaS Architecture Blueprint
### Urban / Metro Manila edition (online-first, no sync engine)

> **Guiding principle:** ONE React codebase, a swappable storage backend.
> - **Urban SaaS** → Supabase backend (online). *This document.*
> - **Rural** → the local-first Electron + SQLite build that already exists.
>
> Because urban dioceses are reliably online, **we skip the hardest piece — the
> offline sync engine.** The app talks to Supabase directly. The local-first
> desktop becomes the rural product later; the React UI is shared by both.

---

## 1. Tenancy model

Two levels: **diocese → parish → users.**

```
diocese (Archdiocese of Manila)
  └── parish (St. Mary Magdalene)
        └── users:  secretary · priest · finance_council
diocese-level users: diocese_admin · bishop   (read across all their parishes)
```

Every domain row carries a `parish_id`. The diocese is derived through the
`parishes.diocese_id` link, so a bishop sees every parish under his diocese.

---

## 2. Schema — hybrid relational + JSONB

Each domain table = `parish_id` + a few **indexed columns that power analytics &
oversight** + a `data jsonb` holding the full record. This keeps cross-parish SQL
fast *and* keeps the flexible shape you already store locally → minimal rewrite.

```sql
-- ── Org ──
create table dioceses ( id uuid primary key default gen_random_uuid(),
  name text not null, created_at timestamptz default now() );

create table parishes ( id uuid primary key default gen_random_uuid(),
  diocese_id uuid references dioceses, name text not null,
  config jsonb default '{}', billing_status text default 'trial',
  created_at timestamptz default now() );

-- profile per auth user: which parish/diocese, and role
create table profiles ( id uuid primary key references auth.users on delete cascade,
  parish_id uuid references parishes,
  diocese_id uuid references dioceses,
  role text not null check (role in
    ('secretary','priest','finance_council','diocese_admin','bishop')),
  full_name text );

-- ── Domain (analytics-critical columns flat; full record in data) ──
create table collections ( id uuid primary key default gen_random_uuid(),
  parish_id uuid references parishes not null,
  date date not null, mass_time text,                  -- ← powers "lowest Mass" query
  cash numeric, checks numeric, digital numeric, total numeric,
  posted_by text, status text default 'Posted',
  data jsonb default '{}', created_at timestamptz default now() );
create index on collections (parish_id, date);
create index on collections (parish_id, mass_time);

create table journal_entries ( id uuid primary key default gen_random_uuid(),
  parish_id uuid references parishes not null,
  date date not null, reference text, description text, status text,
  total_dr numeric, total_cr numeric, posted_by text,
  lines jsonb default '[]',                             -- account_code/debit/credit
  created_at timestamptz default now() );
create index on journal_entries (parish_id, date);
-- For diocese-wide Pareto, expose journal lines as a view:
--   create view expense_lines as
--   select parish_id, date, l->>'accountCode' code, l->>'accountName' name,
--          (l->>'debit')::numeric debit
--   from journal_entries, jsonb_array_elements(lines) l;

create table fee_override_audit ( id uuid primary key default gen_random_uuid(),
  parish_id uuid references parishes not null,
  ts timestamptz, sacrament text, registry_id text, person_name text,
  override_type text, amount numeric, reason text, recorded_by text,
  prev_hash text, hash text );                          -- ← tamper-evident chain, bishop oversight

-- Sacraments, directory, ministries, ssdm, calendar, budget: same pattern —
-- parish_id + a few indexed keys (date, registry_number, type) + data jsonb.
create table baptism_records   ( id uuid primary key default gen_random_uuid(),
  parish_id uuid references parishes not null, registry_number text,
  date_of_baptism date, data jsonb );
-- (marriage_records, confirmation_records, death_records, families,
--  ministries, ssdm_applications, calendar_events, budget_items … identical shape)
```

---

## 3. Row-Level Security — the tenancy boundary

RLS is the *whole* security model (the browser talks straight to Postgres, same
as Megyprints). The pattern, applied to every domain table:

```sql
alter table collections enable row level security;

-- Parish staff: full access to THEIR parish only.
create policy "parish members access own parish"
  on collections for all
  using      ( parish_id = (select parish_id from profiles where id = auth.uid()) )
  with check ( parish_id = (select parish_id from profiles where id = auth.uid()) );

-- Diocese (bishop / diocese_admin): READ across every parish in their diocese.
create policy "diocese reads its parishes"
  on collections for select
  using ( parish_id in (
            select p.id from parishes p
            where p.diocese_id = (select diocese_id from profiles where id = auth.uid())
          )
          and (select role from profiles where id = auth.uid())
              in ('diocese_admin','bishop') );
```

The same two policies (parish-write + diocese-read) clone onto every table. The
diocese is **read-only** — oversight, not editing — which is exactly the
governance posture the bishop wants.

---

## 4. The storage-seam reroute (the elegant reuse)

Today: `usePersistedState → storageNamespaced → local store`, with an in-memory
cache (`desktopStore`) so the UI runs **synchronously**.

For SaaS, add a **third backend** that swaps in behind the same seam — and it
reuses the exact cache pattern, just pointed at Supabase:

```
On login:
  1. fetch the parish's rows from Supabase  →  hydrate the in-memory cache
The app then runs SYNCHRONOUSLY, unchanged (same usePersistedState reads).
On write:
  2. update the cache (instant UI)  +  async upsert to Supabase (write-through)
```

A parish is only a few MB, so loading it on login is trivial. **Result: the
parish-facing UI barely changes** — same hook, same pages, just hydrated from
the cloud instead of SQLite. This is the *same move* as localStorage→SQLite, a
third time.

> The **diocese cockpit** is the one part that does NOT use the cache — it issues
> direct async cross-parish queries/views against Supabase.

---

## 5. Where the AI key lives

No Electron main process in a browser → the key **cannot** be client-side.

```
Browser (user JWT) ──► Supabase Edge Function  ──► Claude API
                          • holds ANTHROPIC_API_KEY (server env)
                          • runs the tool calls against the user's
                            parish data (RLS-scoped to their JWT)
                          • meters usage per parish  → billing
```

The browser calls *your* edge function, never Anthropic directly. Same principle
as the desktop (key in the trusted layer) — the trusted layer is now an edge
function instead of the Electron main process. Per-parish metering here is what
keeps the AI cost self-funded under per-parish billing.

---

## 6. The diocese cockpit

A `diocese_admin` / `bishop` role + a `/diocese` section. Because all parishes'
data lives in one Postgres, cross-parish analytics is **just SQL / views** — the
"which parish's evening Mass is bleeding?" query, live, across the whole diocese.
This is net-new UI, but trivial server-side.

---

## 7. Deployment & ops

| Layer | Choice |
|---|---|
| Frontend | static React build → Vercel / Cloudflare Pages (no install) |
| Backend | **Supabase** — Postgres + Auth + RLS + Edge Functions |
| AI | Supabase Edge Function holding the API key |
| Billing | PayMongo/Stripe + `parishes.billing_status`, per-parish-connected |
| Cost | ~$25/mo Supabase runs ~80 parishes (see earlier math) |

No servers to manage.

---

## 8. Build sequence

1. Supabase project → schema (§2) → RLS (§3).
2. Real auth — replace the local mock login with Supabase Auth + `profiles`.
3. `cloudStore` backend + hydrate-cache (§4) — reroute the seam.
4. AI edge function (§5).
5. Diocese cockpit (§6).
6. Billing + web deploy (§7).

---

## 9. What you reuse vs build

| Reuse (already built) | Build new |
|---|---|
| The entire React UI + every feature | Supabase schema + RLS |
| The AI assistant logic & tools | The `cloudStore` backend (seam reroute) |
| The analytics + the audit-trail hash chain | AI edge function |
| `diocesePacket.ts` (privacy-safe summaries) | Diocese cockpit UI |
| The offline Electron build → **becomes the rural version** | Auth + billing + deploy |

**Net:** the urban SaaS is mostly *assembly* of patterns you've already proven —
Supabase + RLS (from Megyprints) on top of the React app + AI (from ChurchOS).
The new invention is small; the reuse is large.
