// ChurchOS — backup & restore (main process)
//
// The whole parish lives in one SQLite file. This makes durable copies of it so
// a dead disk, ransomware, or a fat-fingered delete isn't a dead parish.
//
//  • backupNow()  — WAL-checkpoint, then copy churchos.db → backups/churchos-<stamp>.db
//  • auto-backup on launch, keeping the most recent KEEP copies
//  • restore(file) — VALIDATE it's a real ChurchOS db, back up the current one
//    first, then swap it in (app relaunches so caches reload cleanly)
//  • export a backup to a user-chosen location (USB drive, etc.)

const fs = require('fs');
const path = require('path');
const db = require('./db.cjs');

const KEEP = 14;

function backupsDir() {
  const { app } = require('electron');
  const dir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Deterministic, sortable, filename-safe timestamp (pure — unit-testable).
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function listBackups() {
  const dir = backupsDir();
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith('churchos-') && f.endsWith('.db'))
    .map((f) => { const st = fs.statSync(path.join(dir, f)); return { name: f, path: path.join(dir, f), size: st.size, mtime: st.mtimeMs }; })
    .sort((a, b) => b.mtime - a.mtime); // newest first
}

// Which files to delete to keep only the newest `keep` (pure — unit-testable).
function pickToPrune(list, keep) {
  return list.slice(Math.max(0, keep)).map((b) => b.path);
}
function prune(keep) {
  for (const p of pickToPrune(listBackups(), keep)) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
}

function backupNow() {
  try {
    const src = db.filePath();
    if (!src || !fs.existsSync(src)) return { ok: false, error: 'no_db' };
    db.checkpoint(); // fold the WAL in so the copy is complete
    const dest = path.join(backupsDir(), `churchos-${stamp(new Date())}.db`);
    fs.copyFileSync(src, dest);
    prune(KEEP);
    return { ok: true, path: dest, size: fs.statSync(dest).size };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// Make one automatic backup per launch (skipped if the newest is < 12h old, so
// repeated restarts don't churn). Never throws — backup must not block startup.
function autoBackupOnLaunch() {
  try {
    const newest = listBackups()[0];
    const twelveHours = 12 * 60 * 60 * 1000;
    if (newest && Date.now() - newest.mtime < twelveHours) return;
    backupNow();
  } catch { /* ignore */ }
}

// Is `file` actually a ChurchOS database (and not a random file the user picked)?
function isValidBackup(file) {
  let test = null;
  try {
    const { DatabaseSync } = require('node:sqlite');
    test = new DatabaseSync(file);
    const tables = test.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    return tables.includes('store');
  } catch {
    return false;
  } finally {
    try { if (test) test.close(); } catch { /* ignore */ }
  }
}

function restore(file) {
  try {
    if (!file || !fs.existsSync(file)) return { ok: false, error: 'not_found' };
    if (!isValidBackup(file)) return { ok: false, error: 'not_a_churchos_backup' };
    backupNow();              // safety net: snapshot the CURRENT data before replacing it
    db.close();
    const dest = db.filePath();
    for (const ext of ['-wal', '-shm']) { const p = dest + ext; if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { /* ignore */ } } }
    fs.copyFileSync(file, dest);
    return { ok: true, restartRequired: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { backupNow, autoBackupOnLaunch, listBackups, restore, isValidBackup, backupsDir, stamp, pickToPrune };
