// ═══════════════════════════════════════════════════════════
// Session / current-user helpers
// The logged-in user is stored in localStorage under 'churchos_user'
// by LoginPage / WizardPage. These helpers are the single place the
// rest of the app reads it — for the auth gate, role checks, and
// audit-trail attribution.
// ═══════════════════════════════════════════════════════════

const USER_KEY = 'churchos_user';

// On desktop, the MAIN process is the source of truth for who is logged in.
// reconcileSession() (called once at startup) caches that verified identity
// here, so localStorage can't be hand-edited to fake a login or an actor.
let verifiedActor: SessionUser | null = null;

export interface SessionUser {
  username: string;
  role: string;
  roleLabel: string;
  loginAt: string;
}

export function getCurrentUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    if (!parsed || typeof parsed.username !== 'string' || !parsed.username) return null;
    return {
      username: parsed.username,
      role: parsed.role || 'unknown',
      roleLabel: parsed.roleLabel || parsed.role || 'User',
      loginAt: parsed.loginAt || '',
    };
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  // Desktop: trust the main-verified session, not the (editable) localStorage.
  if (desktopAuth()) return verifiedActor !== null;
  return getCurrentUser() !== null;
}

/** Display name for audit trails / "recorded by" fields. */
export function getCurrentUserName(): string {
  if (desktopAuth()) return verifiedActor ? verifiedActor.username : 'unknown';
  const u = getCurrentUser();
  return u ? u.username : 'unknown';
}

export function getCurrentUserRole(): string {
  if (desktopAuth()) return verifiedActor?.role ?? 'unknown';
  return getCurrentUser()?.role ?? 'unknown';
}

// Reconcile the renderer against the main process's verified session. Must run
// before the first render (see main.tsx). On desktop: if main has a session we
// cache it (and refresh localStorage); if main has NONE but localStorage claims
// a login, that claim is forged or stale → clear it so the gate sends to login.
export async function reconcileSession(): Promise<void> {
  const a = desktopAuth();
  if (!a) return; // browser/demo: localStorage is the session
  try {
    const cur = await a.current();
    if (cur && cur.username) {
      verifiedActor = { username: cur.username, role: cur.role, roleLabel: cur.roleLabel || cur.role, loginAt: cur.loginAt || '' };
      localStorage.setItem(USER_KEY, JSON.stringify(verifiedActor));
    } else {
      verifiedActor = null;
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    /* leave the existing state; the gate still requires *something* */
  }
}

/** Persist the session AFTER the main process has verified credentials. */
export function setSession(u: { username: string; role: string; roleLabel?: string }): void {
  const user: SessionUser = {
    username: u.username,
    role: u.role,
    roleLabel: u.roleLabel || u.role,
    loginAt: new Date().toISOString(),
  };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function logout(): void {
  localStorage.removeItem(USER_KEY);
  desktopAuth()?.logout();
}

// ── Desktop auth bridge (real local accounts; null in the browser/demo) ──
export interface AuthResult { ok: boolean; error?: string; user?: { username: string; role: string; fullName?: string }; retryInMs?: number }
export interface DesktopAuth {
  hasUsers(): Promise<boolean>;
  list(): Promise<Array<{ id: string; username: string; role: string; fullName: string; createdAt: string }>>;
  current(): Promise<SessionUser | null>;
  create(p: { username: string; password: string; role: string; fullName?: string }): Promise<AuthResult>;
  login(username: string, password: string): Promise<AuthResult>;
  logout(): Promise<{ ok: boolean }>;
  changePassword(p: { username?: string; oldPassword?: string; newPassword: string }): Promise<AuthResult>;
}
export function desktopAuth(): DesktopAuth | null {
  const w = window as unknown as { churchos?: { auth?: DesktopAuth } };
  return w.churchos?.auth ?? null;
}
