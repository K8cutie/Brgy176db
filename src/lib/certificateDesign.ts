// Guided visual certificate designer — data model + pure HTML generator.
//
// A non-technical secretary edits STRUCTURED sections (header / title / body /
// detail rows / signatures / registry ref) plus a handful of global style
// controls, with a live preview. The output is the SAME {{token}} HTML the
// shipped certificate templates use, so generation (replaceTokens), print and
// PDF keep working unchanged.
//
// IMPORTANT: designToHtml OUTPUTS {{tokens}} VERBATIM — it never substitutes.
// Substitution happens later, at generation time, in registryData.replaceTokens.

import type { CertificateSacrament } from './registryData';

/* ═══════════════════════════════════════════════════════════════════
   AUTHORITATIVE SHAPE
   ═══════════════════════════════════════════════════════════════════ */

export interface CertificateDesign {
  // global style
  fontFamily: string;            // a CSS font stack from FONT_OPTIONS (serif choices + one sans)
  accentColor: string;           // title, header, seal ring (hex)
  textColor: string;             // body text (hex)
  bgColor: string;               // page background (hex, usually #FFFFFF)
  borderStyle: 'double' | 'solid' | 'ornate' | 'none';
  borderColor: string;           // hex
  // header
  showHeader: boolean;
  headerText: string;            // may contain tokens, default '{{parish_name}}'
  headerSubText: string;         // default '{{parish_address}}'
  // title + body
  title: string;                 // e.g. 'Certificate of Baptism'
  titleSize: number;             // px
  bodyText: string;              // multi-line; \n => paragraph breaks; may contain tokens
  bodySize: number;              // px
  // details rows
  showDetails: boolean;
  detailRows: { label: string; value: string }[];  // label bold + value (value usually tokens)
  // footer signatures + seal
  showSignatures: boolean;
  leftSignToken: string;         // '{{priest_name}}'
  leftSignLabel: string;         // 'Parish Priest'
  rightSignToken: string;        // '{{date_today}}'
  rightSignLabel: string;        // 'Date Issued'
  sealImage: string;             // base64 data URL, or '' to show the ring + sealText
  sealText: string;              // 'OFFICIAL SEAL'
  // registry ref
  showRegistryRef: boolean;
  registryRefText: string;       // 'Registry Ref: Book {{book_number}}, Page {{page_number}}'
}

/* ═══════════════════════════════════════════════════════════════════
   STYLE CATALOGS (for the editor's pickers)
   ═══════════════════════════════════════════════════════════════════ */

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
  { label: 'EB Garamond', value: "'EB Garamond', 'Times New Roman', serif" },
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Inter (Sans-serif)', value: "'Inter', system-ui, -apple-system, sans-serif" },
];

export const BORDER_PRESETS: { value: CertificateDesign['borderStyle']; label: string }[] = [
  { value: 'double', label: 'Double Line' },
  { value: 'solid', label: 'Solid Line' },
  { value: 'ornate', label: 'Ornate (Ridge)' },
  { value: 'none', label: 'None' },
];

// Tasteful quick-pick accents: gold, navy, maroon, forest, charcoal, plum.
export const ACCENT_SWATCHES: string[] = [
  '#C9963B',
  '#1B2A4A',
  '#6B2737',
  '#2D6A4F',
  '#3D3A36',
  '#5B3A6B',
];

/* ═══════════════════════════════════════════════════════════════════
   HTML-ESCAPE (static authored text only; token braces survive intact)
   ═══════════════════════════════════════════════════════════════════ */

// Escapes markup in the secretary's authored text so a stray "<" can't break
// the page. "{" and "}" are not special, so {{tokens}} pass through verbatim.
function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Map the friendly border style to a real CSS `border` shorthand.
function borderCss(style: CertificateDesign['borderStyle'], color: string): string {
  switch (style) {
    case 'double': return `8px double ${color}`;
    case 'solid':  return `4px solid ${color}`;
    case 'ornate': return `10px ridge ${color}`;
    case 'none':
    default:       return 'none';
  }
}

/* ═══════════════════════════════════════════════════════════════════
   PURE GENERATOR — design -> self-contained token HTML (matches t1)
   ═══════════════════════════════════════════════════════════════════ */

export function designToHtml(d: CertificateDesign): string {
  const font = d.fontFamily;
  const border = borderCss(d.borderStyle, d.borderColor);

  // Header (parish name + address line).
  const header = d.showHeader
    ? `
  <div style="text-align: center; margin-bottom: 40px;">
    <div style="font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: ${d.accentColor}; margin-bottom: 8px;">${esc(d.headerText)}</div>
    <div style="font-size: 12px; color: #8C8374;">${esc(d.headerSubText)}</div>
  </div>`
    : '';

  // Body — each newline becomes its own centered paragraph.
  const bodyParas = d.bodyText
    .split('\n')
    .map((line) => `    <p style="margin: 8px 0;">${line.trim() ? esc(line) : '&nbsp;'}</p>`)
    .join('\n');
  const body = `
  <div style="text-align: center; margin: 50px 0; line-height: 2; font-size: ${d.bodySize}px; color: ${d.textColor};">
${bodyParas}
  </div>`;

  // Detail rows (label bold + value).
  const details = d.showDetails && d.detailRows.length
    ? `
  <div style="margin: 40px 0; text-align: center; line-height: 2; font-size: 14px; color: ${d.textColor};">
${d.detailRows.map((r) => `    <p style="margin: 4px 0;"><strong>${esc(r.label)}:</strong> ${esc(r.value)}</p>`).join('\n')}
  </div>`
    : '';

  // Seal: uploaded image, else the ring + sealText.
  const seal = d.sealImage
    ? `<img src="${d.sealImage}" alt="Seal" style="width: 80px; height: 80px; object-fit: contain;" />`
    : `<div style="width: 80px; height: 80px; border: 3px solid ${d.accentColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${d.accentColor}; font-size: 10px; text-align: center;">${esc(d.sealText).replace(/ /g, '<br/>')}</div>`;

  // Signature footer (two signature lines flanking the seal).
  const signatures = d.showSignatures
    ? `
  <div style="position: absolute; bottom: 80px; left: 60px; right: 60px; display: flex; justify-content: space-between; align-items: flex-end;">
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 200px; padding-top: 8px; font-size: 12px;">${esc(d.leftSignToken)}</div>
      <div style="font-size: 11px; color: #8C8374;">${esc(d.leftSignLabel)}</div>
    </div>
    ${seal}
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 120px; padding-top: 8px; font-size: 12px;">${esc(d.rightSignToken)}</div>
      <div style="font-size: 11px; color: #8C8374;">${esc(d.rightSignLabel)}</div>
    </div>
  </div>`
    : '';

  // Registry reference (monospace footer line).
  const registryRef = d.showRegistryRef
    ? `
  <div style="position: absolute; bottom: 30px; left: 60px; right: 60px; text-align: center; font-size: 10px; color: #8C8374; font-family: 'JetBrains Mono', monospace;">
    ${esc(d.registryRefText)}
  </div>`
    : '';

  return `<div style="font-family: ${font}; padding: 60px; border: ${border}; min-height: 900px; position: relative; background: ${d.bgColor};">
  {{copy_watermark}}${header}
  <h1 style="text-align: center; font-size: ${d.titleSize}px; color: ${d.accentColor}; letter-spacing: 4px; text-transform: uppercase; margin: 40px 0;">${esc(d.title)}</h1>${body}${details}${signatures}${registryRef}
</div>`;
}

/* ═══════════════════════════════════════════════════════════════════
   PER-SACRAMENT DEFAULTS (double gold border, Playfair, navy accents)
   ═══════════════════════════════════════════════════════════════════ */

function baseDesign(): Omit<CertificateDesign, 'title' | 'bodyText' | 'detailRows'> {
  return {
    fontFamily: FONT_OPTIONS[0].value,   // Playfair Display
    accentColor: '#1B2A4A',              // navy
    textColor: '#3D3A36',
    bgColor: '#FFFFFF',
    borderStyle: 'double',
    borderColor: '#C9963B',              // gold
    showHeader: true,
    headerText: '{{parish_name}}',
    headerSubText: '{{parish_address}}',
    titleSize: 32,
    bodySize: 16,
    showDetails: true,
    showSignatures: true,
    leftSignToken: '{{priest_name}}',
    leftSignLabel: 'Parish Priest',
    rightSignToken: '{{date_today}}',
    rightSignLabel: 'Date Issued',
    sealImage: '',
    sealText: 'OFFICIAL SEAL',
    showRegistryRef: true,
    registryRefText: 'Registry Ref: Book {{book_number}}, Page {{page_number}}',
  };
}

export function defaultDesign(sacrament: CertificateSacrament): CertificateDesign {
  const base = baseDesign();
  switch (sacrament) {
    case 'marriage':
      return {
        ...base,
        title: 'Certificate of Marriage',
        bodyText: [
          'This is to certify that',
          '{{groom_name}}',
          'and',
          '{{bride_name}}',
          'were united in Holy Matrimony according to the Rite of the',
          'Roman Catholic Church on',
          '{{marriage_date}}',
          'at {{parish_name}}',
        ].join('\n'),
        detailRows: [
          { label: 'Parents of the Groom', value: '{{groom_parents}}' },
          { label: 'Parents of the Bride', value: '{{bride_parents}}' },
          { label: 'Witnesses', value: '{{witness1}} & {{witness2}}' },
          { label: 'Officiating Minister', value: '{{officiant}}' },
        ],
      };
    case 'confirmation':
      return {
        ...base,
        title: 'Certificate of Confirmation',
        bodyText: [
          'This is to certify that',
          '{{confirmand_name}}',
          'born on {{birth_date}}',
          'and baptized on {{baptism_date}} at {{baptism_parish}}',
          'received the Sacrament of Confirmation on',
          '{{confirmation_date}}',
          'at {{parish_name}}',
        ].join('\n'),
        detailRows: [
          { label: 'Sponsor', value: '{{sponsor_name}}' },
          { label: 'Confirming Bishop', value: '{{bishop}}' },
          { label: 'Officiating Minister', value: '{{officiant}}' },
        ],
      };
    case 'death':
      return {
        ...base,
        title: 'Certificate of Death',
        bodyText: [
          'This is to certify that according to the Register of Deaths of this parish',
          '{{deceased_name}}',
          'aged {{deceased_age}} years, departed this life on',
          '{{death_date}}',
          'and was given Christian burial on {{burial_date}}',
          'at {{cemetery}}',
        ].join('\n'),
        detailRows: [
          { label: 'Officiating Minister', value: '{{officiant}}' },
        ],
      };
    case 'baptism':
    default:
      return {
        ...base,
        title: 'Certificate of Baptism',
        bodyText: [
          'This is to certify that',
          '{{child_name}}',
          'born on {{birth_date}}',
          'was duly baptized according to the Rite of the',
          'Roman Catholic Church on',
          '{{baptism_date}}',
          'at {{parish_name}}',
        ].join('\n'),
        detailRows: [
          { label: 'Parents', value: '{{father_name}} & {{mother_name}}' },
          { label: 'Godparents', value: '{{godfather}} & {{godmother}}' },
          { label: 'Officiating Minister', value: '{{officiant}}' },
        ],
      };
  }
}

/* ═══════════════════════════════════════════════════════════════════
   PREVIEW FILL — swap tokens for realistic PH samples (editor preview only)
   ═══════════════════════════════════════════════════════════════════ */

const PREVIEW_SAMPLES: Record<string, string> = {
  // people
  '{{child_name}}': 'Maria Clara Reyes Santos',
  '{{confirmand_name}}': 'Jose Antonio Reyes Dela Cruz',
  '{{deceased_name}}': 'Eduardo Cruz Santos',
  '{{groom_name}}': 'Carlo Lim Garcia',
  '{{bride_name}}': 'Maria Elena Santos Lim',
  '{{father_name}}': 'Jose Cruz Santos',
  '{{mother_name}}': 'Ana Marie Santos Reyes (Reyes)',
  '{{godfather}}': 'Pedro Lim',
  '{{godmother}}': 'Sofia Garcia',
  '{{groom_parents}}': 'Carlos Garcia & Diana Aquino',
  '{{bride_parents}}': 'Manuel Lim & Rosario Garcia',
  '{{witness1}}': 'Jose Santos',
  '{{witness2}}': 'Ana Marie Reyes',
  '{{sponsor_name}}': 'Maria Clara Santos',
  '{{bishop}}': 'Bishop Florentino Lavarias',
  '{{officiant}}': 'Fr. Reyes',
  '{{priest_name}}': 'Fr. Reyes',
  '{{deceased_age}}': '78',
  // places
  '{{parish_name}}': 'St. Michael the Archangel Parish',
  '{{parish_address}}': 'Mabalacat, Pampanga',
  '{{baptism_parish}}': 'St. Michael the Archangel Parish',
  '{{cemetery}}': 'San Lorenzo Cemetery',
  // dates
  '{{birth_date}}': 'January 15, 2024',
  '{{baptism_date}}': 'February 10, 2024',
  '{{marriage_date}}': 'June 15, 2024',
  '{{confirmation_date}}': 'April 28, 2024',
  '{{death_date}}': 'March 10, 2024',
  '{{burial_date}}': 'March 15, 2024',
  '{{date_today}}': 'July 14, 2026',
  // record reference
  '{{book_number}}': '1',
  '{{page_number}}': '45',
  '{{registry_number}}': '2024-0001',
  // special
  '{{copy_watermark}}': '',
};

// Replace the known tokens with realistic sample values so the editor preview
// looks like a real certificate. Any unknown/leftover token is blanked out.
export function previewFill(html: string): string {
  return html
    .replace(/\{\{[a-z0-9_]+\}\}/gi, (m) =>
      Object.prototype.hasOwnProperty.call(PREVIEW_SAMPLES, m) ? PREVIEW_SAMPLES[m] : '',
    );
}
