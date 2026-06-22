// ChurchOS — SQLite data store (main process)
//
// Uses Node's built-in node:sqlite (DatabaseSync) — bundled with
// Electron 42 / Node 24, so there is NO native module to compile and
// nothing to install on parish machines. The database is a single
// file (churchos.db) in the OS app-data folder; backing it up is just
// copying that one file.
//
// Storage model: a simple key/value table that mirrors the app's
// existing namespaced keys (churchos_parish_{id}_{dataset}). This keeps
// the renderer's storage interface unchanged while making the data
// durable, un-capped, and file-based.
const path = require('path');

let db = null;
let dbPath = null;

function init() {
  // Lazy-require Electron + node:sqlite so this module can be required in a
  // plain-Node test harness (which never calls init()) without pulling Electron.
  const { app } = require('electron');
  const { DatabaseSync } = require('node:sqlite');
  dbPath = path.join(app.getPath('userData'), 'churchos.db');
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS store (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  // Private table for secrets/config (password hashes, etc). Deliberately NOT
  // read by getAll(), so it never hydrates into the renderer's cache the way
  // the `store` rows do — account hashes must never reach the browser context.
  db.exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  return dbPath;
}

function filePath() { return dbPath; }

// Flush the WAL into the main db file so a file copy is a complete backup.
function checkpoint() {
  if (db) db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
}

function metaGet(key) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(String(key));
  return row ? row.value : null;
}
function metaSet(key, value) {
  db.prepare(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(String(key), String(value));
}

function getAll() {
  const rows = db.prepare('SELECT key, value FROM store').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

const upsertSql =
  'INSERT INTO store (key, value) VALUES (?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value';

function set(key, value) {
  db.prepare(upsertSql).run(String(key), String(value));
}

function del(key) {
  db.prepare('DELETE FROM store WHERE key = ?').run(String(key));
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { init, getAll, set, del, close, filePath, checkpoint, metaGet, metaSet };
