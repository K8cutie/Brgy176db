// Unit tests for the public-portal config editor client.
//
// Covers the pure normalization/validation (fees ≥ 0 coerced, malformed contact
// coerced to strings the way PublicPortal does, services sanitized to the known
// set, unknown keys preserved-not-managed) and that a DESKTOP-mode save is a
// safe, honest no-op (never a fake success, never a network call).
//
// This suite runs in the DEFAULT (non-cloud) vitest env: isCloud() is false
// because the cloud VITE_* vars are unset, which is exactly the desktop path we
// assert on. (Cloud-mode round-trips are covered under `npm run test:cloud`
// harness conventions; here supabaseClient must never even be reached.)
import { describe, it, expect, vi } from 'vitest';

// Fail loudly if any code path under test tries to talk to Supabase in desktop
// mode — the guard must short-circuit BEFORE getSupabase().
vi.mock('./supabaseClient', () => ({
  getSupabase: vi.fn(() => {
    throw new Error('getSupabase must not be called in desktop mode');
  }),
}));

import {
  normalizePortalConfig,
  validatePortalConfig,
  toPublicConfigPayload,
  savePortalConfig,
  emptyPortalConfig,
  PORTAL_SERVICES,
  type PortalConfig,
} from './portalConfig';
import { isCloud } from './cloudStore';

describe('normalizePortalConfig', () => {
  it('returns a safe empty config for junk input (null/array/scalar)', () => {
    for (const junk of [null, undefined, 42, 'x', [], [1, 2]]) {
      const cfg = normalizePortalConfig(junk);
      expect(cfg.services).toEqual([]);
      expect(cfg.fees).toEqual({});
      expect(cfg.contact).toEqual({ phone: '', email: '', address: '', hours: '' });
      expect(cfg.intake_enabled).toBe(false);
    }
  });

  it('sanitizes services to the known set, de-duped, order preserved', () => {
    const cfg = normalizePortalConfig({
      services: ['certificate', 'not_a_service', 'mass_intention', 'certificate', 42, 'donation'],
    });
    expect(cfg.services).toEqual(['certificate', 'mass_intention', 'donation']);
  });

  it('coerces fees to non-negative rounded numbers and drops bad ones', () => {
    const cfg = normalizePortalConfig({
      fees: {
        mass_intention: 200.4,   // rounds to 200
        certificate: '150',      // numeric string accepted
        donation: -5,            // negative dropped
        event_booking: 'abc',    // non-numeric dropped
        bogus_service: 999,      // unknown service key ignored
      },
    });
    expect(cfg.fees).toEqual({ mass_intention: 200, certificate: 150 });
    expect('donation' in cfg.fees).toBe(false);
    expect('event_booking' in cfg.fees).toBe(false);
  });

  it('coerces a malformed contact (object/number values) to strings, like the portal', () => {
    const cfg = normalizePortalConfig({
      contact: { phone: 12345, email: { nested: true }, address: '  123 Rosal St.  ', hours: null },
    });
    // non-strings degrade to '' (never crash), strings are trimmed
    expect(cfg.contact).toEqual({ phone: '', email: '', address: '123 Rosal St.', hours: '' });
  });

  it('only treats intake_enabled === true as enabled (not truthy strings)', () => {
    expect(normalizePortalConfig({ intake_enabled: true }).intake_enabled).toBe(true);
    expect(normalizePortalConfig({ intake_enabled: 'true' }).intake_enabled).toBe(false);
    expect(normalizePortalConfig({ intake_enabled: 1 }).intake_enabled).toBe(false);
  });

  it('round-trips the real seed shape', () => {
    const seed = {
      intake_enabled: true,
      services: ['mass_intention', 'certificate', 'donation', 'event_booking'],
      fees: { mass_intention: 200, certificate: 150 },
      contact: { phone: '(02) 8xxx', email: 'office@stmary.test' },
    };
    const cfg = normalizePortalConfig(seed);
    expect(cfg.services).toEqual(seed.services);
    expect(cfg.fees).toEqual(seed.fees);
    expect(cfg.contact.phone).toBe('(02) 8xxx');
    expect(cfg.contact.email).toBe('office@stmary.test');
    expect(cfg.intake_enabled).toBe(true);
  });
});

describe('validatePortalConfig', () => {
  const base = emptyPortalConfig();

  it('passes when contact fields are blank (everything optional)', () => {
    expect(validatePortalConfig(base)).toEqual({});
  });

  it('flags a malformed email but accepts a good one', () => {
    expect(validatePortalConfig({ ...base, contact: { ...base.contact, email: 'nope' } }).email).toBeTruthy();
    expect(validatePortalConfig({ ...base, contact: { ...base.contact, email: 'a@b.co' } }).email).toBeUndefined();
  });

  it('flags a too-short phone but accepts a real one', () => {
    expect(validatePortalConfig({ ...base, contact: { ...base.contact, phone: '123' } }).phone).toBeTruthy();
    expect(validatePortalConfig({ ...base, contact: { ...base.contact, phone: '+63 2 8123 4567' } }).phone).toBeUndefined();
  });
});

describe('toPublicConfigPayload', () => {
  it('emits only managed keys, drops empty contact fields and unknown/negative fees', () => {
    const cfg: PortalConfig = {
      services: ['mass_intention', 'certificate'],
      fees: { mass_intention: 200, certificate: -1 as unknown as number },
      contact: { phone: '(02) 8xxx', email: '', address: '', hours: 'Mon–Sat' },
      intake_enabled: true,
    };
    const payload = toPublicConfigPayload(cfg);
    expect(payload).toEqual({
      intake_enabled: true,
      services: ['mass_intention', 'certificate'],
      fees: { mass_intention: 200 }, // negative certificate fee dropped
      contact: { phone: '(02) 8xxx', hours: 'Mon–Sat' }, // empty email/address omitted
    });
    // the payload has exactly the four managed keys — nothing else leaks
    expect(Object.keys(payload).sort()).toEqual(['contact', 'fees', 'intake_enabled', 'services']);
  });

  it('exposes the four portal services as the canonical set', () => {
    expect([...PORTAL_SERVICES]).toEqual(['mass_intention', 'certificate', 'donation', 'event_booking']);
  });
});

describe('savePortalConfig in desktop/offline mode', () => {
  it('is a guarded no-op: returns a clear error, never a fake success, never hits Supabase', async () => {
    // sanity: the test env is NOT cloud (this is the desktop path we assert on)
    expect(isCloud()).toBe(false);
    const res = await savePortalConfig(emptyPortalConfig());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/ChurchOS Cloud/i);
    // if getSupabase had been reached, the mock would have thrown — reaching
    // here proves the guard short-circuited before any network/client access.
  });
});
