// Single source of truth for who may reach the /diocese cockpit.
// Used by both the App route gate and the Sidebar nav item so they can't drift.
// Role comes from session.ts (server-verified in cloud mode), never raw localStorage.

import { isCloud } from './cloudStore';
import { getCurrentUserRole } from './session';

export const DIOCESE_ROLES = ['diocese_admin', 'bishop'] as const;

export function hasDioceseRole(): boolean {
  return (DIOCESE_ROLES as readonly string[]).includes(getCurrentUserRole());
}

export function canSeeDiocese(): boolean {
  return isCloud() && hasDioceseRole();
}
