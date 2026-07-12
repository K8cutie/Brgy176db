// ═══════════════════════════════════════════════════════════
// Demo mode — a build-flag public showcase (for the web / Vercel).
//
// When VITE_CHURCHOS_DEMO is set at build time, the app seeds a signed-in
// parish session + a completed setup at boot, so a fresh visitor lands straight
// in the app instead of the setup wizard / login (there is no scrypt bridge in
// a plain browser to log in against). The parishioner portal also serves its
// hardcoded demo parish. Normal desktop and cloud builds never set the flag, so
// Vite constant-folds isDemo() to false and all of this compiles out.
// ═══════════════════════════════════════════════════════════

export const isDemo = (): boolean => import.meta.env.VITE_CHURCHOS_DEMO === 'true';

const SETUP_KEY = 'churchos_setup_complete';
const USER_KEY = 'churchos_user';

// Seed setup-complete + a signed-in parish priest so the auth/setup gates pass
// without the desktop bridge. Idempotent per browser: a visitor's own edits and
// records persist for their session; a first-time (or logged-out-then-reloaded)
// visitor is re-seeded so they never hit a dead-end login they can't complete.
export function bootstrapDemo(): void {
  if (!isDemo()) return;
  try {
    if (localStorage.getItem(SETUP_KEY) !== 'true') {
      localStorage.setItem(SETUP_KEY, 'true');
    }
    if (!localStorage.getItem(USER_KEY)) {
      localStorage.setItem(USER_KEY, JSON.stringify({
        username: 'Fr. Reyes',
        role: 'priest',
        roleLabel: 'Parish Priest',
        loginAt: new Date().toISOString(),
      }));
    }
  } catch {
    // Private-mode / storage disabled — the app still renders with seed data.
  }
}
