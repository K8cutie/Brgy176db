// ChurchOS — local authentication (main process)
//
// Real accounts for the offline desktop install. Passwords are scrypt-hashed
// (node:crypto, no native dep) and stored in the PRIVATE app_meta table — never
// in the `store` KV that hydrates to the renderer, so a hash can't leak into the
// browser context. The signed-in identity is tracked HERE in the main process,
// not trusted from the renderer, so audit attribution ("recorded_by") and
// user-management permission checks can't be spoofed by editing localStorage.
//
// Roles: parish_priest = admin (may manage users); bookkeeper / secretary /
// finance_council = staff. The first account created on a fresh install is the
// admin (bootstrap), and must be a parish_priest.

const crypto = require('crypto');
const db = require('./db.cjs');

// Persistence seam: defaults to the SQLite app_meta store, but a test harness
// can inject an in-memory { metaGet, metaSet } to exercise the real auth logic
// without launching Electron.
let store = db;
function __setStore(s) { store = s; }
function __reset() { currentSession = null; attempts.clear(); }

const ACCOUNTS_KEY = 'accounts';
const ADMIN_ROLE = 'parish_priest';
const VALID_ROLES = ['parish_priest', 'bookkeeper', 'secretary', 'finance_council'];
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 1024;   // bound input so scrypt can't be abused as a CPU-DoS (vector d4)

// ── lockout: throttle online password guessing ──
const LOCK_AFTER = 5;            // failed attempts
const LOCK_MS = 5 * 60 * 1000;   // ...then locked for 5 minutes
const attempts = new Map();      // username -> { fails, until }

let currentSession = null;       // the main-process source of truth for "who is logged in"

// ── storage ──
function loadAccounts() {
  try { const raw = store.metaGet(ACCOUNTS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveAccounts(list) { store.metaSet(ACCOUNTS_KEY, JSON.stringify(list)); }

// ── hashing ──
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { salt: s, hash };
}
function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const norm = (u) => String(u || '').trim().toLowerCase();
const safe = (a) => ({ id: a.id, username: a.username, role: a.role, fullName: a.fullName, createdAt: a.createdAt });

// ── public API ──
function hasUsers() { return loadAccounts().length > 0; }

function listUsers() { return loadAccounts().map(safe); }

function currentUser() { return currentSession ? { ...currentSession } : null; }

function logout() { currentSession = null; return { ok: true }; }

// Create an account. Bootstrap: if there are NO users yet, this creates the
// first admin (must be parish_priest). Otherwise only a logged-in admin may add
// users. Never trusts a renderer-supplied "who am I".
function createUser({ username, password, role, fullName } = {}) {
  const list = loadAccounts();
  const bootstrapping = list.length === 0;

  if (!bootstrapping && (!currentSession || currentSession.role !== ADMIN_ROLE)) {
    return { ok: false, error: 'not_authorized' };
  }
  const uname = norm(username);
  if (!uname) return { ok: false, error: 'username_required' };
  if (uname.length < 3) return { ok: false, error: 'username_too_short' };
  if (!password || String(password).length < MIN_PASSWORD || String(password).length > MAX_PASSWORD) return { ok: false, error: 'weak_password' };
  if (!VALID_ROLES.includes(role)) return { ok: false, error: 'invalid_role' };
  if (bootstrapping && role !== ADMIN_ROLE) return { ok: false, error: 'first_user_must_be_admin' };
  if (list.some((a) => a.username === uname)) return { ok: false, error: 'username_taken' };

  const { salt, hash } = hashPassword(password);
  const account = { id: crypto.randomUUID(), username: uname, role, fullName: String(fullName || '').trim() || uname, salt, hash, createdAt: new Date().toISOString() };
  list.push(account);
  saveAccounts(list);
  return { ok: true, user: safe(account) };
}

function login(username, password) {
  const uname = norm(username);
  const rec = attempts.get(uname) || { fails: 0, until: 0 };
  if (rec.until && Date.now() < rec.until) {
    return { ok: false, error: 'locked', retryInMs: rec.until - Date.now() };
  }
  if (password && String(password).length > MAX_PASSWORD) return { ok: false, error: 'invalid_credentials' };
  const account = loadAccounts().find((a) => a.username === uname);
  // Always run a verify (even when the user doesn't exist) so timing doesn't
  // reveal whether a username is valid.
  const ok = account
    ? verifyPassword(password, account.salt, account.hash)
    : (hashPassword(password, 'decoysaltdecoysalt'), false);

  if (!ok) {
    const fails = rec.fails + 1;
    attempts.set(uname, { fails, until: fails >= LOCK_AFTER ? Date.now() + LOCK_MS : 0 });
    return { ok: false, error: fails >= LOCK_AFTER ? 'locked' : 'invalid_credentials' };
  }
  attempts.delete(uname);
  currentSession = { id: account.id, username: account.username, role: account.role, fullName: account.fullName, loginAt: new Date().toISOString() };
  return { ok: true, user: { ...currentSession } };
}

// Change a password. A user may change their own (with the old password); an
// admin may reset anyone's without it.
function changePassword({ username, oldPassword, newPassword } = {}) {
  if (!currentSession) return { ok: false, error: 'not_authenticated' };
  const uname = norm(username) || currentSession.username;
  const isAdmin = currentSession.role === ADMIN_ROLE;
  const isSelf = uname === currentSession.username;
  if (!isAdmin && !isSelf) return { ok: false, error: 'not_authorized' };
  if (!newPassword || String(newPassword).length < MIN_PASSWORD || String(newPassword).length > MAX_PASSWORD) return { ok: false, error: 'weak_password' };

  const list = loadAccounts();
  const account = list.find((a) => a.username === uname);
  if (!account) return { ok: false, error: 'no_such_user' };
  if (!isAdmin && !verifyPassword(oldPassword, account.salt, account.hash)) return { ok: false, error: 'invalid_credentials' };

  const { salt, hash } = hashPassword(newPassword);
  account.salt = salt; account.hash = hash;
  saveAccounts(list);
  return { ok: true };
}

module.exports = { hasUsers, listUsers, currentUser, logout, createUser, login, changePassword, VALID_ROLES, ADMIN_ROLE, __setStore, __reset };
