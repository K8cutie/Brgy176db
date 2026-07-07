// Parishioner Directory Data
// Family-centric directory with sacramental history

export interface Parishioner {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female';
  relationship: 'Head' | 'Spouse' | 'Son' | 'Daughter' | 'Relative' | 'Other';
  sacraments: Sacrament[];
}

export type SacramentType = 'Baptism' | 'Confirmation' | 'Marriage' | 'Death';

export interface Sacrament {
  type: SacramentType;
  date: string;
  parish?: string;
  bookPage?: string;
  /** Link to the sacramental registry record this history entry came from. */
  registryRecordId?: string;
}

export interface Family {
  id: string;
  familyName: string;
  color: string;
  status: 'Active' | 'Inactive' | 'Transferred' | 'Deceased';
  street: string;
  barangay: string;
  sitio: string;
  city: string;
  province: string;
  primaryPhone: string;
  secondaryPhone?: string;
  email?: string;
  notes: string;
  tags?: string[];
  members: Parishioner[];
  // --- SOFT DELETE (shared contract; absent = live) ---
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  /** Set when this family was archived by a merge — its members now live on
   *  the kept family, so restoring it verbatim would resurrect duplicates. */
  mergedInto?: string;
}

export const familyColors = [
  '#C9963B',
  '#2D6A4F',
  '#6B2737',
  '#5B3A73',
  '#3B6BC9',
  '#B8322F',
  '#1B2A4A',
  '#8C8374',
];

export const barangays = ['San Roque', 'Dau', 'San Francisco', 'Athens', 'Mabiga', 'Dapdap'];

export const families: Family[] = [
  {
    id: 'f1',
    familyName: 'Dela Cruz',
    color: familyColors[0],
    status: 'Active',
    street: '123 Mango Street',
    barangay: 'San Roque',
    sitio: 'Maligaya',
    city: 'Mabalacat',
    province: 'Pampanga',
    primaryPhone: '0917-555-0101',
    secondaryPhone: '',
    email: '',
    notes: 'Regular parishioners since 2015.',
    members: [
      {
        id: 'p1',
        firstName: 'Juan',
        middleName: 'Reyes',
        lastName: 'Dela Cruz',
        dateOfBirth: '1979-05-15',
        gender: 'Male',
        relationship: 'Head',
        sacraments: [
          { type: 'Baptism', date: '1979-06-10', parish: 'St. Michael', bookPage: '1/23' },
          { type: 'Confirmation', date: '1995-04-20', parish: 'St. Michael' },
          { type: 'Marriage', date: '2005-12-10', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p2',
        firstName: 'Maria',
        middleName: 'Santos',
        lastName: 'Dela Cruz',
        dateOfBirth: '1982-08-22',
        gender: 'Female',
        relationship: 'Spouse',
        sacraments: [
          { type: 'Baptism', date: '1982-09-15', parish: 'St. Michael' },
          { type: 'Confirmation', date: '1998-05-18', parish: 'St. Michael' },
          { type: 'Marriage', date: '2005-12-10', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p3',
        firstName: 'Jose',
        middleName: 'Reyes',
        lastName: 'Dela Cruz',
        dateOfBirth: '2006-03-10',
        gender: 'Male',
        relationship: 'Son',
        sacraments: [
          { type: 'Baptism', date: '2006-04-15', parish: 'St. Michael' },
          { type: 'Confirmation', date: '2020-05-25', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p4',
        firstName: 'Ana',
        middleName: 'Santos',
        lastName: 'Dela Cruz',
        dateOfBirth: '2009-11-05',
        gender: 'Female',
        relationship: 'Daughter',
        sacraments: [
          { type: 'Baptism', date: '2009-12-20', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p5',
        firstName: 'Pedro',
        middleName: 'Reyes',
        lastName: 'Dela Cruz',
        dateOfBirth: '2012-07-18',
        gender: 'Male',
        relationship: 'Son',
        sacraments: [
          { type: 'Baptism', date: '2012-08-25', parish: 'St. Michael' },
        ],
      },
    ],
  },
  {
    id: 'f2',
    familyName: 'Santos',
    color: familyColors[1],
    status: 'Active',
    street: '456 Santol Road',
    barangay: 'Dau',
    sitio: 'Mapagkalinga',
    city: 'Mabalacat',
    province: 'Pampanga',
    primaryPhone: '0917-555-0202',
    secondaryPhone: '0918-555-0203',
    email: 'santos.family@email.com',
    notes: 'Active in choir ministry.',
    members: [
      {
        id: 'p6',
        firstName: 'Roberto',
        middleName: 'Cruz',
        lastName: 'Santos',
        dateOfBirth: '1974-02-28',
        gender: 'Male',
        relationship: 'Head',
        sacraments: [
          { type: 'Baptism', date: '1974-04-10', parish: 'St. Michael' },
          { type: 'Confirmation', date: '1990-04-15', parish: 'St. Michael' },
          { type: 'Marriage', date: '2000-06-18', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p7',
        firstName: 'Elena',
        middleName: 'Bautista',
        lastName: 'Santos',
        dateOfBirth: '1976-09-12',
        gender: 'Female',
        relationship: 'Spouse',
        sacraments: [
          { type: 'Baptism', date: '1976-10-20', parish: 'St. Michael' },
          { type: 'Confirmation', date: '1992-05-10', parish: 'St. Michael' },
          { type: 'Marriage', date: '2000-06-18', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p8',
        firstName: 'Miguel',
        middleName: 'Cruz',
        lastName: 'Santos',
        dateOfBirth: '2002-12-05',
        gender: 'Male',
        relationship: 'Son',
        sacraments: [
          { type: 'Baptism', date: '2003-01-15', parish: 'St. Michael' },
          { type: 'Confirmation', date: '2017-04-22', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p9',
        firstName: 'Sofia',
        middleName: 'Bautista',
        lastName: 'Santos',
        dateOfBirth: '2004-06-18',
        gender: 'Female',
        relationship: 'Daughter',
        sacraments: [
          { type: 'Baptism', date: '2004-08-01', parish: 'St. Michael' },
          { type: 'Confirmation', date: '2019-05-18', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p10',
        firstName: 'Carlos',
        middleName: 'Cruz',
        lastName: 'Santos',
        dateOfBirth: '2008-04-25',
        gender: 'Male',
        relationship: 'Son',
        sacraments: [
          { type: 'Baptism', date: '2008-06-10', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p11',
        firstName: 'Isabelle',
        middleName: 'Bautista',
        lastName: 'Santos',
        dateOfBirth: '2014-10-30',
        gender: 'Female',
        relationship: 'Daughter',
        sacraments: [
          { type: 'Baptism', date: '2014-12-15', parish: 'St. Michael' },
        ],
      },
    ],
  },
  {
    id: 'f3',
    familyName: 'Reyes',
    color: familyColors[2],
    status: 'Active',
    street: 'Rectory',
    barangay: 'San Roque',
    sitio: 'Poblacion',
    city: 'Mabalacat',
    province: 'Pampanga',
    primaryPhone: '0917-555-0303',
    secondaryPhone: '',
    email: 'fr.reyes@churchos.ph',
    notes: 'Parish priest residence.',
    members: [
      {
        id: 'p12',
        firstName: 'Fr. Antonio',
        middleName: 'Dela Cruz',
        lastName: 'Reyes',
        dateOfBirth: '1969-06-08',
        gender: 'Male',
        relationship: 'Head',
        sacraments: [
          { type: 'Baptism', date: '1969-07-20', parish: 'St. Michael' },
          { type: 'Confirmation', date: '1985-04-25', parish: 'St. Michael' },
        ],
      },
    ],
  },
  // Adding more families for better density
  {
    id: 'f4',
    familyName: 'Garcia',
    color: familyColors[3],
    status: 'Active',
    street: '789 Sampaguita Drive',
    barangay: 'San Francisco',
    sitio: 'Mabuhay',
    city: 'Mabalacat',
    province: 'Pampanga',
    primaryPhone: '0917-555-0404',
    email: 'garcia.home@email.com',
    notes: '',
    members: [
      {
        id: 'p13',
        firstName: 'Carlos',
        middleName: 'Lim',
        lastName: 'Garcia',
        dateOfBirth: '1980-01-15',
        gender: 'Male',
        relationship: 'Head',
        sacraments: [
          { type: 'Baptism', date: '1980-02-20', parish: 'St. Michael' },
          { type: 'Confirmation', date: '1996-04-15', parish: 'St. Michael' },
          { type: 'Marriage', date: '2008-06-21', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p14',
        firstName: 'Diana',
        middleName: 'Aquino',
        lastName: 'Garcia',
        dateOfBirth: '1983-04-22',
        gender: 'Female',
        relationship: 'Spouse',
        sacraments: [
          { type: 'Baptism', date: '1983-05-30', parish: 'St. Michael' },
          { type: 'Confirmation', date: '1999-05-10', parish: 'St. Michael' },
          { type: 'Marriage', date: '2008-06-21', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p15',
        firstName: 'Sofia Marie',
        middleName: 'Aquino',
        lastName: 'Garcia',
        dateOfBirth: '2010-09-10',
        gender: 'Female',
        relationship: 'Daughter',
        sacraments: [
          { type: 'Baptism', date: '2010-10-25', parish: 'St. Michael' },
          { type: 'Confirmation', date: '2023-04-28', parish: 'St. Michael' },
        ],
      },
    ],
  },
  {
    id: 'f5',
    familyName: 'Aquino',
    color: familyColors[4],
    status: 'Active',
    street: '321 Acacia Lane',
    barangay: 'Athens',
    sitio: 'Bagong Buhay',
    city: 'Mabalacat',
    province: 'Pampanga',
    primaryPhone: '0917-555-0505',
    notes: '',
    members: [
      {
        id: 'p16',
        firstName: 'Eduardo',
        middleName: 'Santos',
        lastName: 'Aquino',
        dateOfBirth: '1977-11-03',
        gender: 'Male',
        relationship: 'Head',
        sacraments: [
          { type: 'Baptism', date: '1977-12-15', parish: 'St. Michael' },
          { type: 'Confirmation', date: '1993-04-20', parish: 'St. Michael' },
          { type: 'Marriage', date: '2003-02-14', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p17',
        firstName: 'Lucia',
        middleName: 'Reyes',
        lastName: 'Aquino',
        dateOfBirth: '1979-07-18',
        gender: 'Female',
        relationship: 'Spouse',
        sacraments: [
          { type: 'Baptism', date: '1979-08-25', parish: 'St. Michael' },
          { type: 'Confirmation', date: '1995-05-15', parish: 'St. Michael' },
          { type: 'Marriage', date: '2003-02-14', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p18',
        firstName: 'Rafael Joseph',
        middleName: 'Reyes',
        lastName: 'Aquino',
        dateOfBirth: '2006-03-30',
        gender: 'Male',
        relationship: 'Son',
        sacraments: [
          { type: 'Baptism', date: '2006-05-10', parish: 'St. Michael' },
          { type: 'Confirmation', date: '2019-05-21', parish: 'St. Michael' },
        ],
      },
    ],
  },
  {
    id: 'f6',
    familyName: 'Lim',
    color: familyColors[5],
    status: 'Active',
    street: '555 Narra Street',
    barangay: 'Mabiga',
    sitio: 'Santo Nino',
    city: 'Mabalacat',
    province: 'Pampanga',
    primaryPhone: '0917-555-0606',
    email: '',
    notes: '',
    members: [
      {
        id: 'p19',
        firstName: 'Manuel',
        middleName: 'Garcia',
        lastName: 'Lim',
        dateOfBirth: '1981-09-20',
        gender: 'Male',
        relationship: 'Head',
        sacraments: [
          { type: 'Baptism', date: '1981-10-30', parish: 'St. Michael' },
          { type: 'Confirmation', date: '1997-04-18', parish: 'St. Michael' },
          { type: 'Marriage', date: '2010-05-22', parish: 'St. Michael' },
        ],
      },
      {
        id: 'p20',
        firstName: 'Rosario',
        middleName: 'Garcia',
        lastName: 'Lim',
        dateOfBirth: '1984-12-12',
        gender: 'Female',
        relationship: 'Spouse',
        sacraments: [
          { type: 'Baptism', date: '1985-01-20', parish: 'St. Michael' },
          { type: 'Confirmation', date: '2001-05-12', parish: 'St. Michael' },
          { type: 'Marriage', date: '2010-05-22', parish: 'St. Michael' },
        ],
      },
    ],
  },
];

export function getFullName(p: Parishioner): string {
  return `${p.firstName} ${p.middleName} ${p.lastName}`;
}

export function getAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export function getInitials(p: Parishioner): string {
  return (p.firstName[0] + p.lastName[0]).toUpperCase();
}

export function getSacramentBadges(p: Parishioner) {
  const badges: { type: SacramentType; label: string; active: boolean }[] = [
    { type: 'Baptism', label: 'Baptized', active: p.sacraments.some((s) => s.type === 'Baptism') },
    { type: 'Confirmation', label: 'Confirmed', active: p.sacraments.some((s) => s.type === 'Confirmation') },
    { type: 'Marriage', label: 'Married', active: p.sacraments.some((s) => s.type === 'Marriage') },
  ];
  return badges;
}


// ───────────────────────────────────────────────────────────────────
// Parishioner Lookup for Sacramental Registry Autocomplete
// ───────────────────────────────────────────────────────────────────

/** Philippine barangays for the parish (Mabalacat, Pampanga) */
export const BARANGAYS = [
  'San Roque', 'Dau', 'Mabiga', 'Mawaque', 'Mangalit',
  'Dolores', 'Atlu-Bola', 'Bical', 'Bundagul', 'Cacutud'
] as const;

export const SITIOS: Record<string, string[]> = {
  'San Roque': ['Maligaya', 'Bagong Silang', 'Mapayapa', 'Gintong Araw'],
  'Dau': ['Mapagkalinga', 'Pag-asa', 'Sikat'],
  'Mabiga': ['Main', 'Sapang Balen'],
  'Mawaque': ['Main', 'Extension'],
  'Mangalit': ['Main'],
  'Dolores': ['Main', 'Balarillo'],
  'Atlu-Bola': ['Main'],
  'Bical': ['Main', 'Centro'],
  'Bundagul': ['Main', 'Mabuhay'],
  'Cacutud': ['Main']
};

export const CITIES = ['Mabalacat', 'Angeles', 'San Fernando', 'Apalit', 'Arayat'] as const;
export const PROVINCES = ['Pampanga', 'Tarlac', 'Bataan', 'Bulacan', 'Nueva Ecija'] as const;

/** For parishioner lookup — export a searchable flat list of all parishioners */
export interface ParishionerLookup {
  id: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  fullName: string; // "LastName, FirstName MiddleName"
  familyId: string;
  familyName: string;
  role: 'Head' | 'Spouse' | 'Child';
  address: string;
  contact?: string;
}

/** Generate a flat list of individual parishioners from the GIVEN family data.
 *  Callers must pass the live (persisted) directory — soft-deleted/archived
 *  families are excluded here so no search surface can hand out an archived
 *  or merged-away parishioner. */
export function buildParishionerLookupFrom(familyList: Family[]): ParishionerLookup[] {
  const list: ParishionerLookup[] = [];
  for (const family of familyList) {
    if (family.isDeleted) continue;
    for (const member of family.members) {
      const role: ParishionerLookup['role'] =
        member.relationship === 'Head' ? 'Head' :
        member.relationship === 'Spouse' ? 'Spouse' : 'Child';
      list.push({
        id: member.id,
        lastName: member.lastName,
        firstName: member.firstName,
        middleName: member.middleName,
        fullName: `${member.lastName}, ${member.firstName} ${member.middleName}`.trim(),
        familyId: family.id,
        familyName: family.familyName,
        role,
        address: `${family.street}, ${family.sitio}, ${family.barangay}, ${family.city}, ${family.province}`,
        contact: family.primaryPhone,
      });
    }
  }
  return list;
}

/** Static snapshot built from the seed data — kept for callers that have no
 *  live directory at hand (prefer buildParishionerLookupFrom with the
 *  persisted families). */
export const parishionerLookupList: ParishionerLookup[] = buildParishionerLookupFrom(families);

// ───────────────────────────────────────────────────────────────────
// Registry ⇄ Directory sacrament link — PURE helper. When a registry record
// is saved with a linked recipient (childParishionerId, groom/bride,
// confirmand, deceased), the matching sacrament entry on that member gains
// registryRecordId so the directory badge can click through to the register.
// ───────────────────────────────────────────────────────────────────

export interface SacramentLinkEntry {
  type: SacramentType;
  date: string;
  parish?: string;
  bookPage?: string;
  registryRecordId: string;
}

/** Upsert `entry` onto the member's sacrament history (immutably).
 *  Match rules: an entry already linked to the SAME registry record is the
 *  same event by definition — its date/parish/bookPage are refreshed in place
 *  (an edit-resave may have corrected them); otherwise exact type+date is the
 *  same event; otherwise, for one-time sacraments (anything but Marriage) an
 *  existing unlinked entry of the same type is treated as the same event
 *  (directory dates are often approximate); otherwise a new entry is appended.
 *  Returns the input array unchanged when the member isn't found or the link
 *  is already in place. */
export function linkSacramentToRegistry(
  familyList: Family[],
  parishionerId: string,
  entry: SacramentLinkEntry,
): { families: Family[]; changed: boolean } {
  let changed = false;
  const next = familyList.map((family) => {
    if (family.isDeleted || !family.members.some((m) => m.id === parishionerId)) return family;
    return {
      ...family,
      members: family.members.map((member) => {
        if (member.id !== parishionerId) return member;
        const sacraments = (member.sacraments ?? []).map((s) => ({ ...s }));
        // Same registry record already linked → same event, even when the
        // date was edited since. Refresh its fields in place; NEVER append a
        // duplicate on an edit-resave.
        const linked = sacraments.find((s) => s.registryRecordId === entry.registryRecordId);
        if (linked) {
          const upToDate =
            linked.date === entry.date &&
            (!entry.parish || linked.parish === entry.parish) &&
            (!entry.bookPage || linked.bookPage === entry.bookPage);
          if (upToDate) return member;
          linked.date = entry.date;
          if (entry.parish) linked.parish = entry.parish;
          if (entry.bookPage) linked.bookPage = entry.bookPage;
          changed = true;
          return { ...member, sacraments };
        }
        const existing =
          sacraments.find((s) => s.type === entry.type && s.date === entry.date) ??
          (entry.type !== 'Marriage'
            ? sacraments.find((s) => s.type === entry.type && !s.registryRecordId)
            : undefined);
        if (existing) {
          const already =
            existing.registryRecordId === entry.registryRecordId &&
            (existing.parish || !entry.parish) &&
            (existing.bookPage || !entry.bookPage);
          if (already) return member;
          existing.registryRecordId = entry.registryRecordId;
          if (!existing.date && entry.date) existing.date = entry.date;
          if (!existing.parish && entry.parish) existing.parish = entry.parish;
          if (!existing.bookPage && entry.bookPage) existing.bookPage = entry.bookPage;
        } else {
          sacraments.push({
            type: entry.type,
            date: entry.date,
            ...(entry.parish ? { parish: entry.parish } : {}),
            ...(entry.bookPage ? { bookPage: entry.bookPage } : {}),
            registryRecordId: entry.registryRecordId,
          });
        }
        changed = true;
        return { ...member, sacraments };
      }),
    };
  });
  return changed ? { families: next, changed } : { families: familyList, changed };
}


// ───────────────────────────────────────────────────────────────────
// Duplicate merge — PURE helpers. They compute the merged entity plus the
// registry-link rewrites the caller must apply (every *ParishionerId field on
// registry records pointing at `fromParishionerId` should be repointed to
// `toParishionerId`). Nothing here touches storage.
// ───────────────────────────────────────────────────────────────────

export interface RegistryLinkRewrite {
  fromParishionerId: string;
  toParishionerId: string;
}

export interface ParishionerMergeResult {
  merged: Parishioner;
  rewrites: RegistryLinkRewrite[];
}

export interface FamilyMergeResult {
  merged: Family;
  rewrites: RegistryLinkRewrite[];
}

// Two sacrament-history entries describe the same event when type and date
// match; merging fills in whichever reference fields the kept entry lacked.
function unionSacraments(keep: Sacrament[], absorb: Sacrament[] | undefined): Sacrament[] {
  const out = keep.map((s) => ({ ...s }));
  for (const s of absorb ?? []) {
    const dupe = out.find((k) => k.type === s.type && k.date === s.date);
    if (!dupe) {
      out.push({ ...s });
    } else {
      if (!dupe.parish && s.parish) dupe.parish = s.parish;
      if (!dupe.bookPage && s.bookPage) dupe.bookPage = s.bookPage;
      if (!dupe.registryRecordId && s.registryRecordId) dupe.registryRecordId = s.registryRecordId;
    }
  }
  return out;
}

/** Merge duplicate parishioners: `keep` wins on every conflicting field,
 *  `absorb` fills gaps; sacrament histories are unioned (deduped by
 *  type + date). The returned rewrite repoints registry links from the
 *  absorbed id to the kept id. */
export function mergeParishioners(keep: Parishioner, absorb: Parishioner): ParishionerMergeResult {
  const merged: Parishioner = {
    ...keep,
    middleName: keep.middleName || absorb.middleName,
    dateOfBirth: keep.dateOfBirth || absorb.dateOfBirth,
    sacraments: unionSacraments(keep.sacraments ?? [], absorb.sacraments),
  };
  const rewrites: RegistryLinkRewrite[] =
    absorb.id && absorb.id !== keep.id
      ? [{ fromParishionerId: absorb.id, toParishionerId: keep.id }]
      : [];
  return { merged, rewrites };
}

// Same person listed in both families: identical id, or same name + birth date.
function isSamePerson(a: Parishioner, b: Parishioner): boolean {
  if (a.id === b.id) return true;
  return (
    a.firstName.trim().toLowerCase() === b.firstName.trim().toLowerCase() &&
    a.lastName.trim().toLowerCase() === b.lastName.trim().toLowerCase() &&
    !!a.dateOfBirth && a.dateOfBirth === b.dateOfBirth
  );
}

/** Merge duplicate families: `keep` wins on identity/address/contacts,
 *  `absorb` fills gaps; members are unioned — an absorbed member who is the
 *  same person as a kept member is merged into them (producing a registry-link
 *  rewrite), otherwise they join the kept family as-is. */
export function mergeFamilies(keep: Family, absorb: Family): FamilyMergeResult {
  const members: Parishioner[] = keep.members.map((m) => ({
    ...m,
    sacraments: (m.sacraments ?? []).map((s) => ({ ...s })),
  }));
  const rewrites: RegistryLinkRewrite[] = [];
  for (const m of absorb.members ?? []) {
    const idx = members.findIndex((k) => isSamePerson(k, m));
    if (idx === -1) {
      members.push({ ...m, sacraments: (m.sacraments ?? []).map((s) => ({ ...s })) });
    } else {
      const r = mergeParishioners(members[idx], m);
      members[idx] = r.merged;
      rewrites.push(...r.rewrites);
    }
  }
  const tags = Array.from(new Set([...(keep.tags ?? []), ...(absorb.tags ?? [])]));
  const merged: Family = {
    ...keep,
    secondaryPhone: keep.secondaryPhone || absorb.secondaryPhone,
    email: keep.email || absorb.email,
    notes: [keep.notes, absorb.notes].filter(Boolean).join(' | '),
    ...(tags.length ? { tags } : {}),
    members,
  };
  return { merged, rewrites };
}
