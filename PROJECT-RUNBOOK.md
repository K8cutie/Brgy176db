# ChurchOS Project Runbook
## Technical Reference — Read at the start of every session

---

### PROJECT OVERVIEW

**Name:** ChurchOS v1.1
**Purpose:** Parish Management System for Philippine Catholic Parishes
**Replaces:** PIMS (DOS-era FoxPro software)
**Live URL:** https://K8cutie.github.io/Brgy176db/
**GitHub Repo:** https://github.com/K8cutie/Brgy176db
**Stack:** React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
**Database:** localStorage (production) + SQLite files created (future)
**License Model:** P200K/2-years per parish (offline install)
**Mom's Role:** Parish finance officer, 20 years on PIMS, installs for 5 parishes
**Target:** Diocese-wide contract at November budget meeting

---

### ARCHITECTURE

```
BROWSER
  React UI (shadcn/ui components)
    |
  localStorage (namespaced per parish) — CURRENT persistence
    |
  store.ts — persistence layer with getPersisted/setPersisted helpers
```

**Current Persistence:** store.ts — namespaced localStorage (production-ready)
**Future Persistence:** SQLite via sql.js — files created (db.ts, dao.ts, dbMigrate.ts) but NOT activated
**Migration:** dbMigrate.ts ready for one-time localStorage -> SQLite migration when needed

---

### FILE INVENTORY (CRITICAL — Check These Exist)

| File | Purpose | Status |
|------|---------|--------|
| src/main.tsx | Entry point (HashRouter) | CHECK |
| src/App.tsx | Router + tour system + achievements | CHECK |
| src/pages/FinancePage.tsx | MUST HAVE: 'analytics' tab wired in | CHECK |
| src/components/AnalyticsDashboard.tsx | Pareto, MoM, Sunday, seasonal, drill-down | CHECK |
| src/components/ParetoChart.tsx | 80/20 Pareto chart (Recharts) | CHECK |
| src/lib/analyticsEngine.ts | Six Sigma calculations | CHECK |
| src/components/DioceseConnection.tsx | Diocese snap-in UI (Lego Architecture) | CHECK |
| src/lib/parishIdentity.ts | Parish config, module registry | CHECK |
| src/lib/diocesePacket.ts | Privacy-safe diocese data aggregation | CHECK |
| src/lib/validation.ts | Safe parsing, XSS prevention | CHECK |
| src/lib/icsGenerator.ts | .ICS calendar export for priest phones | CHECK |
| src/components/PriestScheduleExport.tsx | QR code + download + WhatsApp share | CHECK |
| src/pages/RegistryPage.tsx | Fee security override system | CHECK |
| .github/workflows/deploy.yml | Auto-deploy on push to main | CHECK |

---

### COMPLETE FILE DIRECTORY (140 files total)

Verify all files exist on project extract. If any are missing, they may be on a git branch that didn't merge to master.

```
ChurchOS/
├── .github/workflows/
│   └── deploy.yml                          # GitHub Actions auto-deploy
├── src/
│   ├── main.tsx                            # Entry point (HashRouter)
│   ├── App.tsx                             # Router + tours + achievements
│   ├── App.css                             # Global styles
│   ├── index.css                           # Tailwind base styles
│   ├── pages/                              # 12 page modules
│   │   ├── Dashboard.tsx                   # Home dashboard with stats
│   │   ├── RegistryPage.tsx               # Sacramental records (Baptism, Marriage, Confirmation, Death)
│   │   ├── DirectoryPage.tsx              # Parishioner database
│   │   ├── CalendarPage.tsx               # Events + priest schedule + ICS export
│   │   ├── FinancePage.tsx                # Journal, Collections, Budget, **Analytics tab**
│   │   ├── MinistriesPage.tsx             # Ministry management + attendance
│   │   ├── SsdmPage.tsx                   # Social Services and Development
│   │   ├── ReportsPage.tsx                # Financial + sacramental reports
│   │   ├── SettingsPage.tsx               # Parish config, fees, users
│   │   ├── ImportPage.tsx                 # Data import from PIMS/Excel
│   │   ├── LoginPage.tsx                  # Authentication
│   │   └── WizardPage.tsx                # First-run setup wizard
│   ├── components/                         # 18 custom components
│   │   ├── AnalyticsDashboard.tsx         # Pareto, MoM, Sunday, seasonal, drill-down
│   │   ├── ParetoChart.tsx               # 80/20 Pareto visualization
│   │   ├── DioceseConnection.tsx          # Diocese snap-in UI (NOT YET ROUTED)
│   │   ├── PriestScheduleExport.tsx      # QR code + download + WhatsApp
│   │   ├── Layout.tsx                     # App shell (sidebar + topbar)
│   │   ├── Sidebar.tsx                    # Navigation sidebar
│   │   ├── TopBar.tsx                     # Header bar
│   │   ├── StatCard.tsx                   # Dashboard stat cards
│   │   ├── DataTable.tsx                  # Reusable sortable table
│   │   ├── TourGuide.tsx                  # Onboarding tour system
│   │   ├── FirstRunDetector.tsx          # Achievement celebration
│   │   ├── CelebrationToast.tsx           # Achievement toast notifications
│   │   ├── ConfirmationDialog.tsx         # Confirm/cancel modal
│   │   ├── HelpTooltip.tsx               # Contextual help bubbles
│   │   ├── PracticeModeBanner.tsx        # Sandbox mode indicator
│   │   ├── BackToTop.tsx                 # Scroll to top button
│   │   ├── Footer.tsx                     # Minimal footer
│   │   └── EmptyState.tsx                # "No data yet" placeholder
│   ├── components/ui/                      # 50+ shadcn/ui components
│   │   ├── button.tsx, card.tsx, dialog.tsx, tabs.tsx
│   │   ├── table.tsx, form.tsx, select.tsx, input.tsx
│   │   ├── chart.tsx, calendar.tsx, carousel.tsx
│   │   ├── dropdown-menu.tsx, context-menu.tsx
│   │   ├── sidebar.tsx, navigation-menu.tsx
│   │   ├── sheet.tsx, drawer.tsx, modal components
│   │   ├── accordion.tsx, collapsible.tsx
│   │   ├── tooltip.tsx, hover-card.tsx, popover.tsx
│   │   ├── alert.tsx, alert-dialog.tsx, sonner.tsx (toasts)
│   │   ├── badge.tsx, avatar.tsx, skeleton.tsx, spinner.tsx
│   │   ├── checkbox.tsx, switch.tsx, radio-group.tsx, toggle.tsx
│   │   ├── slider.tsx, progress.tsx, scroll-area.tsx
│   │   ├── input-otp.tsx, textarea.tsx, field.tsx, label.tsx
│   │   ├── separator.tsx, aspect-ratio.tsx
│   │   ├── breadcrumb.tsx, pagination.tsx
│   │   ├── command.tsx (cmdk search)
│   │   ├── menubar.tsx
│   │   ├── resizable.tsx
│   │   ├── kbd.tsx
│   │   └── item.tsx, button-group.tsx, input-group.tsx, empty.tsx
│   ├── lib/                                # 25 library modules
│   │   ├── store.ts                        # Persistence layer (localStorage)
│   │   ├── analyticsEngine.ts             # Six Sigma calculations
│   │   ├── parishIdentity.ts              # Parish config + module registry
│   │   ├── diocesePacket.ts               # Privacy-safe diocese aggregation
│   │   ├── moduleRegistry.ts              # Feature enable/disable
│   │   ├── storageNamespaced.ts           # Multi-tenancy storage keys
│   │   ├── validation.ts                  # Safe parsing, XSS prevention
│   │   ├── registryData.ts               # Sacramental record defaults
│   │   ├── financeData.ts                # Chart of accounts, journal, collections
│   │   ├── calendarData.ts               # Mass schedule defaults
│   │   ├── directoryData.ts              # Parishioner defaults (barangays, etc.)
│   │   ├── ministryData.ts               # Ministry + attendance defaults
│   │   ├── ssdmData.ts                   # SSDM record defaults
│   │   ├── reportData.ts                 # Report templates
│   │   ├── settingsData.ts               # Settings defaults
│   │   ├── feeSchedule.ts               # Fee amounts per sacrament
│   │   ├── icsGenerator.ts              # Calendar .ICS file generation
│   │   ├── importEngine.ts              # PIMS/Excel data import
│   │   ├── parishConfig.ts              # Parish display config (currency, etc.)
│   │   ├── friendlyLabels.ts            # UI label overrides
│   │   ├── tours.ts                      # Tour step definitions
│   │   ├── tourStyles.ts                # Tour visual styling
│   │   ├── achievements.ts              # Gamification system
│   │   └── utils.ts                     # Utility functions
│   ├── hooks/
│   │   ├── useDarkMode.ts               # Dark/light theme toggle
│   │   └── use-mobile.ts               # Mobile breakpoint detection
│   └── types/
│       └── qrcode.d.ts                  # QR code type definitions
├── docker/
│   ├── Dockerfile                        # nginx:alpine container
│   ├── docker-compose.yml               # One-command deploy
│   └── nginx.conf                        # SPA routing + WASM mime type
├── installer/
│   ├── ChurchOS-Installer.bat           # Windows one-click installer
│   └── ChurchOS-Installer.sh            # Mac/Linux installer
├── package.json                          # Dependencies + scripts
├── vite.config.ts                        # Vite config (base: './')
├── tsconfig.json                         # TypeScript base config
├── tsconfig.app.json                     # App TS config
├── tsconfig.node.json                    # Node TS config
├── tailwind.config.js                    # Tailwind theme
├── postcss.config.js                     # PostCSS setup
├── eslint.config.js                      # Lint rules
├── components.json                       # shadcn/ui config
├── index.html                            # HTML entry point
├── .gitignore                            # Git ignore rules
├── PROJECT-RUNBOOK.md                    # This file
├── GITHUB-PAGES-SETUP.md                # GitHub Pages deployment guide
├── LICENSE-AGREEMENT.md                  # P200K/2yr license template
├── PARISH-SETUP-CHECKLIST.md            # 10-step parish install guide
├── README.md                             # Public repo README
└── info.md                               # Project info
```

**Total: ~140 files, ~60,000 lines of code**

---

### KEY FEATURES STATUS

| Feature | Files | Connection Status |
|---------|-------|-------------------|
| Sacramental Registry | RegistryPage.tsx, registryData.ts | CONNECTED |
| Fee Security (override audit) | RegistryPage.tsx (inline), validation.ts | CONNECTED |
| Certificate Generation | RegistryPage.tsx (PDF generation) | CONNECTED |
| Finance (Journal, Collections, Budget) | FinancePage.tsx, financeData.ts | CONNECTED |
| **Analytics (Pareto, Trends, Drill-down)** | AnalyticsDashboard.tsx, ParetoChart.tsx, analyticsEngine.ts | MUST BE WIRED IN FinancePage.tsx |
| Calendar with Priest ICS Export | CalendarPage.tsx, PriestScheduleExport.tsx, icsGenerator.ts | CONNECTED |
| Directory | DirectoryPage.tsx, directoryData.ts | CONNECTED |
| Ministries | MinistriesPage.tsx, ministryData.ts | CONNECTED |
| SSDM | SsdmPage.tsx, ssdmData.ts | CONNECTED |
| Reports | ReportsPage.tsx, reportData.ts | CONNECTED |
| Settings | SettingsPage.tsx, settingsData.ts | CONNECTED |
| Diocese Connection (Lego) | DioceseConnection.tsx, parishIdentity.ts, diocesePacket.ts | FILE EXISTS — NOT IN ROUTING |

---

### CRITICAL: FinancePage.tsx Must Have These 3 Lines

If Analytics tab is missing, check for:

1. **Import:**
```typescript
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
```

2. **TabId type:**
```typescript
type TabId = 'coa' | 'journal' | 'collections' | 'budget' | 'analytics' | 'approvals';
```

3. **Tabs array:**
```typescript
{ id: 'analytics', label: 'Analytics' },
```

4. **Render:**
```typescript
{activeTab === 'analytics' && <AnalyticsDashboard />}
```

---

### BUILD & DEPLOY

```bash
# Development
cd /path/to/app && npm install && npm run dev

# Production build
cd /path/to/app && npm run build

# Push to GitHub (auto-deploys via Actions)
git add . && git commit -m "description" && git push origin main

# Docker (for parish USB install)
docker build -f docker/Dockerfile -t churchos .
docker run -d -p 8080:80 --name churchos churchos
```

### NEW SESSION CHECKLIST

When starting a new ChurchOS session:

1. **Check git status** — `git status` (any uncommitted changes?)
2. **Pull latest** — `git pull origin main` (sync with GitHub)
3. **Verify build** — `npm run build` (must compile with 0 errors)
4. **Check FinancePage.tsx** — confirm analytics tab is wired (see above)
5. **Check file inventory** — confirm all critical files exist (see table above)
6. **Ask user for current status** — "What's mom's feedback? What parish are we on?"

---

### CONTEXT NOTES (DO NOT FORGET)

- **User's mother** is the parish finance officer (20 years on PIMS)
- **5 parishes** lined up, all under same diocese
- **November** = diocese budget meeting (THE close)
- **Business model:** Sell offline first -> raise capital -> optional SaaS later
- **Target price:** P200K per parish (2-year), P100K/parish diocese-wide
- **Mom installed PIMS** for all 5 parishes herself (20-year trust network)
- **Anti-corruption:** Fee override audit trail prevents stolen collections
- **"Gentle Hand" philosophy:** UI designed for non-technical church staff
- **When user asks a question only:** Answer the question, don't implement yet
- **HashRouter required:** For static file serving (GitHub Pages / Docker)
- **User has Six Sigma Black Belt** — speaks in terms of Pareto, DMAIC, process improvement
- **User is a vibe coder** — 20-year BPO analyst, learns fast, builds production apps in 2 days

---

### THE NOVEMBER TIMELINE

| Month | Milestone |
|-------|-----------|
| Now-June | Install at Mom's parish + 1 more. Fix bugs. Collect feedback. |
| July-August | Roll out to remaining 3 parishes. Train staff. |
| September | Generate reports from all 5. Get written testimonials. |
| October | Build pitch deck. Practice live demo. |
| November | Diocese budget meeting. Close the deal. |

### THE LIVE DEMO SCRIPT (For Mom in November)

1. "For 6 months, 5 parishes tested ChurchOS."
2. Show Dashboard (collections at a glance)
3. Show Finance -> Analytics -> Pareto chart ("What's eating our budget?")
4. Show Registry -> add baptism record -> print certificate (30 seconds)
5. Show Calendar -> export priest schedule to phone
6. Show Settings -> audit log (every peso traceable)
7. Close: "I am one of those secretaries. Monthly report used to take 2 days. Now 10 minutes."

---



---

### CHANGE LOG

| Date | File Changed | Description | Status |
|------|-------------|-------------|--------|
| 2026-05-22 | src/pages/Dashboard.tsx | COMPLETE REWRITE: Restructured dashboard to prioritize parish operations over financial data. Hero section now shows Upcoming Events with Ministry Assignments (Choir, Ushers, Lectors, etc. matched by date/time). Calendar widget moved to right sidebar. Financial stats demoted to compact summary card. Quick actions reordered: Schedule Event first. Recent Activity kept as secondary section. | READY FOR TESTING |

**Dashboard v2.0 Changes:**
1. **Hero Section (2/3 width):** Upcoming Events & Ministry Assignments — shows next 10 events with serving ministries matched via `ministry.scheduleAssignments` by `day + massTime`
2. **Calendar Widget (1/3 width):** Mini month view with event dots, links to full Calendar page
3. **Recent Activity:** Smaller section, scrollable, 8 most recent items
4. **Financial Summary:** Compact card — Sunday Collection, Pending Approvals, YTD Net only
5. **Quick Actions:** Reordered: Schedule Event → Add Record → Generate Report → Add Collection
6. **Sacrament Links:** Events with `sacramentRecordId` link directly to registry record
7. **Empty States:** Friendly prompts when no events or no ministry assignments scheduled
8. **Responsive:** `lg:grid-cols-3` layout — stacks on mobile, side-by-side on desktop

**Data Flow:**
- Fetches `calendar_events` and `ministries` from localStorage via `getPersisted()`
- Filters events to upcoming (today onwards), sorted by date
- For Mass events: queries each ministry's `scheduleAssignments` array for matching `day + massTime`
- Displays assignments as inline badges (Choir: Maria, Juan / Ushers: Pedro, etc.)
- Warning banner shown if no assignments found for a Mass

**Files Modified:**
- `src/pages/Dashboard.tsx` — Complete replacement (232 lines)

**Files NOT Modified (no changes needed):**
- `calendarData.ts` — Event structure unchanged
- `ministryData.ts` — Ministry structure unchanged
- `store.ts` — Persistence layer unchanged

**Next Steps:**
- Test with real parish data (events + ministry schedules)
- Verify ministry matching logic works with your time formats (e.g., "6:00 AM" vs "06:00")
- Check responsive layout on tablet (1024px breakpoint)
- If `getPersisted()` key names differ in your actual store.ts, adjust the useEffect keys

### MISSING FEATURES (Future Work)

- DioceseConnection.tsx NOT connected to routing/sidebar
- SQLite backend (db.ts, dao.ts, dbMigrate.ts) created but NOT activated
- DAO layer migration from localStorage -> SQLite
- Sub-category drill-down in Analytics
- Sunday vs Sunday comparison UI polish
- Seasonal analysis UI polish
- GCash payment integration
- Parishioner portal (online booking)

---

### SUPPORT FILES

| File | Location |
|------|----------|
| This runbook | PROJECT-RUNBOOK.md |
| Setup guide | GITHUB-PAGES-SETUP.md |
| License template | LICENSE-AGREEMENT.md (P200K/2yr, P100K diocese) |
| Parish checklist | PARISH-SETUP-CHECKLIST.md (10-step install guide) |
| Docker config | docker/Dockerfile + docker/docker-compose.yml + docker/nginx.conf |
| Windows installer | installer/ChurchOS-Installer.bat |
| Mac/Linux installer | installer/ChurchOS-Installer.sh |

---

*Version: 1.1*
*Updated: 2026-05-22*
