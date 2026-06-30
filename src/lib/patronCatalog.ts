// Patron-saint catalog — the canonical, typed list the theme system resolves against.
//
// Research provenance, sources, and data gaps live in docs/themes/novaliches-patrons.json
// (Diocese of Novaliches: 73 parishes / 12 vicariates -> 58 distinct patrons, verified by a
// 3-source Household research workflow). This file is the machine copy the app imports; keep
// the two in sync when the catalog grows to other dioceses.

export type LiturgicalFamily =
  | 'marian'
  | 'lord'
  | 'holy-spirit'
  | 'holy-cross'
  | 'apostle'
  | 'martyr'
  | 'confessor'
  | 'religious'
  | 'angel';

export interface PatronEntry {
  patron: string;
  feastDay: string;
  parishCount: number;
  family: LiturgicalFamily;
}

export const PATRON_CATALOG: PatronEntry[] = [
  { patron: 'Christ the King', feastDay: 'Solemnity of Christ the King (late November)', parishCount: 4, family: 'lord' },
  { patron: 'San Isidro Labrador (St. Isidore the Farmer)', feastDay: 'May 15', parishCount: 3, family: 'confessor' },
  { patron: 'St. Joseph', feastDay: 'March 19', parishCount: 3, family: 'confessor' },
  { patron: 'Jesus, the Good Shepherd', feastDay: 'Good Shepherd Sunday (4th Sunday of Easter)', parishCount: 2, family: 'lord' },
  { patron: 'Jesus, Lord of the Divine Mercy', feastDay: 'Divine Mercy Sunday', parishCount: 2, family: 'lord' },
  { patron: 'Holy Spirit', feastDay: 'Pentecost Sunday', parishCount: 2, family: 'holy-spirit' },
  { patron: 'Santo Niño (Holy Child Jesus)', feastDay: 'Third Sunday of January', parishCount: 2, family: 'lord' },
  { patron: 'Holy Family (Sagrada Familia)', feastDay: 'Sunday within the Octave of Christmas', parishCount: 2, family: 'lord' },
  { patron: 'Our Lady of Peace and Good Voyage', feastDay: 'movable (Antipolo tradition)', parishCount: 2, family: 'marian' },
  { patron: 'Resurrection of Our Lord', feastDay: 'Easter Sunday', parishCount: 2, family: 'lord' },
  { patron: 'Holy Cross (Exaltation of the Holy Cross)', feastDay: 'September 14', parishCount: 2, family: 'holy-cross' },
  { patron: 'Mary, the Queen', feastDay: 'August 22', parishCount: 1, family: 'marian' },
  { patron: 'Ascension of Our Lord', feastDay: 'Solemnity of the Ascension (movable)', parishCount: 1, family: 'lord' },
  { patron: 'Visitation of the Blessed Virgin Mary', feastDay: 'May 31', parishCount: 1, family: 'marian' },
  { patron: 'St. Paul the Apostle', feastDay: 'June 29; Conversion January 25', parishCount: 1, family: 'apostle' },
  { patron: 'St. Francis Xavier', feastDay: 'December 3', parishCount: 1, family: 'confessor' },
  { patron: 'Sacred Heart of Jesus', feastDay: 'Solemnity of the Sacred Heart (movable, June)', parishCount: 1, family: 'lord' },
  { patron: 'Our Lady of Fatima', feastDay: 'May 13', parishCount: 1, family: 'marian' },
  { patron: 'Santo Kristo (Holy Christ)', feastDay: 'unknown', parishCount: 1, family: 'lord' },
  { patron: 'Mary, Mother of the Redeemer', feastDay: 'January 1', parishCount: 1, family: 'marian' },
  { patron: 'St. Pio of Pietrelcina (Padre Pio)', feastDay: 'September 23', parishCount: 1, family: 'confessor' },
  { patron: 'St. Lucy (Santa Lucia)', feastDay: 'December 13', parishCount: 1, family: 'martyr' },
  { patron: 'Divine Savior (Transfiguration of the Lord)', feastDay: 'August 6', parishCount: 1, family: 'lord' },
  { patron: 'Most Holy Trinity', feastDay: 'Trinity Sunday', parishCount: 1, family: 'lord' },
  { patron: 'Our Lady of the Holy Rosary', feastDay: 'October 7', parishCount: 1, family: 'marian' },
  { patron: 'St. John Paul II', feastDay: 'October 22', parishCount: 1, family: 'confessor' },
  { patron: 'St. Joseph the Worker', feastDay: 'May 1', parishCount: 1, family: 'confessor' },
  { patron: 'Jesus of Nazareth (Black Nazarene)', feastDay: 'January 9 (Traslacion)', parishCount: 1, family: 'lord' },
  { patron: 'Sacred Heart of Jesus and Immaculate Heart of Mary', feastDay: 'movable (June)', parishCount: 1, family: 'lord' },
  { patron: 'St. Benedict of Nursia', feastDay: 'July 11', parishCount: 1, family: 'religious' },
  { patron: 'St. Pedro Calungsod', feastDay: 'April 2', parishCount: 1, family: 'martyr' },
  { patron: 'Our Mother of Divine Providence', feastDay: 'Saturday before 3rd Sunday of November', parishCount: 1, family: 'marian' },
  { patron: 'Our Lady, Mother of the Promised Land (Ina ng Lupang Pangako)', feastDay: 'November 27', parishCount: 1, family: 'marian' },
  { patron: 'Epiphany of the Lord', feastDay: 'January 6', parishCount: 1, family: 'lord' },
  { patron: 'Our Lady of Guadalupe', feastDay: 'December 12', parishCount: 1, family: 'marian' },
  { patron: 'St. Agnes of Rome', feastDay: 'January 21', parishCount: 1, family: 'martyr' },
  { patron: 'Mary, Mother of the Church', feastDay: 'Monday after Pentecost', parishCount: 1, family: 'marian' },
  { patron: 'Our Lady of Lourdes', feastDay: 'February 11', parishCount: 1, family: 'marian' },
  { patron: 'St. Maximilian Mary Kolbe', feastDay: 'August 14', parishCount: 1, family: 'martyr' },
  { patron: 'Immaculate Conception of the BVM', feastDay: 'December 8', parishCount: 1, family: 'marian' },
  { patron: 'Our Lady of Mercy (Ina ng Novaliches)', feastDay: 'September 24', parishCount: 1, family: 'marian' },
  { patron: 'Corpus Christi', feastDay: 'Solemnity of Corpus Christi (movable, June)', parishCount: 1, family: 'lord' },
  { patron: 'Our Lady, Mother of Life (Ina ng Buhay)', feastDay: 'September 8', parishCount: 1, family: 'marian' },
  { patron: 'St. Bartholomew the Apostle', feastDay: 'August 24', parishCount: 1, family: 'apostle' },
  { patron: 'Most Blessed Sacrament (Banal na Sakramento)', feastDay: 'Solemnity of Corpus Christi (movable, June)', parishCount: 1, family: 'lord' },
  { patron: "The Our Father (the Lord's Prayer)", feastDay: 'unknown (no fixed liturgical feast)', parishCount: 1, family: 'lord' },
  { patron: 'Our Lady of Consolation', feastDay: 'September 4', parishCount: 1, family: 'marian' },
  { patron: 'Annunciation of the Lord', feastDay: 'March 25', parishCount: 1, family: 'marian' },
  { patron: 'St. Lorenzo Ruiz of Manila', feastDay: 'September 28', parishCount: 1, family: 'martyr' },
  { patron: 'St. Vincent de Paul', feastDay: 'September 27', parishCount: 1, family: 'confessor' },
  { patron: 'St. Peter the Apostle', feastDay: 'June 29; Chair of St. Peter February 22', parishCount: 1, family: 'apostle' },
  { patron: 'Presentation of the Lord', feastDay: 'February 2', parishCount: 1, family: 'lord' },
  { patron: 'St. Michael the Archangel', feastDay: 'September 29', parishCount: 1, family: 'angel' },
  { patron: 'St. Anthony of Padua', feastDay: 'June 13', parishCount: 1, family: 'confessor' },
  { patron: 'St. Anthony Mary Claret', feastDay: 'October 24', parishCount: 1, family: 'confessor' },
  { patron: 'St. Paul of the Cross', feastDay: 'October 19', parishCount: 1, family: 'confessor' },
  { patron: 'St. Roch (San Roque)', feastDay: 'August 16', parishCount: 1, family: 'confessor' },
  { patron: 'Our Lady of Perpetual Help', feastDay: 'June 27', parishCount: 1, family: 'marian' },
];

// Normalize a patron name for matching: lowercase, strip diacritics + parentheticals +
// punctuation, collapse whitespace. So "Santo Niño (Holy Child Jesus)" -> "santo nino".
export function normalizePatron(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Common local/variant names that should resolve to a catalog entry.
const ALIASES: Record<string, string> = {
  'ina ng novaliches': 'our lady of mercy',
  'nuestra senora de la merced': 'our lady of mercy',
  'san roque': 'st roch',
  'santo nino de cebu': 'santo nino',
  'sto nino': 'santo nino',
  'black nazarene': 'jesus of nazareth',
  'nuestra senora de la paz y buen viaje': 'our lady of peace and good voyage',
  'sagrada familia': 'holy family',
  'ina ng laging saklolo': 'our lady of perpetual help',
};

// Find a catalog entry by patron name (handles diacritics, parentheticals, and aliases).
export function findPatron(name: string): PatronEntry | undefined {
  const key = normalizePatron(name);
  const target = ALIASES[key] ?? key;
  return PATRON_CATALOG.find((p) => normalizePatron(p.patron) === target);
}
