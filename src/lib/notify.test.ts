import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizePhone, buildSmsHref, buildMailtoHref,
  STATUS_TEMPLATES, fillTemplate,
  appendOutbox, listOutbox, type OutboxEntry,
} from './notify';
import { ns } from './storageNamespaced';

beforeEach(() => localStorage.clear());

describe('normalizePhone', () => {
  it('strips spaces, dashes and parentheses from PH formats', () => {
    expect(normalizePhone('0917 123 4567')).toBe('09171234567');
    expect(normalizePhone('(02) 8123-4567')).toBe('0281234567');
  });
  it('keeps a single LEADING + only', () => {
    expect(normalizePhone('+63 917-123-4567')).toBe('+639171234567');
    expect(normalizePhone('09+17')).toBe('0917'); // interior + is junk, not a prefix
    expect(normalizePhone('++63917')).toBe('+63917');
  });
  it('strips URI metacharacters so a crafted phone cannot smuggle parts into the href', () => {
    expect(normalizePhone('0917?body=evil')).toBe('0917');
    expect(normalizePhone('0917&x=1;,%0A')).toBe('091710'); // only the digits survive
  });
});

describe('buildSmsHref', () => {
  it('builds sms:<number>?body=<encoded text>', () => {
    expect(buildSmsHref('0917 123 4567', 'Hello po')).toBe('sms:09171234567?body=Hello%20po');
  });
  it('encodes &, ?, = and newlines in the body (injection attempt in a name)', () => {
    const href = buildSmsHref('+63 917 123 4567', 'Hi Juan&body=evil?x=1\nnew line');
    expect(href.startsWith('sms:+639171234567?body=')).toBe(true);
    const body = href.slice(href.indexOf('?body=') + 6);
    expect(body).not.toContain('&');
    expect(body).not.toContain('?');
    expect(body).not.toContain('=');
    expect(body).toContain('%26'); // the & survived, but encoded
    expect(body).toContain('%0A'); // newline encoded
  });
  it('handles unicode (₱ and Filipino text)', () => {
    const href = buildSmsHref('0917', 'Bayad: ₱500 — salamat po!');
    expect(href).toContain(encodeURIComponent('₱500'));
  });
});

describe('buildMailtoHref', () => {
  it('builds mailto with encoded subject and body', () => {
    const href = buildMailtoHref('ana@example.com', 'Your request', 'Hello Ana, good news!');
    expect(href).toBe(
      'mailto:ana%40example.com?subject=Your%20request&body=Hello%20Ana%2C%20good%20news!',
    );
  });
  it('neutralizes header injection through a crafted address', () => {
    const href = buildMailtoHref('a@b.com?bcc=attacker@evil.com&cc=x@y.z', 'S', 'B');
    // exactly ONE real '?' (ours) and one real '&' (ours) — the crafted ones are encoded
    expect(href.split('?').length).toBe(2);
    expect(href.split('&').length).toBe(2);
    expect(href).toContain('%3Fbcc%3D');
  });
  it('neutralizes newline/CRLF injection attempts in subject and body', () => {
    const href = buildMailtoHref('a@b.com', 'S\r\nBcc: evil@x.com', 'B\nline2');
    expect(href).not.toContain('\r');
    expect(href).not.toContain('\n');
    expect(href).toContain('%0D%0A');
  });
});

describe('STATUS_TEMPLATES + fillTemplate', () => {
  it('has a template for every request lifecycle status', () => {
    for (const s of ['submitted', 'in_review', 'scheduled', 'confirmed', 'completed', 'rejected', 'cancelled']) {
      expect(STATUS_TEMPLATES[s], `missing template for ${s}`).toBeTruthy();
    }
  });
  it('fills {{parish}}, {{type}}, {{date}} tokens', () => {
    const out = fillTemplate(STATUS_TEMPLATES.confirmed, {
      parish: 'St. Agnes', type: 'baptism', date: 'Sat, Jul 18 at 9:00 AM',
    });
    expect(out).toContain('St. Agnes');
    expect(out).toContain('baptism');
    expect(out).toContain('Sat, Jul 18 at 9:00 AM');
    expect(out).not.toContain('{{');
  });
  it('fills {{amount}} in the payment reminder', () => {
    const out = fillTemplate(STATUS_TEMPLATES.payment_reminder, {
      parish: 'St. Agnes', type: 'certificate', amount: '₱100',
    });
    expect(out).toContain('₱100');
  });
  it('replaces repeated and missing tokens ({{missing}} → empty, spaces collapsed)', () => {
    expect(fillTemplate('{{a}} and {{a}} but {{gone}} here', { a: 'x' })).toBe('x and x but here');
  });
  it('keeps $-sequences in values literal (no regex-replacement injection)', () => {
    expect(fillTemplate('Hi {{name}}', { name: "$& $' $` $1" })).toBe("Hi $& $' $` $1");
  });
});

describe('outbox', () => {
  const input = { requestId: 'req-1', channel: 'sms' as const, to: '0917', template: 'confirmed', by: 'Maria' };

  it('appendOutbox returns the new entry and listOutbox reads it back', () => {
    const e = appendOutbox(input);
    expect(e.id).toBeTruthy();
    expect(e.at).toBeTruthy();
    expect(listOutbox()).toEqual([e]);
  });
  it('is newest-first', () => {
    appendOutbox(input);
    const later = appendOutbox({ ...input, requestId: 'req-2' });
    expect(listOutbox()[0].id).toBe(later.id);
    expect(listOutbox().map((e) => e.requestId)).toEqual(['req-2', 'req-1']);
  });
  it('persists through the parish-NAMESPACED seam, not a bare key', () => {
    appendOutbox(input);
    expect(localStorage.getItem(ns('notify_outbox'))).toBeTruthy();
    expect(localStorage.getItem('notify_outbox')).toBeNull();
  });
  it('is defensive against missing fields', () => {
    const e = appendOutbox({} as unknown as Parameters<typeof appendOutbox>[0]);
    expect(e.by).toBe('unknown');
    expect(e.channel).toBe('sms');
    expect(e.requestId).toBe('');
    expect(listOutbox().length).toBe(1);
  });
  it('caps growth at 500 entries', () => {
    const many: OutboxEntry[] = [];
    for (let i = 0; i < 502; i++) many.push(appendOutbox({ ...input, requestId: `r${i}` }));
    expect(listOutbox().length).toBe(500);
    // the newest survive
    expect(listOutbox()[0].requestId).toBe('r501');
  });
});
