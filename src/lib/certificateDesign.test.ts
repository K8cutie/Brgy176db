// The guided visual editor must emit the SAME {{token}} HTML the shipped
// certificate templates use — never substituting tokens itself — and must honor
// every structural toggle. These tests lock that contract so a later editor UI
// (and generation/print/PDF) can rely on designToHtml's output shape.
import { describe, it, expect } from 'vitest';
import {
  defaultDesign,
  designToHtml,
  previewFill,
  FONT_OPTIONS,
  BORDER_PRESETS,
  ACCENT_SWATCHES,
  type CertificateDesign,
} from './certificateDesign';
import { templateFromDesign, type CertificateSacrament } from './registryData';

const SACRAMENTS: CertificateSacrament[] = ['baptism', 'marriage', 'confirmation', 'death'];

describe('defaultDesign', () => {
  it('returns a distinct, valid design per sacrament', () => {
    const titles = new Set<string>();
    for (const s of SACRAMENTS) {
      const d = defaultDesign(s);
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.bodyText.length).toBeGreaterThan(0);
      expect(d.detailRows.length).toBeGreaterThan(0);
      // Style seeded close to the shipped t1 look.
      expect(d.borderStyle).toBe('double');
      expect(d.borderColor).toBe('#C9963B');
      expect(FONT_OPTIONS.map((f) => f.value)).toContain(d.fontFamily);
      titles.add(d.title);
    }
    // Each sacrament gets its own wording.
    expect(titles.size).toBe(SACRAMENTS.length);
  });

  it('uses the real per-sacrament tokens in its body', () => {
    expect(defaultDesign('baptism').bodyText).toContain('{{child_name}}');
    expect(defaultDesign('marriage').bodyText).toContain('{{groom_name}}');
    expect(defaultDesign('marriage').bodyText).toContain('{{bride_name}}');
    expect(defaultDesign('confirmation').bodyText).toContain('{{confirmand_name}}');
    expect(defaultDesign('death').bodyText).toContain('{{deceased_name}}');
    expect(defaultDesign('death').bodyText).toContain('{{burial_date}}');
  });
});

describe('designToHtml', () => {
  it('keeps {{tokens}} verbatim (never substitutes)', () => {
    const html = designToHtml(defaultDesign('baptism'));
    for (const token of ['{{child_name}}', '{{birth_date}}', '{{baptism_date}}', '{{parish_name}}', '{{priest_name}}', '{{date_today}}', '{{book_number}}', '{{page_number}}']) {
      expect(html).toContain(token);
    }
  });

  it('honors showRegistryRef — omits the ref line when false', () => {
    const d = defaultDesign('baptism');
    expect(designToHtml({ ...d, showRegistryRef: true })).toContain('{{book_number}}');
    const off = designToHtml({ ...d, showRegistryRef: false });
    expect(off).not.toContain('{{book_number}}');
    expect(off).not.toContain('{{page_number}}');
  });

  it('honors showHeader / showDetails / showSignatures toggles', () => {
    const d = defaultDesign('baptism');
    const off = designToHtml({ ...d, showHeader: false, showDetails: false, showSignatures: false });
    // header token, a detail token, and a signature label all gone.
    expect(off).not.toContain('{{parish_address}}');
    expect(off).not.toContain('{{godfather}}');
    expect(off).not.toContain('Parish Priest');
    // body + title survive.
    expect(off).toContain('{{child_name}}');
    expect(off).toContain('Certificate of Baptism');
  });

  it('renders the seal ring + sealText when no image, and an <img> when sealImage is set', () => {
    const d = defaultDesign('baptism');
    const ring = designToHtml({ ...d, sealImage: '', sealText: 'OFFICIAL SEAL' });
    expect(ring).toContain('border-radius: 50%');
    expect(ring).not.toContain('<img');

    const dataUrl = 'data:image/png;base64,ABC123';
    const withImg = designToHtml({ ...d, sealImage: dataUrl });
    expect(withImg).toContain(`<img src="${dataUrl}"`);
  });

  it('splits bodyText newlines into separate paragraphs', () => {
    const d: CertificateDesign = { ...defaultDesign('baptism'), bodyText: 'Line one\nLine two\nLine three' };
    const html = designToHtml(d);
    expect(html).toContain('<p style="margin: 8px 0;">Line one</p>');
    expect(html).toContain('<p style="margin: 8px 0;">Line two</p>');
    expect(html).toContain('<p style="margin: 8px 0;">Line three</p>');
  });

  it('applies the border-style preset and colors', () => {
    const d = defaultDesign('baptism');
    expect(designToHtml({ ...d, borderStyle: 'double', borderColor: '#C9963B' })).toContain('border: 8px double #C9963B');
    expect(designToHtml({ ...d, borderStyle: 'solid', borderColor: '#111111' })).toContain('border: 4px solid #111111');
    expect(designToHtml({ ...d, borderStyle: 'ornate', borderColor: '#222222' })).toContain('border: 10px ridge #222222');
    expect(designToHtml({ ...d, borderStyle: 'none' })).toContain('border: none');
    expect(designToHtml({ ...d, bgColor: '#FEFEFE' })).toContain('background: #FEFEFE');
    expect(designToHtml({ ...d, accentColor: '#654321' })).toContain('color: #654321');
  });

  it('escapes authored text but leaves token braces intact', () => {
    const d: CertificateDesign = { ...defaultDesign('baptism'), title: '<script>x</script> {{child_name}}' };
    const html = designToHtml(d);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('{{child_name}}');
  });
});

describe('previewFill', () => {
  it('replaces known tokens with sample values and blanks unknown ones', () => {
    const filled = previewFill(designToHtml(defaultDesign('baptism')));
    expect(filled).toContain('Maria Clara Reyes Santos');
    expect(filled).toContain('St. Michael the Archangel Parish');
    // No {{...}} tokens should remain after preview fill.
    expect(filled).not.toMatch(/\{\{[a-z0-9_]+\}\}/i);
  });

  it('blanks an unknown token to empty string', () => {
    expect(previewFill('a {{unknown_token}} b')).toBe('a  b');
  });
});

describe('templateFromDesign', () => {
  it('sets both html and design, a tcustom- id, and non-system flags', () => {
    const design = defaultDesign('marriage');
    const t = templateFromDesign(design, 'My Marriage Cert', 'marriage');
    expect(t.id).toMatch(/^tcustom-/);
    expect(t.isSystem).toBe(false);
    expect(t.isDefault).toBe(false);
    expect(t.sacrament).toBe('marriage');
    expect(t.name).toBe('My Marriage Cert');
    expect(t.design).toEqual(design);
    expect(t.html).toBe(designToHtml(design));
    expect(t.html).toContain('{{groom_name}}');
  });

  it('re-saves in place when an id is supplied', () => {
    const design = defaultDesign('baptism');
    const t = templateFromDesign(design, 'Edited', 'baptism', 'tcustom-123');
    expect(t.id).toBe('tcustom-123');
  });

  it('falls back to a default name when blank', () => {
    const t = templateFromDesign(defaultDesign('death'), '   ', 'death');
    expect(t.name).toBe('Custom Certificate');
  });
});

describe('style catalogs', () => {
  it('expose usable font, border, and accent options', () => {
    expect(FONT_OPTIONS.length).toBeGreaterThanOrEqual(4);
    expect(BORDER_PRESETS.map((b) => b.value).sort()).toEqual(['double', 'none', 'ornate', 'solid']);
    expect(ACCENT_SWATCHES).toContain('#C9963B');
    expect(ACCENT_SWATCHES.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c))).toBe(true);
  });
});
