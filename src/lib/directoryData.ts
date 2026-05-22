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
  members: Parishioner[];
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

/** Generate a flat list of all individual parishioners from family data */
function buildParishionerLookup(): ParishionerLookup[] {
  const list: ParishionerLookup[] = [];
  for (const family of families) {
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

export const parishionerLookupList: ParishionerLookup[] = buildParishionerLookup();
