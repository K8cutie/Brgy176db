# ChurchOS — Parish & Diocese Onboarding Playbook

> Owner: Onboarding (mom-led) / Platform &nbsp;|&nbsp; Last reviewed: 2026-07-15

How to take a diocese and its parishes from first conversation to live, repeatably.
This is the **cloud SaaS** onboarding (churchos-fawn.vercel.app + Supabase). For
standing up the platform itself, see `SAAS-GOLIVE.md`. For the deprecated offline
desktop install, see `BETA-RUNBOOK.md`.

## The model (read once)
- **The diocese is the unit of sale**, not the parish. You onboard a diocese, then
  its parishes one at a time. Value compounds diocese-wide (standardized once,
  clean audits, priest rotations always land in the same system).
- **Mom is the onboarding authority**, not a cost. She sells the outcome (the
  audit, the standardization) and runs migration + training; ChurchOS is her
  force-multiplier. Her fee sits *on top of* the subscription.
- **Two migration lanes.** Every parish is one of: (A) on PIMS/PMS → native `.PAR`
  import, (B) on Excel → CSV/XLSX import, (C) pure paper → scan pipeline. Discovery
  decides the lane.
- **The future is born-digital.** Once a parish is live, new records arrive through
  the parishioner portal — no paper. The backfill is a one-time, paced effort.

---

## Phase 0 — Platform prerequisites (once per deployment, not per parish)
- [ ] SaaS is live and verified — `SAAS-GOLIVE.md` complete (schema run in order,
      **`churchos-saas-authz-fix.sql` applied**, tenant-isolation probe passes).
- [ ] **`ANTHROPIC_API_KEY` set** in Supabase → Edge Functions → Secrets (wakes the
      scan reader + Cherub). Verify: an authenticated `scan-extract` call returns
      `bad_request`, not `no_key`. **Set the console spend limit + keep credit topped.**
- [ ] **Seed/test accounts removed.** The `*.churchos.test` / `Test1234!` logins are a
      live backdoor — delete them before ANY real parish data lands.

---

## Phase 1 — Diocese engagement & provisioning
The sale + the account. Mom's relationship carries this.
- [ ] **Pitch the diocese:** "standardize every parish so mandated priest rotations
      stop breaking things," anchored on the **November budget-hearing audit**
      (months → days) and clean 6-year endorsements. Mom = the credibility.
- [ ] **Provision the diocese** via `churchos-saas-onboarding.sql` (self-service
      diocese onboarding + parish invites). This creates the `diocese_admin`, the
      diocese, and the first parish shell.
- [ ] Confirm billing terms (per-parish subscription; mom's service fee separate).

---

## Phase 2 — Per-parish discovery (decides the migration lane)
Do this before touching a parish's data. ~15 min conversation.
- [ ] **What system are they on?** → sets the lane:
  - PIMS / PMS (FoxPro) → **Lane A** (native backup import)
  - Excel / spreadsheets → **Lane B** (CSV/XLSX import)
  - Pure paper, no computer records → **Lane C** (scan pipeline)
- [ ] **Collect the source:** the PIMS `.PAR` daily backup (Lane A), the Excel export
      (Lane B), or a sense of the paper volume + a dozen sample pages (Lane C).
- [ ] **Ask about the financial books separately** — for the November audit you need
      the parish's **financial** data. Note: a PIMS `.PAR` backup is *sacramental only*;
      the financial ledger is a **separate** PIMS database/export.
- [ ] Set expectations: what's instant (Lane A/B) vs paced (Lane C paper backlog).

---

## Phase 3 — Provision & configure the parish
- [ ] **Create real accounts** for the parish (priest/admin + secretary/bookkeeper) —
      never the seed logins. The priest owns the audit trail.
- [ ] **Run the Setup Wizard** (first login): parish name, parish priest, address,
      **diocese + province**, contact. This appears on certificates & reports.
- [ ] (Optional) Set the parish **patron theme**.

---

## Phase 4 — Migrate the data (branch by lane)

### Lane A — PIMS / PMS parish  (minutes, free, exact)
- [ ] Get the newest `.PAR` daily backup (MON.PAR … SUN.PAR).
- [ ] **`/import`** → drop the `.PAR` → pick the register(s) from the chooser →
      review the auto-mapped rows (dedup runs) → **Import**. Seconds per register.

### Lane B — Excel / CSV parish  (minutes)
- [ ] Export their sheets to CSV/XLSX → **`/import`** → map fields → preview → import.

### Lane C — Pure-paper parish  (paced, humane — the cabinet backfill)
- [ ] **`/scan`** → feed a stack of photographed forms → Cherub reads each →
      **match to an existing record and attach the original, or create from the form**
      → the human just confirms. Paced over weeks; every scan is a permanent gain.
- [ ] This is scan-and-confirm labor (no skill) — hand it to a volunteer / working
      student. It never blocks the parish going live.

### Financials for the November audit (all lanes)
- [ ] Bring in the **current fiscal year's** collections/expenses (PIMS financial
      export, or manual entry) + confirm the Diocese-Cockpit consolidation. Scope for
      November = this year's numbers for the diocese's parishes, NOT 20 years of history.

---

## Phase 5 — Verify (before you call it done)
- [ ] Spot-check imported records against the source (name/date/book-page-line).
- [ ] Reconcile counts (records imported vs expected).
- [ ] **Mom validates** — she is the spec (her diocese-audit format is the target).
- [ ] Confirm no duplicates crept in (the importer dedups; re-imports are idempotent).

---

## Phase 6 — Train & hand over
- [ ] Walk the secretary through the daily flows: **Registry** (record a sacrament,
      issue a certificate), **Finance** (record a collection), **Scan**, and **Cherub**
      (ask it anything — it's the built-in helper for non-technical staff).
- [ ] Put up the **parishioner-portal QR poster** so parishioners self-serve
      requests (this is what makes the future born-digital).

---

## Phase 7 — Go live
- [ ] First real actions: issue a real certificate, record a real collection.
- [ ] Turn on the **parishioner portal** for the parish.
- [ ] Confirm the AI budget/rate caps are set for the parish (cost governance).

---

## Phase 8 — Steady state & support
- [ ] Ongoing support (mom / support staff) — the human layer that keeps
      non-technical parishes successful. This is a service, and it's billable.
- [ ] **The annual budget-hearing audit** is the recurring value moment — the thing
      that took months on PIMS now takes days. Show it every year.
- [ ] Watch cost: infra ≈ ₱15–40/parish/month; AI is capped per parish; storage is
      pennies. Migration is one-time (Lane A/B ≈ free; Lane C ≈ ₱0.005/doc on Haiku).

---

## Appendix — "What we need from the parish" checklist
| Lane | Bring |
|---|---|
| A — PIMS/PMS | the newest `.PAR` backup + (separately) the **financial** PIMS export |
| B — Excel | the CSV/XLSX exports |
| C — Paper | the forms to scan + this year's financial numbers |
| All | parish name, priest, address, diocese/province; who the secretary is |

## Appendix — Roles
- **diocese_admin / bishop** — diocese-wide read (the Cockpit), provisioning, invites.
- **parish staff** (priest/secretary/bookkeeper) — read/write their own parish only.
- Tenancy is enforced by RLS (`auth_parish_id()`); a parish never sees another's data.
