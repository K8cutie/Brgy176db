// ChurchOS — auto-update (main process)
//
// Wraps electron-updater so a fix can reach every parish PC without a manual
// reinstall. Designed to be invisible and SAFE:
//   • only runs in a packaged build (no-op in dev);
//   • downloads in the background and installs on the NEXT quit — never
//     interrupts someone mid-entry;
//   • every call is wrapped so a missing module, no internet, or a bad feed can
//     NEVER stop the app from launching.
//
// The update feed + signature requirement are configured in package.json
// (build.publish) and documented in UPDATES.md. electron-updater verifies the
// code signature of each downloaded update, so signing (SIGNING.md) is a
// prerequisite for turning this on in production.

let autoUpdater = null;
let win = null;
let lastStatus = { state: 'idle' };

function send(state, extra) {
  lastStatus = Object.assign({ state }, extra || {});
  try { if (win && !win.isDestroyed()) win.webContents.send('churchos:update:event', lastStatus); } catch { /* ignore */ }
}

function init(targetWindow) {
  win = targetWindow;
  const { app } = require('electron');
  if (!app.isPackaged) { lastStatus = { state: 'dev' }; return; }   // never update a dev run
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    lastStatus = { state: 'unavailable', message: String((e && e.message) || e) };
    return;
  }
  autoUpdater.autoDownload = true;          // fetch in the background
  autoUpdater.autoInstallOnAppQuit = true;  // apply on next quit — no interruption

  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info && info.version }));
  autoUpdater.on('update-not-available', () => send('up-to-date'));
  autoUpdater.on('download-progress', (p) => send('downloading', { percent: Math.round(p && p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info && info.version }));
  autoUpdater.on('error', (err) => send('error', { message: String((err && err.message) || err) }));

  // First check a few seconds after launch, then once an hour. Never throws.
  setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch { /* ignore */ } }, 4000);
  setInterval(() => { try { autoUpdater.checkForUpdates(); } catch { /* ignore */ } }, 60 * 60 * 1000);
}

function check() {
  if (!autoUpdater) return lastStatus;
  try { autoUpdater.checkForUpdates(); return { state: 'checking' }; }
  catch (e) { return { state: 'error', message: String((e && e.message) || e) }; }
}

function status() { return lastStatus; }

function quitAndInstall() {
  if (!autoUpdater) return { ok: false, error: 'no_updater' };
  try { autoUpdater.quitAndInstall(); return { ok: true }; }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

module.exports = { init, check, status, quitAndInstall };
