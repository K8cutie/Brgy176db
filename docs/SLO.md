# ChurchOS — Service Level Objectives (SLOs)

> Owner: Platform / On-call
> Last reviewed: 2026-06-24
> Applies to: ChurchOS SaaS (Vercel-hosted SPA + Supabase Postgres + Edge Functions).
> The Electron desktop build is local-first/offline — see "Desktop" note at the end.

ChurchOS handles parish money (collections, expenses, sacrament fees, billing). The
SLOs below are deliberately conservative: a parish bookkeeper must trust that what they
posted is durable and that the numbers they see are correct.

## Service Level Indicators (SLIs)

| # | SLI | Definition (how measured) | Source |
|---|-----|---------------------------|--------|
| 1 | App availability | % of SPA loads that return a usable shell (HTTP 2xx for `index.html` + assets) | Vercel / synthetic check |
| 2 | API availability | % of Supabase REST/RPC + Edge Function requests returning non-5xx | Supabase logs / Sentry |
| 3 | API latency | p95 latency of read queries and edge functions (`ai`, `xendit-webhook`) | Supabase / function logs |
| 4 | Write durability | % of successful client writes that survive (no silent loss / rollback) | DB audit + reconciliation |
| 5 | Billing-webhook correctness | % of Xendit callbacks that map to the correct subscription status | webhook logs + audit |
| 6 | Data freshness (sync) | lag between a desktop sync push and cloud visibility | sync logs |

## Service Level Objectives (targets, 30-day rolling)

| SLI | Objective |
|-----|-----------|
| App availability | **99.5%** |
| API availability | **99.5%** |
| API latency (reads) | **p95 < 800 ms** |
| Edge fn latency (`ai`) | **p95 < 12 s** (bounded by the 10 s upstream Anthropic timeout + overhead) |
| Edge fn latency (`xendit-webhook`) | **p95 < 1 s** |
| Write durability | **99.99%** (effectively zero tolerated loss of committed financial rows) |
| Billing-webhook correctness | **100%** target; any miss is a P1 incident |

## Error budget

- Availability SLOs of 99.5% over 30 days ⇒ **~3h 39m** of allowed downtime/errors per month.
- Policy:
  - **Budget healthy (>50% remaining):** ship normally.
  - **Budget < 50%:** freeze risky changes; prioritize reliability work.
  - **Budget exhausted:** change freeze except reliability/security fixes until the
    budget recovers.
- **Money correctness is NOT on an error budget.** Billing-webhook correctness and
  write durability for financial rows are treated as hard invariants — a violation is
  an incident regardless of remaining budget.

## RTO / RPO (disaster recovery)

| Metric | Target | Notes |
|--------|--------|-------|
| **RTO** (Recovery Time Objective) | **4 hours** | Time to restore service after a major outage. |
| **RPO** (Recovery Point Objective) | **24 hours** | Max tolerable data loss. Supabase automated daily backups + PITR where enabled. **Action item:** confirm PITR is enabled on the production project (see escalation list). |

- Backups: Supabase managed daily backups. Verify retention ≥ 7 days.
- Restore drill: perform a documented restore-to-staging test at least **quarterly**
  and record the actual achieved RTO/RPO.

## Incident severity

| Sev | Definition | Response |
|-----|------------|----------|
| **P1** | Money incorrect (wrong billing status, lost financial write), or full outage | Page on-call immediately; declare incident. |
| **P2** | Partial outage / elevated errors within budget | Same-day investigation. |
| **P3** | Degraded latency, cosmetic | Next business day. |

## Desktop (Electron, offline) note

The desktop build is local-first: availability == the user's machine, and durability
rests on the local DB + the backup flow (`tests/backup-test.cjs`). The SaaS SLOs above
do not apply to a single-PC install; for desktop, the equivalent guarantees are
"backups run and restore cleanly" and "sync eventually reconciles without data loss."
