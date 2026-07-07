import { describe, it, expect, beforeEach } from 'vitest';
import { buildAiContext, isAiContextEnabled, setAiContextEnabled } from './aiContext';
import { updateParishIdentity } from './parishIdentity';
import { setJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';

beforeEach(() => {
  localStorage.clear();
});

describe('buildAiContext — compact contract', () => {
  it('emits the core parish context on the happy path', () => {
    const ctx = buildAiContext('/finance');
    expect(ctx).toContain('[ChurchOS context');
    expect(ctx).toContain('Parish:');
    expect(ctx).toContain('User is currently on: Finance page');
    expect(ctx).toContain('Registry counts');
  });

  it('is hard-capped at 2500 characters even when a field grows unexpectedly', () => {
    // A pathologically long parish name would otherwise blow the "compact" budget.
    updateParishIdentity({ name: 'Parish '.repeat(2000) }); // ~14k chars
    const ctx = buildAiContext('/');
    expect(ctx.length).toBeLessThanOrEqual(2500);
  });

  it('includes the attendance line when Masses have been counted', () => {
    setJSON(KEYS.attendance, [
      { id: '1', eventId: 'a', eventTitle: 'Sunday Mass', date: '2026-05-10', count: 240, recordedAt: '2026-05-10T10:00:00.000Z' },
    ]);
    const ctx = buildAiContext('/calendar');
    expect(ctx).toContain('Mass attendance:');
    expect(ctx).toContain('average headcount 240');
  });

  it('survives a malformed attendance record: attendance section is skipped but the rest of the context stands', () => {
    // A single corrupt blob used to throw into buildAiContext's outer catch and
    // blank the WHOLE context (parish name, modules, registry counts too).
    setJSON(KEYS.attendance, [
      { id: 'bad', eventId: 'b', eventTitle: 'Mass', date: null, count: 'lots', recordedAt: 'x' },
    ]);
    const ctx = buildAiContext('/');
    // The rest of the context survived (not the empty-string fallback).
    expect(ctx).toContain('[ChurchOS context');
    expect(ctx).toContain('Parish:');
    expect(ctx).toContain('Registry counts');
    // The malformed record contributed no attendance line (0 counted).
    expect(ctx).not.toContain('Mass attendance:');
  });

  it('never leaks parishioner contact info — only aggregate counts', () => {
    // Seed records that DO carry PII, and attendance that carries a title…
    setJSON(KEYS.baptismRecords, [
      { id: 'b1', childFirstName: 'Ana', childLastName: 'Santos', email: 'ana.santos@example.com' },
    ]);
    setJSON(KEYS.families, [
      { id: 'f1', familyName: 'Dela Cruz', primaryPhone: '0917-555-1234', email: 'delacruz@example.com' },
    ]);
    setJSON(KEYS.attendance, [
      { id: '1', eventId: 'a', eventTitle: 'Sunday Mass', date: '2026-05-10', count: 240, recordedAt: '2026-05-10T10:00:00.000Z' },
    ]);
    const ctx = buildAiContext('/directory');
    // Lock it: no phone/email/family name ever appears in the context block.
    expect(ctx).not.toContain('0917-555-1234');
    expect(ctx).not.toContain('ana.santos@example.com');
    expect(ctx).not.toContain('delacruz@example.com');
    expect(ctx).not.toContain('Dela Cruz');
    expect(ctx).not.toMatch(/@example\.com/);
  });
});

describe('AI context opt-out flag', () => {
  it('defaults to enabled and round-trips the opt-out', () => {
    expect(isAiContextEnabled()).toBe(true);
    setAiContextEnabled(false);
    expect(isAiContextEnabled()).toBe(false);
    setAiContextEnabled(true);
    expect(isAiContextEnabled()).toBe(true);
  });
});
