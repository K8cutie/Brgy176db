// Parish theme resolver — turns a parish's patron saint into a brand palette.
//
// The system: every patron has a liturgical FAMILY (see patronCatalog), and the family
// sets a dignified BASE palette — Marian is blue/white, feasts of the Lord are white/gold,
// the Holy Spirit / Cross / apostles / martyrs are red. Iconic patrons then get a hand-tuned
// palette + emblem layered on top. The payoff: even a patron NOT in the catalog still gets a
// fitting theme from its family — a parish's branding never lands on a generic gray.
//
// Depth (locked with the user): this drives BRANDING surfaces only — login, the dashboard
// header, and the public parishioner portal — applied via CSS variables, not a full re-skin.

import {
  type LiturgicalFamily,
  type PatronEntry,
  findPatron,
  normalizePatron,
} from './patronCatalog';

export interface ThemePalette {
  primary: string; // brand band / header background
  accent: string; // gold / highlight
  secondary: string; // supporting deep tone
  surface: string; // light tint
  onPrimary: string; // text + icon sitting on `primary`
  liturgicalColor: string; // human label, e.g. "Blue and white"
}

// ── the three liturgical base palettes ──────────────────────────────────────
const MARIAN_BASE: ThemePalette = {
  primary: '#1E3A6E', accent: '#C9A227', secondary: '#5E80B5',
  surface: '#F2ECDD', onPrimary: '#EFE7D2', liturgicalColor: 'Blue and white',
};
const GLORY_BASE: ThemePalette = {
  primary: '#8C6A1A', accent: '#E6C25A', secondary: '#6B4F2B',
  surface: '#F4ECD6', onPrimary: '#F4E9C9', liturgicalColor: 'White and gold',
};
const PASSION_BASE: ThemePalette = {
  primary: '#8E1B1B', accent: '#D9B45F', secondary: '#5A1212',
  surface: '#F3E7DD', onPrimary: '#F3E2CE', liturgicalColor: 'Red',
};

export const FAMILY_BASE: Record<LiturgicalFamily, ThemePalette> = {
  marian: MARIAN_BASE,
  lord: GLORY_BASE,
  confessor: GLORY_BASE,
  religious: GLORY_BASE,
  angel: GLORY_BASE,
  'holy-spirit': PASSION_BASE,
  'holy-cross': PASSION_BASE,
  apostle: PASSION_BASE,
  martyr: PASSION_BASE,
};

const DEFAULT_EMBLEM: Record<LiturgicalFamily, string> = {
  marian: 'star',
  lord: 'cross',
  confessor: 'cross',
  religious: 'cross',
  angel: 'cross',
  'holy-spirit': 'flame',
  'holy-cross': 'cross',
  apostle: 'cross',
  martyr: 'cross',
};

// ── hand-tuned themes for iconic patrons (keyed by normalized catalog name) ──
interface IconicOverride {
  palette?: Partial<ThemePalette>;
  emblem?: string;
}
const ICONIC: Record<string, IconicOverride> = {
  'our lady of mercy': {
    palette: { primary: '#1E3A6E', accent: '#C9A227', secondary: '#5E80B5', surface: '#F2ECDD', onPrimary: '#EFE7D2' },
    emblem: 'star',
  },
  'santo nino': {
    palette: { primary: '#B11226', accent: '#E0A526', secondary: '#16603A', surface: '#F6ECCB', onPrimary: '#FBEFC8', liturgicalColor: 'Red and gold' },
    emblem: 'crown',
  },
  'our lady of perpetual help': {
    palette: { primary: '#7B1E2B', accent: '#C9A227', secondary: '#1F4D46', surface: '#F3E9D2', onPrimary: '#F3E4C7' },
    emblem: 'star',
  },
  'sacred heart of jesus': {
    palette: { primary: '#9B1C2E', accent: '#E0A526', secondary: '#7A1F2B', surface: '#F4E8DC', onPrimary: '#F6E6CE', liturgicalColor: 'Red and gold' },
    emblem: 'heart',
  },
  'st roch': {
    palette: { primary: '#2E5E3A', accent: '#C9A24E', secondary: '#6B4F2B', surface: '#EFE8D4', onPrimary: '#EAF0DC' },
    emblem: 'walk',
  },
  'christ the king': {
    palette: { primary: '#4A2C6E', accent: '#E6C25A', secondary: '#7A1F2B', surface: '#F2ECDD', onPrimary: '#EFE6D4' },
    emblem: 'crown',
  },
  'jesus the good shepherd': {
    palette: { primary: '#2E5E3A', accent: '#D9B45F', secondary: '#6B4F2B', surface: '#EFE8D4', onPrimary: '#EAF0DC' },
    emblem: 'cross',
  },
  'san isidro labrador': {
    palette: { primary: '#5C6B2E', accent: '#C9A24E', secondary: '#8A5A2B', surface: '#EFE9D2', onPrimary: '#EEF0DC' },
    emblem: 'plant-2',
  },
  'jesus of nazareth': {
    palette: { primary: '#5A1A22', accent: '#C9A227', secondary: '#2A0E12', surface: '#EFE3D6', onPrimary: '#EFDFC8', liturgicalColor: 'Maroon and gold' },
    emblem: 'cross',
  },
  'holy spirit': { emblem: 'flame' },
};

export interface ResolvedTheme {
  patron: string;
  family: LiturgicalFamily;
  feastDay?: string;
  palette: ThemePalette;
  emblem: string;
  source: 'iconic' | 'family' | 'default';
}

export const DEFAULT_FAMILY: LiturgicalFamily = 'lord';

// Resolve a parish's theme from its patron (and/or an explicit family for custom patrons).
// Always returns a complete, valid theme — unknown patrons fall back to their family, and an
// empty input falls back to the default family. Never throws, never returns a partial palette.
export function resolveTheme(input: { patron?: string; family?: LiturgicalFamily } = {}): ResolvedTheme {
  const patronInput = input.patron?.trim() || undefined;
  const entry: PatronEntry | undefined = patronInput ? findPatron(patronInput) : undefined;

  const family: LiturgicalFamily = input.family ?? entry?.family ?? DEFAULT_FAMILY;
  const base = FAMILY_BASE[family];

  const iconicKey = entry ? normalizePatron(entry.patron) : patronInput ? normalizePatron(patronInput) : undefined;
  const override = iconicKey ? ICONIC[iconicKey] : undefined;

  const palette: ThemePalette = { ...base, ...(override?.palette ?? {}) };
  const emblem = override?.emblem ?? DEFAULT_EMBLEM[family];
  const source: ResolvedTheme['source'] = override ? 'iconic' : entry || input.family ? 'family' : 'default';

  return {
    patron: entry?.patron ?? patronInput ?? 'Default',
    family,
    feastDay: entry?.feastDay,
    palette,
    emblem,
    source,
  };
}
