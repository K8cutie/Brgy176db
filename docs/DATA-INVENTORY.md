# ChurchOS — Data Inventory & ROPA

> Owner: Data Protection / Platform
> Last reviewed: 2026-06-24
> Scope: ChurchOS SaaS (Supabase Postgres). The Electron desktop build keeps the
> equivalent data in a local database on the parish's own machine (no processor).

This is a Record of Processing Activities (ROPA): the tables ChurchOS stores, what
personal data they hold, who processes them, and how long they're kept. It is a
living document — update it whenever a table or processor changes.

## Legal/role summary

- **Controller:** the parish/diocese using ChurchOS (they decide why personal data is
  processed). ChurchOS (the vendor) is the **processor/sub-processor** providing the
  software and hosting.
- **Sub-processors:** Supabase (database, auth, edge runtime, storage); Vercel (SPA
  hosting); Anthropic (assistant inference — see note); Xendit (billing); Sentry (error
  monitoring, only if a DSN is configured).
- **PII sensitivity legend:** None | Low (name/contact) | **High** (sacramental,
  financial, or assistance/welfare data — often special-category under data-protection
  law and Catholic record-keeping norms).

## Tables

| Table | Contains | PII | Sensitivity | Processor(s) | Retention |
|-------|----------|-----|-------------|--------------|-----------|
| `profiles` | App user account, role, parish link | name, email, role | Low | Supabase | Life of account; delete on offboarding |
| `parishes` | Parish org record | parish name, address, contacts | Low | Supabase | Life of tenant |
| `dioceses` | Diocese org record | diocese name, contacts | Low | Supabase | Life of tenant |
| `families` | Parishioner family/household directory | names, contact, address | Low–High | Supabase | While parishioner active; review periodically |
| `baptism_records` | Sacramental register | names, DOB, parents, sponsors | **High** | Supabase | **Permanent** (canonical church register) |
| `marriage_records` | Sacramental register | names, spouses, witnesses | **High** | Supabase | **Permanent** |
| `confirmation_records` | Sacramental register | names, sponsors | **High** | Supabase | **Permanent** |
| `death_records` | Sacramental register | names, dates | **High** | Supabase | **Permanent** |
| `collections` | Mass collection totals | amounts, mass time, date | None–Low | Supabase | Financial retention (≥7 yrs) |
| `journal_entries` | Double-entry ledger | amounts, accounts, postedBy | Low (actor) | Supabase | Financial retention (≥7 yrs) |
| `budget_items` | Budget lines | amounts | None | Supabase | Current + prior cycles |
| `fee_override_audit` | **Append-only** audit of fee overrides | actor, reason, amount | Low (actor) | Supabase | **Permanent / append-only** (oversight backbone — do not alter) |
| `service_requests` | Sacrament/cert requests | requester name, contact, details | Low–High | Supabase | Until fulfilled + retention window |
| `calendar_events` | Parish calendar | titles, possibly names | Low | Supabase | Rolling; archive old events |
| `availability_slots` | Scheduling availability | minister/staff name, times | Low | Supabase | Current scheduling horizon |
| `ministries` | Ministry groups/members | member names, roles | Low | Supabase | While active |
| `ssdm_applications` | Social services / assistance applications | applicant identity, need details | **High** (welfare/special-category) | Supabase | Per assistance policy; minimize |
| `ssdm_beneficiaries` | Assistance beneficiaries | identity, household info | **High** | Supabase | Per assistance policy; minimize |
| `ssdm_disbursements` | Assistance payouts | beneficiary, amount, date | **High** | Supabase | Financial + welfare retention |
| `diocese_reports` | Aggregated reports to diocese | aggregates (may embed identities) | Low–High | Supabase | Per reporting cycle |
| `subscriptions` | Billing subscription state | parish link, billing status, Xendit ids | Low | Supabase, Xendit | Life of subscription + financial retention |
| `parish_invites` | Onboarding invites | invitee email, token | Low | Supabase | Until accepted/expired; then purge |
| `rate_limits` | Abuse-prevention counters | IP/identifier, timestamps | Low | Supabase | Short (rolling window) |
| `app_secrets` | Server-side secret storage | **secrets** (not personal data) | n/a (secret) | Supabase | Until rotated; never exposed to client |

## Data flows involving external processors

- **Assistant (`ai` edge function → Anthropic):** the function sends conversation
  messages and the figures returned by RLS-scoped tool calls to Anthropic for
  inference. Sacramental/financial context may be included in a prompt. Treat Anthropic
  as a sub-processor for assistant interactions; do not enable assistant features for a
  tenant that has not accepted this.
- **Billing (`xendit-webhook` ↔ Xendit):** subscription/billing identifiers flow to and
  from Xendit. No sacramental data is sent to Xendit.
- **Error monitoring (Sentry):** **disabled unless `VITE_SENTRY_DSN` is set.** When
  enabled, only error messages + React component stacks are sent — **no** user identity
  or parish data (`sendDefaultPii: false`). See `docs/observability.md`.

## Data-subject rights & retention notes

- **Sacramental registers are permanent** by canonical practice; "erasure" requests
  against them are handled per diocese policy (typically annotation, not deletion).
- **Welfare/assistance data (`ssdm_*`) is special-category** — minimize collection,
  restrict access, and apply the shortest defensible retention.
- **Financial records** follow statutory financial-retention periods (≥7 years
  typical); confirm the exact period with the controller.
- **Account/profile and invite data** should be purged on offboarding/expiry.

## Action items (escalations)

- Confirm a signed Data Processing Agreement (DPA) is in place with Supabase, Vercel,
  Anthropic, Xendit, and (if used) Sentry.
- Confirm data residency requirements with controllers (where Supabase hosts the data).
- Confirm and document exact statutory retention periods per data class.
- Confirm Supabase backup retention + PITR (cross-reference `docs/SLO.md` RPO).
