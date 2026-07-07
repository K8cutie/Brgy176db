// The /diocese cockpit must be invisible AND unreachable unless BOTH hold:
// cloud mode + a diocese-level verified role. App's route gate and the Sidebar
// item share these predicates, so testing them covers both surfaces.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockIsCloud, mockGetRole } = vi.hoisted(() => ({
  mockIsCloud: vi.fn(),
  mockGetRole: vi.fn(),
}));
vi.mock('./cloudStore', () => ({ isCloud: mockIsCloud }));
vi.mock('./session', () => ({ getCurrentUserRole: mockGetRole }));

import { canSeeDiocese, hasDioceseRole, DIOCESE_ROLES } from './dioceseAccess';

describe('dioceseAccess — /diocese gating', () => {
  beforeEach(() => {
    mockIsCloud.mockReset();
    mockGetRole.mockReset();
  });

  it('never visible outside cloud mode, even for a bishop (desktop/offline install)', () => {
    mockIsCloud.mockReturnValue(false);
    for (const role of DIOCESE_ROLES) {
      mockGetRole.mockReturnValue(role);
      expect(canSeeDiocese()).toBe(false);
    }
  });

  it('cloud parish-level roles are not authorized', () => {
    mockIsCloud.mockReturnValue(true);
    for (const role of ['secretary', 'priest', 'finance_council', 'unknown', '']) {
      mockGetRole.mockReturnValue(role);
      expect(hasDioceseRole()).toBe(false);
      expect(canSeeDiocese()).toBe(false);
    }
  });

  it('cloud diocese_admin and bishop are authorized', () => {
    mockIsCloud.mockReturnValue(true);
    for (const role of ['diocese_admin', 'bishop']) {
      mockGetRole.mockReturnValue(role);
      expect(hasDioceseRole()).toBe(true);
      expect(canSeeDiocese()).toBe(true);
    }
  });
});
