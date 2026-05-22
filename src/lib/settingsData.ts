// ── Parish Information Defaults ──────────────────────────────────

export interface ParishInfo {
  parishName: string;
  diocese: string;
  parishPriest: string;
  feastDay: string;
  yearEstablished: string;
  address: string;
  contactNumber: string;
  email: string;
  website: string;
  facebook: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  language: string;
}

export const defaultParishInfo: ParishInfo = {
  parishName: 'Immaculate Conception Parish',
  diocese: 'Diocese of San Fernando',
  parishPriest: 'Fr. Antonio Reyes',
  feastDay: 'August 15 — Assumption of Mary',
  yearEstablished: '1985',
  address: '123 Parish Road, Barangay San Jose, City of San Fernando, Pampanga, 2000',
  contactNumber: '+63 45 961 2345',
  email: 'info@icparish.sanfernando.ph',
  website: 'https://icparish.sanfernando.ph',
  facebook: 'https://facebook.com/ICParishSF',
  currency: 'PHP',
  timezone: 'Asia/Manila',
  dateFormat: 'MDY', // May 20, 2026
  language: 'English',
};

export const currencyOptions = [
  { value: 'PHP', label: 'PHP (₱)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
];

export const languageOptions = [
  { value: 'English', label: 'English' },
  { value: 'Tagalog', label: 'Tagalog' },
  { value: 'Bilingual', label: 'English & Tagalog' },
];

export const timezoneOptions = [
  { value: 'Asia/Manila', label: 'Asia/Manila (PST, UTC+8)' },
];

// ── Mass Schedule Defaults ───────────────────────────────────────

export interface MassTime {
  id: string;
  day: string;
  time: string;
  language: string;
  type: string;
  notes: string;
}

export const defaultMassSchedule: MassTime[] = [
  // Sunday
  { id: 'sun-1', day: 'Sunday', time: '6:00 AM', language: 'Tagalog', type: 'Regular', notes: '' },
  { id: 'sun-2', day: 'Sunday', time: '8:00 AM', language: 'English', type: 'Regular', notes: '' },
  { id: 'sun-3', day: 'Sunday', time: '10:00 AM', language: 'Tagalog', type: 'Regular', notes: '' },
  { id: 'sun-4', day: 'Sunday', time: '6:00 PM', language: 'English', type: 'Regular', notes: '' },
  // Monday
  { id: 'mon-1', day: 'Monday', time: '6:00 AM', language: 'Tagalog', type: 'Regular', notes: '' },
  { id: 'mon-2', day: 'Monday', time: '6:00 PM', language: 'Tagalog', type: 'Regular', notes: '' },
  // Tuesday
  { id: 'tue-1', day: 'Tuesday', time: '6:00 AM', language: 'Tagalog', type: 'Regular', notes: '' },
  { id: 'tue-2', day: 'Tuesday', time: '6:00 PM', language: 'Tagalog', type: 'Regular', notes: '' },
  // Wednesday
  { id: 'wed-1', day: 'Wednesday', time: '6:00 AM', language: 'Tagalog', type: 'Regular', notes: '' },
  { id: 'wed-2', day: 'Wednesday', time: '6:00 PM', language: 'Tagalog', type: 'Regular', notes: '' },
  // Thursday
  { id: 'thu-1', day: 'Thursday', time: '6:00 AM', language: 'Tagalog', type: 'Regular', notes: '' },
  { id: 'thu-2', day: 'Thursday', time: '6:00 PM', language: 'Tagalog', type: 'Regular', notes: '' },
  // Friday
  { id: 'fri-1', day: 'Friday', time: '6:00 AM', language: 'Tagalog', type: 'Regular', notes: '' },
  { id: 'fri-2', day: 'Friday', time: '6:00 PM', language: 'Tagalog', type: 'Regular', notes: '' },
  // Saturday
  { id: 'sat-1', day: 'Saturday', time: '6:00 AM', language: 'Tagalog', type: 'Regular', notes: '' },
  { id: 'sat-2', day: 'Saturday', time: '6:00 PM', language: 'English', type: 'Regular', notes: 'Anticipated Sunday Mass' },
];

export const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const massLanguages = ['Tagalog', 'English', 'Bilingual', 'Cebuano', 'Ilocano'];

export const massTypes = ['Regular', 'Sunday', 'Holy Day', 'Wedding', 'Baptismal', 'Daily', 'Anticipated'];

// ── Certificate Templates ────────────────────────────────────────

export interface CertificateTemplate {
  id: string;
  name: string;
  sacrament: string;
  type: 'System' | 'Custom';
  isDefault: boolean;
  lastModified: string;
  html: string;
  css: string;
}

export const defaultTemplateCSS = `.certificate {
  width: 100%;
  min-height: 100%;
  padding: 48px;
  background: #fff;
  font-family: 'Inter', sans-serif;
  color: #3D3A36;
}
.gold-border {
  border: 3px double #C9963B;
  padding: 40px;
  position: relative;
}
.gold-border::before {
  content: '';
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  bottom: 8px;
  border: 1px solid #DDB86B;
  pointer-events: none;
}
.header {
  font-family: 'Playfair Display', serif;
  font-size: 1.5rem;
  font-weight: 600;
  text-align: center;
  color: #1B2A4A;
  margin-bottom: 4px;
}
.subheader {
  font-size: 0.875rem;
  text-align: center;
  color: #8C8374;
  margin-bottom: 24px;
}
h1 {
  font-family: 'Playfair Display', serif;
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
  color: #1B2A4A;
  letter-spacing: 0.05em;
  margin-bottom: 32px;
  border-bottom: 2px solid #C9963B;
  padding-bottom: 12px;
}
.content {
  font-size: 1rem;
  line-height: 1.8;
  margin-bottom: 40px;
}
.content p {
  margin-bottom: 16px;
  text-align: justify;
}
.footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid #EAE5D9;
}
.signature {
  text-align: center;
  font-size: 0.875rem;
}
.signature-line {
  border-top: 1px solid #3D3A36;
  width: 200px;
  margin-bottom: 4px;
}
.seal {
  width: 80px;
  height: 80px;
  border: 2px dashed #C9963B;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  color: #8C8374;
}`;

export const defaultBaptismHTML = `<div class="certificate">
  <div class="gold-border">
    <div class="header">{{parish_name}}</div>
    <div class="subheader">{{parish_address}}</div>
    <h1>BAPTISMAL CERTIFICATE</h1>
    <div class="content">
      <p>This is to certify that <strong>{{child_name}}</strong>, born on {{birth_date}} at {{birth_place}}, was solemnly baptized on {{baptism_date}} according to the Rite of the Roman Catholic Church.</p>
      <p>Sponsors: {{godfather}} and {{godmother}}</p>
      <p>Parents: {{father_name}} and {{mother_name}}</p>
      <p>Officiating Minister: {{officiant}}</p>
      <p>Registry: Book {{book_number}}, Page {{page_number}}</p>
    </div>
    <div class="footer">
      <div class="signature">
        <div class="signature-line"></div>
        {{parish_priest}}<br/>Parish Priest
      </div>
      <div class="seal">{{seal_placeholder}}</div>
    </div>
  </div>
</div>`;

export const sampleData: Record<string, string> = {
  child_name: 'Maria Clara Santos',
  baptism_date: 'May 15, 2024',
  birth_date: 'March 10, 2024',
  birth_place: 'San Fernando, Pampanga',
  father_name: 'Jose Santos',
  mother_name: 'Elena Santos',
  godfather: 'Roberto Cruz',
  godmother: 'Maria Teresa Lim',
  parish_name: 'Immaculate Conception Parish',
  parish_address: '123 Parish Road, San Jose, City of San Fernando, Pampanga',
  parish_priest: 'Fr. Antonio Reyes',
  book_number: '42',
  page_number: '156',
  registry_number: 'BAP-2024-00156',
  officiant: 'Fr. Antonio Reyes',
  date_issued: 'May 20, 2026',
  certificate_number: 'CERT-2026-0042',
  seal_placeholder: '[OFFICIAL SEAL]',
  logo_placeholder: '[PARISH LOGO]',
  signature_line: '____________________',
};

export const certificateTokens = {
  record: [
    '{{child_name}}', '{{baptism_date}}', '{{birth_date}}', '{{birth_place}}',
    '{{father_name}}', '{{mother_name}}', '{{godfather}}', '{{godmother}}',
  ],
  parish: [
    '{{parish_name}}', '{{parish_address}}', '{{parish_priest}}', '{{parish_seal}}', '{{parish_logo}}',
  ],
  official: [
    '{{book_number}}', '{{page_number}}', '{{registry_number}}', '{{officiant}}', '{{date_issued}}', '{{certificate_number}}',
  ],
  format: [
    '{{signature_line}}', '{{seal_placeholder}}', '{{logo_placeholder}}',
  ],
};

export const defaultTemplates: CertificateTemplate[] = [
  {
    id: 'tmpl-1',
    name: 'Standard Baptismal Certificate',
    sacrament: 'Baptism',
    type: 'System',
    isDefault: true,
    lastModified: 'Jan 15, 2026',
    html: defaultBaptismHTML,
    css: defaultTemplateCSS,
  },
  {
    id: 'tmpl-2',
    name: 'Formal Baptismal with Seal',
    sacrament: 'Baptism',
    type: 'System',
    isDefault: false,
    lastModified: 'Dec 20, 2025',
    html: defaultBaptismHTML.replace('BAPTISMAL CERTIFICATE', 'CERTIFICATE OF BAPTISM'),
    css: defaultTemplateCSS,
  },
  {
    id: 'tmpl-3',
    name: 'Simple Baptismal Certificate',
    sacrament: 'Baptism',
    type: 'System',
    isDefault: false,
    lastModified: 'Nov 10, 2025',
    html: defaultBaptismHTML,
    css: defaultTemplateCSS,
  },
  {
    id: 'tmpl-4',
    name: 'Marriage Certificate',
    sacrament: 'Marriage',
    type: 'System',
    isDefault: true,
    lastModified: 'Feb 1, 2026',
    html: `<div class="certificate">
  <div class="gold-border">
    <div class="header">{{parish_name}}</div>
    <div class="subheader">{{parish_address}}</div>
    <h1>MARRIAGE CERTIFICATE</h1>
    <div class="content">
      <p>This is to certify that <strong>{{groom_name}}</strong> and <strong>{{bride_name}}</strong> were united in Holy Matrimony on {{marriage_date}} according to the Rite of the Roman Catholic Church.</p>
      <p>Witnesses: {{witness1}} and {{witness2}}</p>
      <p>Officiating Minister: {{officiant}}</p>
      <p>Registry: Book {{book_number}}, Page {{page_number}}</p>
    </div>
    <div class="footer">
      <div class="signature">
        <div class="signature-line"></div>
        {{parish_priest}}<br/>Parish Priest
      </div>
      <div class="seal">{{seal_placeholder}}</div>
    </div>
  </div>
</div>`,
    css: defaultTemplateCSS,
  },
];

// ── Users ────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: 'Parish Priest' | 'Bookkeeper' | 'Secretary' | 'Finance Council';
  status: 'Active' | 'Inactive';
  lastLogin: string;
}

export const defaultUsers: User[] = [
  { id: 'usr-1', name: 'Fr. Antonio Reyes', username: 'fr.antonio', email: 'fr.antonio@church.ph', role: 'Parish Priest', status: 'Active', lastLogin: 'Today, 8:30 AM' },
  { id: 'usr-2', name: 'Maria Santos', username: 'm.santos', email: 'm.santos@church.ph', role: 'Bookkeeper', status: 'Active', lastLogin: 'Today, 9:15 AM' },
  { id: 'usr-3', name: 'Elena Cruz', username: 'e.cruz', email: 'e.cruz@church.ph', role: 'Secretary', status: 'Active', lastLogin: 'Yesterday, 4:45 PM' },
  { id: 'usr-4', name: 'Roberto Lim', username: 'r.lim', email: 'r.lim@church.ph', role: 'Finance Council', status: 'Active', lastLogin: 'May 18, 2026' },
  { id: 'usr-5', name: 'Juan Dela Cruz', username: 'j.delacruz', email: 'j.delacruz@church.ph', role: 'Secretary', status: 'Inactive', lastLogin: 'Mar 15, 2026' },
];

export const roleDescriptions: Record<string, string> = {
  'Parish Priest': 'Full access to all modules and settings. Can approve financial transactions, manage users, and configure system settings.',
  'Bookkeeper': 'Access to financial management, collections, journal entries, and financial reports. Cannot delete approved transactions.',
  'Secretary': 'Access to sacramental registry, parishioner directory, calendar/scheduling, and certificate generation.',
  'Finance Council': 'View-only access to finances with approval authority. Can review budgets, expenses, and financial reports.',
};

export const roleBadgeColors: Record<string, string> = {
  'Parish Priest': 'bg-deep-navy text-white',
  'Bookkeeper': 'bg-forest-green text-white',
  'Secretary': 'bg-purple text-white',
  'Finance Council': 'bg-maroon text-white',
};

// ── Audit Log ────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  table: string;
  recordId: string;
  details: string;
  ipAddress: string;
  changes?: { field: string; oldValue: string; newValue: string }[];
}

export const auditLogData: AuditLogEntry[] = [
  { id: 'log-1', timestamp: '2026-05-20T09:15:00', user: 'Maria Santos', action: 'Created', table: 'Finance', recordId: 'JV-2026-0042', details: 'Created journal entry for collection: ₱12,400.00', ipAddress: '192.168.1.45' },
  { id: 'log-2', timestamp: '2026-05-20T09:30:00', user: 'Fr. Antonio Reyes', action: 'Approved', table: 'Finance', recordId: 'JV-2026-0042', details: 'Approved collection journal entry', ipAddress: '192.168.1.10' },
  { id: 'log-3', timestamp: '2026-05-20T08:45:00', user: 'Elena Cruz', action: 'Created', table: 'Registry', recordId: 'BAP-2026-00189', details: 'Baptism record: Juan Miguel Santos', ipAddress: '192.168.1.32' },
  { id: 'log-4', timestamp: '2026-05-20T08:30:00', user: 'Fr. Antonio Reyes', action: 'Logged In', table: 'System', recordId: 'SESSION-001', details: 'User login from desktop', ipAddress: '192.168.1.10' },
  { id: 'log-5', timestamp: '2026-05-19T16:20:00', user: 'Maria Santos', action: 'Updated', table: 'Finance', recordId: 'EXP-2026-0015', details: 'Updated expense amount from ₱8,500 to ₱9,200', ipAddress: '192.168.1.45', changes: [{ field: 'amount', oldValue: '8500', newValue: '9200' }] },
  { id: 'log-6', timestamp: '2026-05-19T15:45:00', user: 'Roberto Lim', action: 'Approved', table: 'Finance', recordId: 'EXP-2026-0014', details: 'Approved building repair expense: ₱320,000', ipAddress: '192.168.1.67' },
  { id: 'log-7', timestamp: '2026-05-19T14:30:00', user: 'Elena Cruz', action: 'Created', table: 'Registry', recordId: 'MARR-2026-00042', details: 'Marriage record: Carlos & Maria Reyes', ipAddress: '192.168.1.32' },
  { id: 'log-8', timestamp: '2026-05-19T11:00:00', user: 'Maria Santos', action: 'Created', table: 'Finance', recordId: 'COL-2026-0089', details: 'Recorded Sunday collection: ₱45,600', ipAddress: '192.168.1.45' },
  { id: 'log-9', timestamp: '2026-05-19T10:30:00', user: 'Elena Cruz', action: 'Generated', table: 'Certificates', recordId: 'CERT-2026-0041', details: 'Baptismal certificate for Ana Lim', ipAddress: '192.168.1.32' },
  { id: 'log-10', timestamp: '2026-05-19T09:15:00', user: 'Juan Dela Cruz', action: 'Logged In', table: 'System', recordId: 'SESSION-002', details: 'User login from mobile', ipAddress: '192.168.1.89' },
  { id: 'log-11', timestamp: '2026-05-18T17:00:00', user: 'Fr. Antonio Reyes', action: 'Updated', table: 'Settings', recordId: 'CFG-001', details: 'Changed parish contact number', ipAddress: '192.168.1.10', changes: [{ field: 'contactNumber', oldValue: '+63 45 961 1234', newValue: '+63 45 961 2345' }] },
  { id: 'log-12', timestamp: '2026-05-18T16:30:00', user: 'Elena Cruz', action: 'Created', table: 'Directory', recordId: 'FAM-2026-0156', details: 'New family record: Dela Cruz Family', ipAddress: '192.168.1.32' },
  { id: 'log-13', timestamp: '2026-05-18T14:00:00', user: 'Maria Santos', action: 'Deleted', table: 'Finance', recordId: 'JV-2026-0041', details: 'Deleted duplicate journal entry', ipAddress: '192.168.1.45' },
  { id: 'log-14', timestamp: '2026-05-18T11:30:00', user: 'Roberto Lim', action: 'Viewed', table: 'Finance', recordId: 'BUDG-2026', details: 'Viewed annual budget report', ipAddress: '192.168.1.67' },
  { id: 'log-15', timestamp: '2026-05-17T16:45:00', user: 'Elena Cruz', action: 'Updated', table: 'Registry', recordId: 'BAP-2026-00188', details: 'Corrected sponsor name', ipAddress: '192.168.1.32', changes: [{ field: 'godfather', oldValue: 'Pedro Reyes', newValue: 'Pedro Cruz' }] },
  { id: 'log-16', timestamp: '2026-05-17T14:20:00', user: 'Maria Santos', action: 'Created', table: 'Finance', recordId: 'EXP-2026-0014', details: 'Created expense: Building repair - ₱320,000', ipAddress: '192.168.1.45' },
  { id: 'log-17', timestamp: '2026-05-17T10:00:00', user: 'Fr. Antonio Reyes', action: 'Logged In', table: 'System', recordId: 'SESSION-003', details: 'User login', ipAddress: '192.168.1.10' },
  { id: 'log-18', timestamp: '2026-05-16T15:30:00', user: 'Elena Cruz', action: 'Created', table: 'Calendar', recordId: 'EVT-2026-0234', details: 'Scheduled wedding: Reyes-Lim, June 15', ipAddress: '192.168.1.32' },
  { id: 'log-19', timestamp: '2026-05-16T14:00:00', user: 'Maria Santos', action: 'Exported', table: 'Finance', recordId: 'RPT-2026-001', details: 'Exported monthly collection report (May)', ipAddress: '192.168.1.45' },
  { id: 'log-20', timestamp: '2026-05-16T09:00:00', user: 'Fr. Antonio Reyes', action: 'Updated', table: 'Settings', recordId: 'MASS-001', details: 'Updated Sunday Mass schedule: added 6:00 PM', ipAddress: '192.168.1.10' },
  { id: 'log-21', timestamp: '2026-05-15T17:00:00', user: 'Elena Cruz', action: 'Created', table: 'Registry', recordId: 'CONF-2026-0045', details: 'Confirmation record: 12 candidates from St. Joseph Group', ipAddress: '192.168.1.32' },
  { id: 'log-22', timestamp: '2026-05-15T16:30:00', user: 'Maria Santos', action: 'Created', table: 'Finance', recordId: 'COL-2026-0088', details: 'Sunday collection: ₱52,100', ipAddress: '192.168.1.45' },
  { id: 'log-23', timestamp: '2026-05-15T11:00:00', user: 'Roberto Lim', action: 'Approved', table: 'Finance', recordId: 'EXP-2026-0013', details: 'Approved: Liturgical supplies - ₱18,500', ipAddress: '192.168.1.67' },
  { id: 'log-24', timestamp: '2026-05-15T09:30:00', user: 'Juan Dela Cruz', action: 'Created', table: 'Directory', recordId: 'FAM-2026-0155', details: 'Added parishioner record', ipAddress: '192.168.1.89' },
  { id: 'log-25', timestamp: '2026-05-14T16:00:00', user: 'Fr. Antonio Reyes', action: 'Created', table: 'Settings', recordId: 'USR-004', details: 'Created user: Roberto Lim (Finance Council)', ipAddress: '192.168.1.10' },
  { id: 'log-26', timestamp: '2026-05-14T14:30:00', user: 'Elena Cruz', action: 'Generated', table: 'Certificates', recordId: 'CERT-2026-0040', details: 'Marriage certificate for printing', ipAddress: '192.168.1.32' },
  { id: 'log-27', timestamp: '2026-05-14T11:00:00', user: 'Maria Santos', action: 'Updated', table: 'Finance', recordId: 'BUDG-2026', details: 'Updated Q2 budget allocation', ipAddress: '192.168.1.45', changes: [{ field: 'repairAllocation', oldValue: '300000', newValue: '350000' }] },
  { id: 'log-28', timestamp: '2026-05-14T09:00:00', user: 'Elena Cruz', action: 'Logged In', table: 'System', recordId: 'SESSION-004', details: 'User login from desktop', ipAddress: '192.168.1.32' },
  { id: 'log-29', timestamp: '2026-05-13T17:00:00', user: 'Fr. Antonio Reyes', action: 'Viewed', table: 'Registry', recordId: 'BAP-2026-00180', details: 'Reviewed baptism records for audit', ipAddress: '192.168.1.10' },
  { id: 'log-30', timestamp: '2026-05-13T15:30:00', user: 'Maria Santos', action: 'Created', table: 'Finance', recordId: 'EXP-2026-0013', details: 'Created expense: Liturgical supplies - ₱18,500', ipAddress: '192.168.1.45' },
];

export const actionBadgeColors: Record<string, string> = {
  'Created': 'bg-success/10 text-success',
  'Updated': 'bg-info/10 text-info',
  'Deleted': 'bg-error/10 text-error',
  'Approved': 'bg-warning/10 text-warning',
  'Logged In': 'bg-purple/10 text-purple',
  'Logged Out': 'bg-warm-gray/10 text-warm-gray',
  'Exported': 'bg-warm-gray/10 text-warm-gray',
  'Generated': 'bg-info/10 text-info',
  'Viewed': 'bg-warm-gray/10 text-warm-gray',
};
