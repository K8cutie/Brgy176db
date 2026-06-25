# Deploy ChurchOS web to Vercel

The **web build** (the public parishioner portal + online diocese/parish access)
is a Vite SPA — perfect for Vercel. The **desktop app is separate** (Electron,
`dist:win`); the secretary keeps using that offline. Vercel serves:

- the **public portal** at `your-domain/portal/<parish-slug>` (parishioners, no login)
- the **diocese cockpit + online parish login** at `your-domain/` (bishop/admin)

## Prerequisites
- The cloud DB is live: run the SQL in `SAAS-GOLIVE.md` order **including
  `churchos-saas-authz-fix.sql` last** (without it the auth guards are dead).
- You have the Supabase **Project URL** and **anon key** (Settings → API). The
  anon key is browser-safe — RLS is the boundary.

## One-time setup
1. **Import the repo** in Vercel (Add New → Project → pick `Brgy176db`).
2. Vercel auto-detects the settings from `vercel.json` (framework Vite,
   `npm run build` → `dist`, SPA rewrite). Nothing to change.
3. **Environment variables** (Production + Preview):
   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<your>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `<anon key>` |
   | `VITE_CHURCHOS_MODE` | `cloud` |
   | `VITE_SENTRY_DSN` | *(optional)* error monitoring |
4. **Deploy.** Every push to `main` redeploys automatically.

## Verify
- `your-domain/portal/st-mary` → the mobile booking page renders (clean URL works
  because `vercel.json` rewrites all paths to `index.html`).
- `your-domain/` → the cloud login (sign in as a diocese admin / bishop).
- Supabase **Auth → URL Configuration**: add your Vercel domain to the allowed
  redirect/site URLs so email confirmation + password reset links work.

## Notes
- **Routing:** the web build uses `BrowserRouter` (clean URLs); the desktop build
  auto-switches to `HashRouter` (needed for `file://`). Picked at startup from the
  Electron bridge — no config.
- **What's NOT on Vercel:** the secretary's daily work (offline desktop) and the
  parish's local data. Only the public portal + the cloud oversight layer are served.
- **Custom domain:** add it in Vercel → Project → Domains (e.g. `churchos.ph`), then
  parishioners get `churchos.ph/portal/<slug>`.
