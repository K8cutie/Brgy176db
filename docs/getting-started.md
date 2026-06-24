# Getting Started with ChurchOS

> Owner: Platform / DX
> Last reviewed: 2026-06-24

A hands-on tutorial for a developer setting up ChurchOS locally. ChurchOS is a parish
management system that runs in two modes from one codebase: a **local-first Electron
desktop app** (offline) and a **Supabase-backed SaaS web app**.

## Prerequisites

- Node.js 20+ and npm
- Git
- (Optional) Deno — only needed to run/type-check the Supabase Edge Functions locally
- (Optional) Supabase CLI — only for deploying edge functions / running SaaS

## 1. Clone and install

```bash
git clone <repo-url> churchos
cd churchos
npm install
```

## 2. Run the web app (fastest path)

```bash
npm run dev
```

Open http://localhost:3000. In the plain browser, storage hydrators no-op and the app
runs against local in-memory/localStorage data — good for UI work.

## 3. Run the desktop app (Electron)

```bash
npm run electron:dev
```

This starts Vite and launches Electron pointed at it. The desktop build is the
local-first mode: real local accounts (scrypt), a main-process verified session, and a
local database. Sign-in is required.

## 4. Verify your setup

Run the full local gate (the same checks CI runs):

```bash
npm run lint          # NOTE: has pre-existing findings; non-blocking in CI
npx tsc --noEmit      # type-check (should be clean)
npx vitest run        # unit tests (should be green)
npm run build         # production build (should succeed)
```

You can also run tests in watch mode while developing logic:

```bash
npm run test:watch
npm run test:coverage   # coverage for the tested business logic in src/lib
```

## 5. Where things live

| Area | Path |
|------|------|
| App entry | `src/main.tsx` |
| Pure business/util logic (tested) | `src/lib/` (e.g. `validation.ts`, `feeSchedule.ts`, `financeData.ts`, `analyticsEngine.ts`) |
| Error boundary + monitoring | `src/components/ErrorBoundary.tsx`, `src/lib/monitoring.ts` |
| Electron main/preload/auth/sync | `electron/` |
| Edge functions (Deno) | `supabase/functions/ai`, `supabase/functions/xendit-webhook`, shared `_shared/log.ts` |
| SQL schema/setup | repo root `*.sql` (e.g. `churchos-saas-setup.sql`) |
| Docs | `docs/` (this folder) |
| Regression harnesses | `tests/` (`*.cjs`) |

## 6. Optional: environment variables

Create a `.env.local` (Vite reads `VITE_*`). All are optional:

```ini
# Frontend error monitoring (SaaS only). Unset = Sentry stays fully inert/offline.
VITE_SENTRY_DSN=
# Optional release tag shown in Sentry.
VITE_APP_VERSION=1.1.0
```

Edge-function secrets (server-side, never in the browser) are set with the Supabase
CLI, not in `.env.local`:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set XENDIT_CALLBACK_TOKEN=... SUPABASE_SERVICE_ROLE_KEY=...
```

## 7. Make your first change

1. Add a pure helper to `src/lib/` and a matching `*.test.ts`.
2. Run `npx vitest run` — watch it pass.
3. Run `npx tsc --noEmit` and `npm run build`.
4. Commit. CI (`.github/workflows/ci.yml`) re-runs lint + type-check + tests +
   coverage + build + `npm audit` + Semgrep + SQL lint on your PR.

## Next steps

- Reliability targets: `docs/SLO.md`
- Monitoring & logging: `docs/observability.md`
- API contracts: `docs/openapi.yaml`
- Behavior specs: `docs/acceptance-criteria.md`
- Data & privacy (ROPA): `docs/DATA-INVENTORY.md`
- Operational runbooks (repo root): `PROJECT-RUNBOOK.md`, `BETA-RUNBOOK.md`,
  `BILLING.md`, `SYNC.md`, `SIGNING.md`, `UPDATES.md`, `SAAS-GOLIVE.md`
