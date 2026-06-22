# Auto-update (ChurchOS desktop)

ChurchOS ships fixes to every parish PC without a manual reinstall, using
`electron-updater`. The behaviour is deliberately gentle:

- Updates are checked a few seconds after launch, then hourly.
- A new version **downloads in the background** and **installs on the next quit**
  (`autoInstallOnAppQuit`) — it never interrupts someone mid-entry.
- The user can also check manually and restart-to-update from **Settings →
  Backup → App Version & Updates**.
- It only runs in a **packaged** build (no-op in `npm run electron:dev`), and every
  call is wrapped so no internet / a bad feed can never stop the app launching.

## Prerequisite: signing
`electron-updater` verifies the **code signature** of each downloaded update
before applying it. So the app must be code-signed (see `SIGNING.md`) and every
update signed with the **same** certificate. Don't enable updates in production
until signing is in place.

## 1. Point it at an update feed
The feed is `build.publish` in `package.json`. It currently has a **placeholder**:

```jsonc
"publish": [
  { "provider": "generic", "url": "https://updates.churchos.example/releases/" }
]
```

Pick one:

**A. Generic (host the files yourself — simplest, works anywhere)**
Set the `url` to a folder on any static host (your site, S3, a VPS). electron-builder
writes `latest.yml` + the installer there; the app reads `latest.yml` from that URL.

**B. GitHub Releases**
```jsonc
"publish": [ { "provider": "github", "owner": "YOUR_GH_USER", "repo": "churchos" } ]
```
Updates are read from the repo's Releases. Public repo = no token needed by clients.

## 2. Cut a release
```bash
# bump the version first — electron-updater compares against package.json "version"
npm version patch          # 1.1.0 -> 1.1.1

# build + sign + publish in one step (needs the signing env vars from SIGNING.md)
$env:CSC_LINK = "C:\path\churchos.pfx"; $env:CSC_KEY_PASSWORD = "…"
npx electron-builder --win --publish always
```
`--publish always` uploads the installer + `latest.yml` to the configured feed.
For the generic provider, copy `release/latest.yml` and `release/ChurchOS-Setup-*.exe`
to your host instead (or use a publish script).

## 3. What a parish sees
1. They keep working on (say) v1.1.0.
2. v1.1.1 downloads quietly in the background.
3. Next time they close ChurchOS, it updates; it opens as v1.1.1.
   (Or they click **Restart & Update** in Settings to apply immediately.)

## Notes
- The in-app status (checking / downloading / ready) is driven by main-process
  events in `electron/updater.cjs` → `window.churchos.update.onEvent`.
- Roll back by publishing a higher version number with the previous code — there's
  no "downgrade"; the version number is the source of truth.
