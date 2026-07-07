// ═══════════════════════════════════════════════════════════
// Sacrament requirements catalog — what a parishioner needs to bring,
// prepare, and know for each parish service, in warm plain English.
// Defaults reflect common Philippine practice (PSA documents, ninong/ninang
// customs, batch scheduling) with terse canonical references.
// A parish can replace any list via public_config.requirements[key]
// (see getSacramentInfo). Pure data + pure functions — unit-testable.
// ═══════════════════════════════════════════════════════════

export type RequirementKind = 'document' | 'preparation' | 'eligibility' | 'sponsor';

export interface SacramentRequirement {
  id: string;
  label: string;
  detail?: string;
  kind: RequirementKind;
}

export interface SacramentInfo {
  key: string;
  title: string;
  icon: string;
  leadTime?: string;
  requirements: SacramentRequirement[];
  sponsorRules?: string;
  phNotes?: string;
  canonicalRefs?: string;
}

const KINDS: readonly RequirementKind[] = ['document', 'preparation', 'eligibility', 'sponsor'];

// The portal's event-booking <select> uses display labels; map them to catalog keys.
export const EVENT_TYPE_TO_SACRAMENT: Record<string, string> = {
  Baptism: 'baptism',
  Wedding: 'wedding',
  Funeral: 'funeral',
  Blessing: 'blessing',
};

export const DEFAULT_SACRAMENT_INFO: SacramentInfo[] = [
  {
    key: 'baptism',
    title: 'Baptism (Binyag)',
    icon: '💧',
    leadTime: 'Register about 3–4 weeks before your preferred date — the seminar comes first, and papers are usually due about a week before the baptism.',
    requirements: [
      { id: 'baptism_child_birth_cert', label: "Child's PSA birth certificate", kind: 'document', detail: "A PSA (or local civil registrar) copy of your child's birth certificate. Bring a photocopy too." },
      { id: 'baptism_parents_marriage', label: "Parents' marriage certificate or details", kind: 'document', detail: 'PSA or church marriage certificate if you have one. Children of civilly-married or unmarried parents can still be baptized — the parish simply records the details.' },
      { id: 'baptism_godparent_list', label: 'List of godparents', kind: 'document', detail: 'Names and addresses of the principal sponsors, submitted when you register. Some parishes cap how many are recorded.' },
      { id: 'baptism_seminar', label: 'Pre-baptismal seminar', kind: 'preparation', detail: 'Parents and godparents attend a short one-time seminar at the parish, usually a few weeks before the baptism.' },
      { id: 'baptism_godparent_quals', label: "Godparents' qualifications", kind: 'sponsor', detail: "Principal sponsors must be at least 16 (many parishes ask for 18+), baptized and confirmed, practicing Catholics, and not the child's parents." },
      { id: 'baptism_principal_sponsors', label: 'Principal sponsors and proxies', kind: 'sponsor', detail: 'You can have many ninong and ninang, but only one godfather and/or one godmother are recorded officially. An absent sponsor can be represented by a proxy.' },
      { id: 'baptism_adults_rcia', label: 'Adults and older children (7+)', kind: 'eligibility', detail: 'Candidates aged 7 and up are prepared through instruction (RCIA) and a profession of faith first — ask the parish office.' },
    ],
    sponsorRules: "One godfather and/or one godmother are recorded as principal sponsors. Each must be 16+ (commonly 18+ here), a confirmed, practicing Catholic, and not the child's parent. Extra ninong/ninang are honorary; a proxy may stand in for an absent sponsor.",
    phNotes: 'Baptisms are often celebrated in batches (for example, one Sunday a month). Requirements vary slightly per parish, so confirm early — some parishes replace the live seminar with a baptismal booklet.',
    canonicalRefs: 'CIC cann. 851, 857, 867, 872–874',
  },
  {
    key: 'wedding',
    title: 'Catholic Wedding (Holy Matrimony)',
    icon: '💍',
    leadTime: 'Book the church 3–6 months ahead (popular Metro Manila churches: 6–12 months). All papers are usually due about 1 month before the wedding.',
    requirements: [
      { id: 'wedding_psa_birth', label: 'PSA birth certificate (both of you)', kind: 'document', detail: 'A newly issued PSA copy for each of you — parishes usually want one issued within the last 6 months.' },
      { id: 'wedding_cenomar', label: 'PSA CENOMAR (both of you)', kind: 'document', detail: 'Certificate of No Marriage Record for each of you, valid 6 months from PSA issuance.' },
      { id: 'wedding_baptismal_cert', label: "Baptismal certificate — 'For Marriage Purposes'", kind: 'document', detail: 'Newly issued by your parish of baptism with that annotation; usually valid only 3–6 months including the wedding date.' },
      { id: 'wedding_confirmation_cert', label: "Confirmation certificate — 'For Marriage Purposes'", kind: 'document', detail: 'Newly issued by your parish of confirmation, same annotation and 3–6 month validity window.' },
      { id: 'wedding_marriage_license', label: 'Marriage license (or PSA marriage certificate)', kind: 'document', detail: 'From the Local Civil Registrar, valid 120 days (a 10-day posting period applies). Already civilly married? Submit your PSA marriage certificate instead.' },
      { id: 'wedding_home_parish_permit', label: 'Permit from your home parish (if marrying elsewhere)', kind: 'document', detail: "An endorsement from the bride's or groom's own parish when the wedding is in another parish. Non-church venues need a bishop's dispensation." },
      { id: 'wedding_canonical_interview', label: 'Canonical interview', kind: 'preparation', detail: "The priest interviews both of you to confirm you're free to marry — often about 3 months before the wedding." },
      { id: 'wedding_pre_cana', label: 'Pre-Cana marriage seminar', kind: 'preparation', detail: 'Attend the diocesan or parish marriage-preparation seminar and submit the certificate of attendance.' },
      { id: 'wedding_banns', label: 'Marriage banns', kind: 'preparation', detail: "Announced on 3 consecutive Sundays at both of your home parishes; the signed bann forms are returned to the wedding parish." },
      { id: 'wedding_confirmed_first', label: 'Be confirmed (kumpil) before the wedding', kind: 'eligibility', detail: 'Catholics should receive confirmation before marriage if possible; confession before the wedding is also encouraged.' },
      { id: 'wedding_mixed_marriage', label: 'Marrying a non-Catholic?', kind: 'eligibility', detail: "Marriage to a baptized non-Catholic needs the bishop's permission; to someone unbaptized, a dispensation. The parish will guide you through it." },
      { id: 'wedding_sponsor_list', label: 'List of sponsors with complete addresses', kind: 'sponsor', detail: 'Submitted in advance with your other papers. Parishes often also ask for 2x2 photos and photocopies of your valid IDs.' },
      { id: 'wedding_sponsors_standing', label: 'Principal sponsors in good standing', kind: 'sponsor', detail: 'Your ninong and ninang should be practicing Catholics; parishes commonly cap the number of principal-sponsor pairs.' },
    ],
    sponsorRules: 'Principal sponsors (ninong/ninang) should be practicing Catholics in good standing. The parish needs your sponsor list with complete addresses in advance, and may limit how many pairs are allowed.',
    phNotes: "'For marriage purposes' certificates expire in 3–6 months, so order them close to the date. Couples already civilly married skip the marriage license and submit their PSA marriage certificate. Bann forms are filed at BOTH of your home parishes.",
    canonicalRefs: 'CIC cann. 1065–1070, 1086, 1108–1118, 1124–1129',
  },
  {
    key: 'confirmation',
    title: 'Confirmation (Kumpil)',
    icon: '🕊️',
    leadTime: 'Inquire 1–2 months ahead — parishes usually confirm in batches on scheduled dates (fiesta, a bishop\'s visit) once the catechesis is done.',
    requirements: [
      { id: 'confirmation_baptismal_cert', label: 'Baptismal certificate', kind: 'document', detail: 'A recent copy from the parish where you were baptized. Not yet baptized? That comes first — the parish can help.' },
      { id: 'confirmation_birth_cert', label: 'Birth certificate', kind: 'document', detail: 'PSA or local civil registrar copy — many parishes and dioceses ask for it.' },
      { id: 'confirmation_sponsor_list', label: 'List of sponsors', kind: 'document', detail: 'Names and addresses of your sponsors, submitted in advance. Some dioceses cap the number of pairs.' },
      { id: 'confirmation_catechesis', label: 'Catechesis / orientation seminar', kind: 'preparation', detail: 'A short catechesis or orientation on the sacrament before your schedule is finalized.' },
      { id: 'confirmation_age', label: 'Age of candidate', kind: 'eligibility', detail: 'In the Archdiocese of Manila: baptized Catholics 12 and above. Younger children follow the parish or school program.' },
      { id: 'confirmation_sponsor_quals', label: 'Sponsor qualifications', kind: 'sponsor', detail: "Ideally your baptismal ninong or ninang: 16+, a confirmed practicing Catholic, and not your parent." },
    ],
    sponsorRules: 'One sponsor per candidate, preferably a baptismal godparent, with the same qualifications as baptismal sponsors. Parents are excluded.',
    phNotes: "Kumpil is usually required before a church wedding, so many adults seek it late — parishes run special adult batches. Certificates 'for marriage purposes' need a fresh annotated copy.",
    canonicalRefs: 'CIC cann. 889–891, 893',
  },
  {
    key: 'first_communion',
    title: 'First Holy Communion',
    icon: '🍞',
    leadTime: 'Enroll at the start of the catechetical or school year — parish batch celebrations are scheduled months in advance.',
    requirements: [
      { id: 'first_communion_baptismal_cert', label: 'Baptismal certificate', kind: 'document', detail: 'A copy from the parish where the child was baptized.' },
      { id: 'first_communion_birth_cert', label: 'Birth certificate', kind: 'document', detail: 'PSA or local civil registrar copy.' },
      { id: 'first_communion_catechesis', label: 'Catechesis attendance', kind: 'preparation', detail: 'Completion of the parish or Catholic-school catechism program, including first confession before first communion.' },
      { id: 'first_communion_age', label: 'Age of discretion', kind: 'eligibility', detail: 'Around age 7 and up — typically celebrated in batches around Grade 2–4.' },
    ],
    sponsorRules: 'No sponsors needed — parents or guardians simply accompany the child.',
    phNotes: 'Most children receive it through school or parish catechism batches; individual requests are usually folded into the next scheduled batch after catechesis.',
    canonicalRefs: 'CIC cann. 913–914',
  },
  {
    key: 'funeral',
    title: 'Funeral Mass / Blessing',
    icon: '🌹',
    leadTime: 'Usually arranged 1–3 days ahead during the wake, subject to the church calendar and priest availability.',
    requirements: [
      { id: 'funeral_death_cert', label: 'Death certificate', kind: 'document', detail: 'The registered death certificate — usually handled by the funeral home — presented when booking.' },
      { id: 'funeral_schedule', label: 'Book with the parish office', kind: 'preparation', detail: "The family or funeral home books the funeral Mass or blessing and provides the deceased's details for the parish register." },
      { id: 'funeral_catholic', label: 'For baptized Catholics', kind: 'eligibility', detail: "Choose a funeral Mass at the church, or a priest's blessing of the remains at the wake or chapel." },
    ],
    sponsorRules: 'Not applicable.',
    phNotes: 'Cremation is permitted — the rites may be held before or after, and the urn may be blessed. Ashes are kept in a sacred place, not scattered. If a Mass is not possible, the parish can send a priest for the blessing of the remains.',
    canonicalRefs: 'CIC cann. 1176–1185',
  },
  {
    key: 'blessing',
    title: 'Blessing (House / Car / Store)',
    icon: '🏠',
    leadTime: 'Book about 1–2 weeks ahead; some parishes can come within a few days. Car blessings are often done after Mass at the church patio.',
    requirements: [
      { id: 'blessing_schedule', label: 'Schedule with the parish office', kind: 'preparation', detail: 'Request the blessing with your preferred date and time — subject to priest availability.' },
      { id: 'blessing_location', label: 'Location and contact details', kind: 'document', detail: 'The address of the house or store (or bring the vehicle to the church) and a contact number.' },
    ],
    sponsorRules: 'Not applicable.',
    phNotes: 'Very simple — no documents beyond the location and contact info. A voluntary donation to the parish is customary.',
    canonicalRefs: 'Book of Blessings',
  },
  {
    key: 'mass_intention',
    title: 'Mass Intention (Pamisa)',
    icon: '🕯️',
    leadTime: 'At least 1 day before the preferred Mass — book earlier for special dates like death anniversaries or novena Masses.',
    requirements: [
      { id: 'mass_intention_details', label: 'Your intention', kind: 'document', detail: 'The type (thanksgiving, healing, special intention, for the departed), the names to be prayed for, and your preferred Mass date and time.' },
      { id: 'mass_intention_offering', label: 'Voluntary offering', kind: 'document', detail: 'A free-will donation accompanies the intention. The Archdiocese of Manila abolished fixed rates in 2021 — give what you can.' },
      { id: 'mass_intention_advance', label: 'Submit ahead of time', kind: 'preparation', detail: 'Hand it in at the parish office (or online) at least a day before the Mass; some parishes cap intentions per Mass.' },
    ],
    sponsorRules: 'None — anyone may offer a Mass intention for the living or the dead.',
    phNotes: 'No documents or IDs needed. Many parishes accept intentions through website forms, Facebook, or GCash.',
    canonicalRefs: 'CIC cann. 945–958',
  },
  {
    key: 'certificate',
    title: 'Certificate Request (Baptismal / Confirmation / Marriage / Death)',
    icon: '📜',
    leadTime: 'Typically 1–5 working days; some parishes release the same day. Claim in person, or send a representative with the authorization letter and IDs.',
    requirements: [
      { id: 'certificate_valid_id', label: 'Valid government ID', kind: 'document', detail: 'One valid government-issued ID of the requester, presented at the parish office.' },
      { id: 'certificate_authorization', label: "Authorization letter + owner's ID (if requesting for someone else)", kind: 'document', detail: "A signed authorization letter from the record owner, plus a copy of the owner's valid ID and your own." },
      { id: 'certificate_record_details', label: 'Record details', kind: 'document', detail: "The full name on the record, the approximate date of the sacrament, and the parents' names including the mother's maiden name." },
      { id: 'certificate_purpose', label: 'Purpose of the request', kind: 'eligibility', detail: "Certificates annotated 'For Marriage Purposes' are typically valid for only 6 months from issuance — request them close to when you need them." },
      { id: 'certificate_parish_of_record', label: 'Request from the parish of the sacrament', kind: 'eligibility', detail: 'Only the parish holding the register (or the diocesan archives for old parishes) can issue it — PSA does not keep church records.' },
    ],
    sponsorRules: 'Not applicable.',
    phNotes: 'Many parishes accept requests online with pickup or courier delivery. A small office fee usually applies. Very old records may need a diocesan-archives search, which adds time.',
    canonicalRefs: 'CIC can. 535',
  },
];

/**
 * Look up a sacrament's info. If the parish's public_config carries a
 * well-formed `requirements[key]` array ({label, detail?, kind?} items), it
 * REPLACES the default requirements list; anything malformed is ignored and
 * the defaults are kept. Defensive by design — public_config is operator-edited
 * JSON and must never crash the portal.
 */
export function getSacramentInfo(key: string, publicConfig?: unknown): SacramentInfo | undefined {
  const base = DEFAULT_SACRAMENT_INFO.find((s) => s.key === key);
  if (!base) return undefined;
  const override = parseOverride(key, publicConfig);
  return override ? { ...base, requirements: override } : base;
}

// Returns a validated override list, or null when absent/malformed.
function parseOverride(key: string, publicConfig: unknown): SacramentRequirement[] | null {
  if (!publicConfig || typeof publicConfig !== 'object') return null;
  const reqs = (publicConfig as Record<string, unknown>).requirements;
  if (!reqs || typeof reqs !== 'object' || Array.isArray(reqs)) return null;
  const list = (reqs as Record<string, unknown>)[key];
  if (!Array.isArray(list) || list.length === 0) return null;
  const out: SacramentRequirement[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null; // one bad item = whole override rejected
    const rec = item as Record<string, unknown>;
    if (typeof rec.label !== 'string' || rec.label.trim() === '') return null;
    out.push({
      id: `${key}_custom_${i}`,
      label: rec.label.trim(),
      detail: typeof rec.detail === 'string' ? rec.detail : undefined,
      kind: KINDS.includes(rec.kind as RequirementKind) ? (rec.kind as RequirementKind) : 'document',
    });
  }
  return out;
}

const SUMMARY_CAP = 500;
const cap = (s: string): string => (s.length <= SUMMARY_CAP ? s : s.slice(0, SUMMARY_CAP - 1) + '…');

/**
 * Turn a checked-off requirements list into two FLAT strings for the
 * service_requests.details JSONB (staff UI renders details generically as
 * strings, so no nesting). Each string is capped at 500 chars.
 * Example ready: "4/7 — PSA birth cert, Pre-baptismal seminar".
 */
export function buildAckSummary(info: SacramentInfo, checkedIds: string[]): { ready: string; missing: string } {
  const checked = new Set(checkedIds);
  const readyLabels: string[] = [];
  const missingLabels: string[] = [];
  for (const r of info.requirements) (checked.has(r.id) ? readyLabels : missingLabels).push(r.label);
  const total = info.requirements.length;
  const fmt = (labels: string[]) => cap(`${labels.length}/${total}` + (labels.length ? ` — ${labels.join(', ')}` : ''));
  return { ready: fmt(readyLabels), missing: fmt(missingLabels) };
}
