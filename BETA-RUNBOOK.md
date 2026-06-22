# ChurchOS — 5-church closed beta runbook

The beta is the **offline desktop ChurchOS** — the full product, used by real
parish secretaries. No cloud needed: each church runs locally. Your job is a
controlled rollout where you can push fixes and collect feedback.

## Before you hand it to anyone
1. **Sign the installer** (see `SIGNING.md`). Unsigned → Windows SmartScreen
   "unknown publisher" scares the secretary on first launch. This is the #1 must-do.
   ```bash
   $env:CSC_LINK="C:\path\churchos.pfx"; $env:CSC_KEY_PASSWORD="…"; npm run dist:win
   ```
   Output: `release/ChurchOS-Setup-<version>.exe`.
2. **Set the update feed** (`UPDATES.md`) so you can ship fixes mid-beta without
   re-visiting any church. Test that an update actually lands on one machine first.
3. **Prepare a feedback channel** (a shared sheet / a group chat) and a 1-page
   "what to try" list per church.

## Per-church install (≈10 min each)
1. Run `ChurchOS-Setup-<version>.exe` → install.
2. First launch → **Create the admin (Parish Priest) account** (the bootstrap
   screen). Choose a real password; this backs the audit trail.
3. The priest adds staff in **Settings → Users** (secretary, bookkeeper).
4. **Settings → Parish Info** → fill the parish name/details.
5. Show them **Settings → Backup → "Save a Copy (USB)"** once, so they know their
   data is safe and portable.
6. Leave **Cloud Sync blank** — not part of this beta.

## What to tell the secretary
- "It works **fully offline** — your internet can drop and you keep working."
- "Your data lives **on this PC**. ChurchOS backs it up automatically each day; you
  can also save a copy to a USB anytime."
- "We'll **push improvements automatically** — you might see a new version after a
  restart. Tell us anything that's confusing or wrong."

## What's in the beta (full product)
Registry (4 sacraments + certificates), Directory, Calendar (with the 1-hour
transition guard), Finance (collections, journal, reports), Ministries, SSDM,
Reports, and the **AI assistant** (add an API key in Settings to enable).

## What's NOT in the beta (later)
- **Cloud sync to the diocese** (the monthly financial packet) — `SYNC.md`.
- **Billing/subscriptions** — beta is free; `BILLING.md` covers the Xendit plan.
- **At-rest DB encryption** — fine for beta; required before paid GA with real PII.

## Running the beta
- **Cadence:** weekly check-in with each church; collect the friction list.
- **Fixes:** edit → build → `dist:win --publish` → it auto-updates the 5 PCs.
- **Data safety net:** auto-backup + "Save a Copy" mean a mistake is never fatal —
  restore from **Settings → Backup → Restore**.
- **Privacy:** the churches enter real parishioner data; give them a short note that
  their data stays on their PC and isn't sent anywhere in the beta.

## Exit criteria (beta → paid pilot)
- 5 churches using it for daily work for ~1 month with no data-loss incidents.
- The friction list triaged; the top issues fixed and auto-shipped.
- Then: sign the cloud go-live (`SAAS-GOLIVE.md`) + turn on billing (`BILLING.md`)
  for the diocese oversight + subscription.
