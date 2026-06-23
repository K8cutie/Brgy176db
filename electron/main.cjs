// ChurchOS — Electron main process
// Loads the Vite dev server in development, or the built static files
// (dist/index.html via file://) in a packaged install. base:'./' +
// HashRouter make the file:// load work without a server.
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db.cjs');
const ai = require('./ai.cjs');
const auth = require('./auth.cjs');
const backup = require('./backup.cjs');
const updater = require('./updater.cjs');
const sync = require('./sync.cjs');

// Old parish PCs (and Windows 7) often have flaky GPU drivers — software
// rendering is slower but far more reliable across the hardware we target.
app.disableHardwareAcceleration();

// Use the Vite dev server only when explicitly told to (electron:dev sets
// ELECTRON_START_URL). Otherwise — including plain `electron:start` and any
// packaged install — load the built files from dist/.
const devUrl = process.env.ELECTRON_START_URL;
const isDev = !app.isPackaged && !!devUrl;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ChurchOS',
    backgroundColor: '#FAF8F3',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Surface load problems (e.g. missing dist) instead of a blank window.
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[ChurchOS] UI loaded');
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[ChurchOS] Failed to load (${code} ${desc}): ${url}`);
  });

  // Open external links (mailto:, https:) in the system browser, never
  // inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Background auto-update (packaged builds only; never blocks launch).
  updater.init(mainWindow);
}

// A minimal menu — hide the default Electron template, keep only what a
// parish user needs (and devtools in dev).
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit', label: 'Exit' }],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── SQLite IPC bridge ──
// The renderer talks to the database only through these channels
// (exposed via preload as window.churchos.db). Each returns a status so
// the UI can warn the user if a write fails (disk full, file locked by
// antivirus, read-only network drive) instead of silently losing data.
ipcMain.handle('churchos:db:getAll', () => {
  try {
    return db.getAll();
  } catch (err) {
    console.error('[ChurchOS] db.getAll failed:', err);
    return {};
  }
});
ipcMain.handle('churchos:db:set', (_e, key, value) => {
  try {
    db.set(key, value);
    return { ok: true };
  } catch (err) {
    console.error('[ChurchOS] db.set failed:', err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});
ipcMain.handle('churchos:db:delete', (_e, key) => {
  try {
    db.del(key);
    return { ok: true };
  } catch (err) {
    console.error('[ChurchOS] db.delete failed:', err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

// ── Auth IPC ──
// Identity lives in the main process (auth.cjs), never trusted from the
// renderer. login/createUser/changePassword enforce their own permission
// checks; the renderer only passes credentials and reads back safe fields.
ipcMain.handle('churchos:auth:hasUsers', () => auth.hasUsers());
ipcMain.handle('churchos:auth:list', () => auth.listUsers());
ipcMain.handle('churchos:auth:current', () => auth.currentUser());
ipcMain.handle('churchos:auth:create', (_e, payload) => auth.createUser(payload));
ipcMain.handle('churchos:auth:login', (_e, username, password) => auth.login(username, password));
ipcMain.handle('churchos:auth:logout', () => auth.logout());
ipcMain.handle('churchos:auth:changePassword', (_e, payload) => auth.changePassword(payload));

// ── AI assistant IPC ──
// The API key stays in the main process; the renderer only sends messages
// and receives answers. getStatus never returns the key itself.
ipcMain.handle('churchos:ai:status', () => ai.getStatus());
ipcMain.handle('churchos:ai:setKey', (_e, key) => ({ ok: ai.setKey(key) }));
ipcMain.handle('churchos:ai:chat', (_e, messages) => ai.chat(messages));

// ── Backup & restore IPC ──
ipcMain.handle('churchos:backup:now', () => backup.backupNow());
ipcMain.handle('churchos:backup:list', () => backup.listBackups());
ipcMain.handle('churchos:backup:openFolder', () => { shell.openPath(backup.backupsDir()); return { ok: true }; });
ipcMain.handle('churchos:backup:export', async () => {
  const made = backup.backupNow();
  if (!made.ok) return made;
  const { dialog } = require('electron');
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save a copy of your ChurchOS data',
    defaultPath: `churchos-backup-${backup.stamp(new Date())}.db`,
    filters: [{ name: 'ChurchOS backup', extensions: ['db'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, error: 'canceled' };
  try { fs.copyFileSync(made.path, res.filePath); return { ok: true, path: res.filePath }; }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});
ipcMain.handle('churchos:backup:restore', async () => {
  const { dialog } = require('electron');
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore ChurchOS from a backup',
    defaultPath: backup.backupsDir(),
    properties: ['openFile'],
    filters: [{ name: 'ChurchOS backup', extensions: ['db'] }],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false, error: 'canceled' };
  const r = backup.restore(res.filePaths[0]);
  // Relaunch so the renderer re-hydrates from the restored file (no stale cache).
  if (r.ok) { app.relaunch(); app.exit(0); }
  return r;
});

// ── Cloud sync IPC ──
ipcMain.handle('churchos:sync:status', () => sync.getStatus());
ipcMain.handle('churchos:sync:config', (_e, patch) => sync.setConfig(patch));
ipcMain.handle('churchos:sync:now', () => sync.syncNow());
ipcMain.handle('churchos:requests:list', () => sync.requestsList());
ipcMain.handle('churchos:requests:update', (_e, id, patch) => sync.requestUpdate(id, patch));

// ── Auto-update IPC ──
ipcMain.handle('churchos:update:check', () => updater.check());
ipcMain.handle('churchos:update:status', () => updater.status());
ipcMain.handle('churchos:update:install', () => updater.quitAndInstall());
ipcMain.handle('churchos:app:version', () => app.getVersion());

// ── Single-instance lock ──
// Two copies of the app open on the same database would each keep their
// own in-memory cache and silently overwrite each other's work. Allow
// only one instance; a second launch just focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    try {
      const dbPath = db.init();
      console.log('[ChurchOS] database:', dbPath);
      backup.autoBackupOnLaunch();
    } catch (err) {
      console.error('[ChurchOS] FATAL: could not open database:', err);
      const { dialog } = require('electron');
      dialog.showErrorBox(
        'ChurchOS — Database Error',
        'ChurchOS could not open its database file. It may be open in another program, ' +
        'on a read-only drive, or the disk may be full.\n\n' + String(err && err.message ? err.message : err),
      );
    }
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  db.close();
});
