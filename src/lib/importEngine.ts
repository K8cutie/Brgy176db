// ============================================
// ChurchOS PIMS Legacy Data Import Engine
// Imports data from PIMS (FoxPro/DBF), CSV, Excel files
// ============================================

import type {
  BaptismRecord, MarriageRecord, ConfirmationRecord, DeathRecord,
} from './registryData';
import type { Family } from './directoryData';
import type { CalendarEvent } from './calendarData';
import type { JournalEntry, Collection } from './financeData';

// ── Import Types ──

export type ImportTarget = 'registry' | 'directory' | 'calendar' | 'finance';
export type ImportFileType = 'dbf' | 'csv' | 'xlsx' | 'json';

export interface ImportField {
  sourceName: string;      // Original column name from legacy file
  sourceLabel: string;     // Human-readable label
  suggestedTarget: string; // Suggested ChurchOS field
  confidence: number;      // 0-1 match confidence
  sampleValue: string;     // Example value from data
  dataType: 'text' | 'number' | 'date' | 'boolean';
  encodingIssue?: string;  // e.g., "CP437 encoding detected"
}

export interface ImportMapping {
  sourceField: string;
  targetField: string;
  targetModule: ImportTarget;
  transform?: 'none' | 'date_fix' | 'name_split' | 'encoding_fix' | 'amount_clean';
}

export interface ImportRow {
  sourceData: Record<string, string>;
  mappedData: Record<string, any>;
  errors: ImportValidationError[];
  warnings: ImportValidationWarning[];
  status: 'valid' | 'error' | 'warning';
}

export interface ImportValidationError {
  field: string;
  message: string;
  code: 'required' | 'invalid_date' | 'invalid_number' | 'duplicate' | 'encoding' | 'unknown_value';
}

export interface ImportValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface ImportResult {
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errors: ImportValidationError[];
  createdRecords: any[];
  importTime: string;
  fileName: string;
  targetModule: ImportTarget;
}

export interface ImportHistoryEntry {
  id: string;
  date: string;
  fileName: string;
  fileType: ImportFileType;
  targetModule: ImportTarget;
  totalRows: number;
  importedRows: number;
  errors: number;
  importedBy: string;
  status: 'completed' | 'partial' | 'failed';
  mappings: ImportMapping[];
}

// ── Field Mapping Definitions ──

export const REGISTRY_FIELD_MAP: Record<string, { target: string; label: string; confidence: number }> = {
  // Baptism fields (PIMS naming)
  'CHILDNAME': { target: 'childFirstName', label: "Child's Name", confidence: 0.9 },
  'CHILD_NAME': { target: 'childFirstName', label: "Child's Name", confidence: 0.9 },
  'BABYNAME': { target: 'childFirstName', label: "Child's Name", confidence: 0.85 },
  'CHILDLNAME': { target: 'childLastName', label: "Child's Last Name", confidence: 0.85 },
  'CHILDLAST': { target: 'childLastName', label: "Child's Last Name", confidence: 0.85 },
  'FATHER': { target: 'fatherFirstName', label: "Father's Name", confidence: 0.9 },
  'FATHERNAME': { target: 'fatherFirstName', label: "Father's Name", confidence: 0.9 },
  'FATHERS_NAME': { target: 'fatherFirstName', label: "Father's Name", confidence: 0.9 },
  'MOTHER': { target: 'motherFirstName', label: "Mother's Name", confidence: 0.9 },
  'MOTHERNAME': { target: 'motherFirstName', label: "Mother's Name", confidence: 0.9 },
  'MOTHERS_NAME': { target: 'motherFirstName', label: "Mother's Name", confidence: 0.9 },
  'GODFATHER': { target: 'godfatherFirstName', label: 'Godfather', confidence: 0.95 },
  'GODFATHERNAME': { target: 'godfatherFirstName', label: 'Godfather', confidence: 0.9 },
  'GODMOTHER': { target: 'godmotherFirstName', label: 'Godmother', confidence: 0.95 },
  'GODMOTHERNAME': { target: 'godmotherFirstName', label: 'Godmother', confidence: 0.9 },
  'NINONG': { target: 'godfatherFirstName', label: 'Godfather (Ninong)', confidence: 0.8 },
  'NINANG': { target: 'godmotherFirstName', label: 'Godmother (Ninang)', confidence: 0.8 },
  'DATEBAPT': { target: 'dateOfBaptism', label: 'Date of Baptism', confidence: 0.95 },
  'BAPT_DATE': { target: 'dateOfBaptism', label: 'Date of Baptism', confidence: 0.95 },
  'DATE_BAPTISM': { target: 'dateOfBaptism', label: 'Date of Baptism', confidence: 0.95 },
  'BIRTHDATE': { target: 'dateOfBirth', label: 'Date of Birth', confidence: 0.9 },
  'BIRTH_DATE': { target: 'dateOfBirth', label: 'Date of Birth', confidence: 0.9 },
  'BOOKNO': { target: 'bookNumber', label: 'Book Number', confidence: 0.95 },
  'BOOK_NO': { target: 'bookNumber', label: 'Book Number', confidence: 0.95 },
  'BOOK': { target: 'bookNumber', label: 'Book Number', confidence: 0.8 },
  'PAGENO': { target: 'pageNumber', label: 'Page Number', confidence: 0.95 },
  'PAGE_NO': { target: 'pageNumber', label: 'Page Number', confidence: 0.95 },
  'PAGE': { target: 'pageNumber', label: 'Page Number', confidence: 0.8 },
  'REGNO': { target: 'registryNumber', label: 'Registry Number', confidence: 0.9 },
  'REG_NO': { target: 'registryNumber', label: 'Registry Number', confidence: 0.9 },
  'OFFICIANT': { target: 'officiant', label: 'Officiating Priest', confidence: 0.95 },
  'PRIEST': { target: 'officiant', label: 'Officiating Priest', confidence: 0.85 },
  'REMARKS': { target: 'notations', label: 'Notations/Remarks', confidence: 0.75 },
  'NOTES': { target: 'notations', label: 'Notations/Remarks', confidence: 0.7 },
  'SEX': { target: 'gender', label: 'Gender', confidence: 0.8 },
  'GENDER': { target: 'gender', label: 'Gender', confidence: 0.9 },
  // Marriage fields
  'GROOMNAME': { target: 'groomFirstName', label: "Groom's Name", confidence: 0.9 },
  'GROOM': { target: 'groomFirstName', label: "Groom's Name", confidence: 0.85 },
  'BRIDENAME': { target: 'brideFirstName', label: "Bride's Name", confidence: 0.9 },
  'BRIDE': { target: 'brideFirstName', label: "Bride's Name", confidence: 0.85 },
  'WITNESS1': { target: 'witness1Name', label: 'Witness 1', confidence: 0.9 },
  'WIT1': { target: 'witness1Name', label: 'Witness 1', confidence: 0.8 },
  'WITNESS2': { target: 'witness2Name', label: 'Witness 2', confidence: 0.9 },
  'WIT2': { target: 'witness2Name', label: 'Witness 2', confidence: 0.8 },
  'DATEMARR': { target: 'dateOfMarriage', label: 'Date of Marriage', confidence: 0.95 },
  'MARR_DATE': { target: 'dateOfMarriage', label: 'Date of Marriage', confidence: 0.95 },
  // Confirmation fields
  'CONFNAME': { target: 'confirmandFirstName', label: "Confirmand's Name", confidence: 0.9 },
  'CONFIRMAND': { target: 'confirmandFirstName', label: "Confirmand's Name", confidence: 0.85 },
  'CONF_DATE': { target: 'dateOfConfirmation', label: 'Date of Confirmation', confidence: 0.95 },
  'BISHOP': { target: 'bishop', label: 'Confirming Bishop', confidence: 0.9 },
  'SPONSOR': { target: 'sponsorName', label: 'Sponsor', confidence: 0.85 },
  // Death fields
  'DECEASED': { target: 'deceasedFirstName', label: "Deceased's Name", confidence: 0.9 },
  'DECEASEDNAME': { target: 'deceasedFirstName', label: "Deceased's Name", confidence: 0.9 },
  'DEATHDATE': { target: 'dateOfDeath', label: 'Date of Death', confidence: 0.95 },
  'BURIALDATE': { target: 'dateOfBurial', label: 'Date of Burial', confidence: 0.9 },
  'CEMETERY': { target: 'cemetery', label: 'Cemetery', confidence: 0.9 },
};

export const DIRECTORY_FIELD_MAP: Record<string, { target: string; label: string; confidence: number }> = {
  'FAMILYNAME': { target: 'familyName', label: 'Family Name', confidence: 0.95 },
  'FAMILY_NAME': { target: 'familyName', label: 'Family Name', confidence: 0.95 },
  'LASTNAME': { target: 'headLastName', label: 'Head Last Name', confidence: 0.85 },
  'HEAD': { target: 'headFirstName', label: 'Head of Family', confidence: 0.9 },
  'HEADNAME': { target: 'headFirstName', label: 'Head of Family', confidence: 0.9 },
  'SPOUSE': { target: 'spouseFirstName', label: 'Spouse', confidence: 0.85 },
  'ADDRESS': { target: 'address', label: 'Address', confidence: 0.9 },
  'BARANGAY': { target: 'addressBarangay', label: 'Barangay', confidence: 0.9 },
  'SITIO': { target: 'addressSitio', label: 'Sitio', confidence: 0.8 },
  'CITY': { target: 'addressCity', label: 'City', confidence: 0.9 },
  'PHONE': { target: 'contactNumber', label: 'Phone Number', confidence: 0.9 },
  'CONTACT': { target: 'contactNumber', label: 'Contact', confidence: 0.85 },
  'EMAIL': { target: 'email', label: 'Email', confidence: 0.9 },
  'MEMBERS': { target: 'memberCount', label: 'Number of Members', confidence: 0.75 },
};

export const FINANCE_FIELD_MAP: Record<string, { target: string; label: string; confidence: number }> = {
  'DATE': { target: 'date', label: 'Date', confidence: 0.95 },
  'TRANS_DATE': { target: 'date', label: 'Transaction Date', confidence: 0.95 },
  'DESCRIPTION': { target: 'description', label: 'Description', confidence: 0.9 },
  'PARTICULARS': { target: 'description', label: 'Particulars', confidence: 0.85 },
  'ACCOUNT': { target: 'accountName', label: 'Account', confidence: 0.85 },
  'ACCTNAME': { target: 'accountName', label: 'Account Name', confidence: 0.9 },
  'DEBIT': { target: 'debit', label: 'Debit', confidence: 0.95 },
  'DR': { target: 'debit', label: 'Debit', confidence: 0.9 },
  'CREDIT': { target: 'credit', label: 'Credit', confidence: 0.95 },
  'CR': { target: 'credit', label: 'Credit', confidence: 0.9 },
  'AMOUNT': { target: 'amount', label: 'Amount', confidence: 0.8 },
  'REFERENCE': { target: 'reference', label: 'Reference #', confidence: 0.85 },
  'REFNO': { target: 'reference', label: 'Reference #', confidence: 0.9 },
  'POSTEDBY': { target: 'postedBy', label: 'Posted By', confidence: 0.85 },
  'TYPE': { target: 'type', label: 'Entry Type', confidence: 0.75 },
};

// ── ChurchOS Target Fields ──

export const CHURCHOS_REGISTRY_FIELDS = [
  { key: 'childLastName', label: "Child's Last Name", required: true, module: 'registry' as ImportTarget },
  { key: 'childFirstName', label: "Child's First Name", required: true, module: 'registry' as ImportTarget },
  { key: 'childMiddleName', label: "Child's Middle Name", required: false, module: 'registry' as ImportTarget },
  { key: 'dateOfBirth', label: 'Date of Birth', required: true, module: 'registry' as ImportTarget },
  { key: 'dateOfBaptism', label: 'Date of Baptism', required: true, module: 'registry' as ImportTarget },
  { key: 'fatherLastName', label: "Father's Last Name", required: true, module: 'registry' as ImportTarget },
  { key: 'fatherFirstName', label: "Father's First Name", required: true, module: 'registry' as ImportTarget },
  { key: 'motherLastName', label: "Mother's Last Name", required: true, module: 'registry' as ImportTarget },
  { key: 'motherFirstName', label: "Mother's First Name", required: true, module: 'registry' as ImportTarget },
  { key: 'godfatherFirstName', label: 'Godfather', required: false, module: 'registry' as ImportTarget },
  { key: 'godmotherFirstName', label: 'Godmother', required: false, module: 'registry' as ImportTarget },
  { key: 'officiant', label: 'Officiating Priest', required: true, module: 'registry' as ImportTarget },
  { key: 'bookNumber', label: 'Book Number', required: true, module: 'registry' as ImportTarget },
  { key: 'pageNumber', label: 'Page Number', required: true, module: 'registry' as ImportTarget },
  { key: 'registryNumber', label: 'Registry Number', required: true, module: 'registry' as ImportTarget },
  { key: 'notations', label: 'Notations', required: false, module: 'registry' as ImportTarget },
  { key: 'gender', label: 'Gender', required: false, module: 'registry' as ImportTarget },
];

export const CHURCHOS_DIRECTORY_FIELDS = [
  { key: 'familyName', label: 'Family Name', required: true, module: 'directory' as ImportTarget },
  { key: 'headFirstName', label: 'Head of Family', required: true, module: 'directory' as ImportTarget },
  { key: 'spouseFirstName', label: 'Spouse', required: false, module: 'directory' as ImportTarget },
  { key: 'address', label: 'Address', required: false, module: 'directory' as ImportTarget },
  { key: 'addressBarangay', label: 'Barangay', required: false, module: 'directory' as ImportTarget },
  { key: 'contactNumber', label: 'Contact Number', required: false, module: 'directory' as ImportTarget },
];

export const CHURCHOS_FINANCE_FIELDS = [
  { key: 'date', label: 'Date', required: true, module: 'finance' as ImportTarget },
  { key: 'description', label: 'Description', required: true, module: 'finance' as ImportTarget },
  { key: 'accountName', label: 'Account', required: true, module: 'finance' as ImportTarget },
  { key: 'debit', label: 'Debit', required: true, module: 'finance' as ImportTarget },
  { key: 'credit', label: 'Credit', required: true, module: 'finance' as ImportTarget },
  { key: 'reference', label: 'Reference #', required: false, module: 'finance' as ImportTarget },
  { key: 'postedBy', label: 'Posted By', required: false, module: 'finance' as ImportTarget },
];

// ── Sample Legacy Data (simulates PIMS DBF export) ──

export interface SampleLegacyFile {
  name: string;
  type: ImportFileType;
  targetModule: ImportTarget;
  recordCount: number;
  columns: { name: string; sample: string }[];
  rows: Record<string, string>[];
  issues: string[];
}

export const SAMPLE_BAPTISM_DBF: SampleLegacyFile = {
  name: 'BAPTISMS.DBF',
  type: 'dbf',
  targetModule: 'registry',
  recordCount: 15,
  columns: [
    { name: 'REGNO', sample: 'B-2015-0042' },
    { name: 'CHILDNAME', sample: 'MARIA CLARA SANTOS' },
    { name: 'SEX', sample: 'F' },
    { name: 'BIRTHDATE', sample: '15/03/2015' },
    { name: 'DATEBAPT', sample: '25/05/2015' },
    { name: 'FATHER', sample: 'JUAN DELA CRUZ SANTOS' },
    { name: 'MOTHER', sample: 'ELENA REYES SANTOS' },
    { name: 'GODFATHER', sample: 'PEDRO LIM' },
    { name: 'GODMOTHER', sample: 'ANA BAUTISTA' },
    { name: 'BOOKNO', sample: '2' },
    { name: 'PAGENO', sample: '156' },
    { name: 'OFFICIANT', sample: 'FR. ANTONIO REYES' },
    { name: 'REMARKS', sample: '' },
  ],
  rows: [
    { REGNO: 'B-2015-0042', CHILDNAME: 'MARIA CLARA SANTOS', SEX: 'F', BIRTHDATE: '15/03/2015', DATEBAPT: '25/05/2015', FATHER: 'JUAN DELA CRUZ SANTOS', MOTHER: 'ELENA REYES SANTOS', GODFATHER: 'PEDRO LIM', GODMOTHER: 'ANA BAUTISTA', BOOKNO: '2', PAGENO: '156', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: 'B-2015-0043', CHILDNAME: 'JOSE MIGUEL REYES', SEX: 'M', BIRTHDATE: '02/07/2015', DATEBAPT: '16/08/2015', FATHER: 'ROBERTO REYES', MOTHER: 'SOFIA CRUZ REYES', GODFATHER: 'CARLOS MENDOZA', GODMOTHER: 'LOURDES FLORES', BOOKNO: '2', PAGENO: '157', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: 'B-2015-0044', CHILDNAME: 'ANGELICA FLORES', SEX: 'F', BIRTHDATE: '28/11/2014', DATEBAPT: '18/01/2015', FATHER: 'MIGUEL FLORES', MOTHER: 'TERESA LIM FLORES', GODFATHER: 'RAFAEL AQUINO', GODMOTHER: 'CRISTINA BAUTISTA', BOOKNO: '2', PAGENO: '158', OFFICIANT: 'FR. MIGUEL SANTOS', REMARKS: 'CONDITION: SANATE' },
    { REGNO: 'B-2016-0045', CHILDNAME: 'GABRIEL DELA CRUZ', SEX: 'M', BIRTHDATE: '10/01/2016', DATEBAPT: '14/02/2016', FATHER: 'PEDRO DELA CRUZ', MOTHER: 'MARIA BAUTISTA DELA CRUZ', GODFATHER: 'JUAN REYES', GODMOTHER: 'ELENA CRUZ', BOOKNO: '2', PAGENO: '159', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: 'B-2016-0046', CHILDNAME: 'SOPHIA MARIE LIM', SEX: 'F', BIRTHDATE: '22/04/2016', DATEBAPT: '12/06/2016', FATHER: 'RICHARD LIM', MOTHER: 'JENNIFER TAN LIM', GODFATHER: 'WILLIAM CHEN', GODMOTHER: 'LINDA ONG', BOOKNO: '2', PAGENO: '160', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: 'B-2017-0047', CHILDNAME: 'MATTHEW JAMES GARCIA', SEX: 'M', BIRTHDATE: '05/09/2016', DATEBAPT: '19/11/2016', FATHER: 'DAVID GARCIA', MOTHER: 'SARAH REYES GARCIA', GODFATHER: 'MICHAEL TORRES', GODMOTHER: 'RACHEL ANG', BOOKNO: '3', PAGENO: '1', OFFICIANT: 'FR. MIGUEL SANTOS', REMARKS: '' },
    { REGNO: 'B-2017-0048', CHILDNAME: 'ISABELLA ROSE TORRES', SEX: 'F', BIRTHDATE: '18/12/2016', DATEBAPT: '19/02/2017', FATHER: 'ANDRES TORRES', MOTHER: 'CAMILLE SANTOS TORRES', GODFATHER: 'JOSE BAUTISTA', GODMOTHER: 'PATRICIA LIM', BOOKNO: '3', PAGENO: '2', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: 'B-2018-0049', CHILDNAME: 'DANIEL FRANCISCO AQUINO', SEX: 'M', BIRTHDATE: '30/03/2018', DATEBAPT: '13/05/2018', FATHER: 'FRANCISCO AQUINO', MOTHER: 'BEATRIZ REYES AQUINO', GODFATHER: 'EDUARDO LIM', GODMOTHER: 'MARGARITA CRUZ', BOOKNO: '3', PAGENO: '3', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: 'B-2018-0050', CHILDNAME: 'EMMA GRACE BAUTISTA', SEX: 'F', BIRTHDATE: '14/06/2018', DATEBAPT: '19/08/2018', FATHER: 'PAULO BAUTISTA', MOTHER: 'DIANA LIM BAUTISTA', GODFATHER: 'GABRIEL SANTOS', GODMOTHER: 'ANGELICA REYES', BOOKNO: '3', PAGENO: '4', OFFICIANT: 'FR. MIGUEL SANTOS', REMARKS: '' },
    { REGNO: 'B-2019-0051', CHILDNAME: 'LUCAS ALEXANDER CRUZ', SEX: 'M', BIRTHDATE: '08/09/2018', DATEBAPT: '18/11/2018', FATHER: 'ALEXANDER CRUZ', MOTHER: 'NATALIE FLORES CRUZ', GODFATHER: 'STEPHEN LIM', GODMOTHER: 'MARIA TERESA', BOOKNO: '3', PAGENO: '5', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: 'B-2020-0052', CHILDNAME: 'OLIVIA MAY SANTOS', SEX: 'F', BIRTHDATE: '20/01/2020', DATEBAPT: '23/02/2020', FATHER: 'MAYOR SANTOS', MOTHER: 'LIGAYA REYES SANTOS', GODFATHER: 'HONORIO LIM', GODMOTHER: 'CONCEPCION BAUTISTA', BOOKNO: '3', PAGENO: '6', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: 'B-2020-0053', CHILDNAME: 'ETHAN JAMES DELA CRUZ', SEX: 'M', BIRTHDATE: '05/04/2020', DATEBAPT: '17/05/2020', FATHER: 'JAMES DELA CRUZ', MOTHER: 'KRISTINE LIM DELA CRUZ', GODFATHER: 'PATRICK REYES', GODMOTHER: 'SANDRA FLORES', BOOKNO: '3', PAGENO: '7', OFFICIANT: 'FR. MIGUEL SANTOS', REMARKS: 'PANDEMIC — PRIVATE CEREMONY' },
    { REGNO: 'B-2021-0054', CHILDNAME: 'AVA MARIE REYES', SEX: 'F', BIRTHDATE: '12/07/2021', DATEBAPT: '22/08/2021', FATHER: 'MARCO REYES', MOTHER: 'JULIA SANTOS REYES', GODFATHER: 'ANTONIO LIM', GODMOTHER: 'ROSARIO CRUZ', BOOKNO: '3', PAGENO: '8', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: 'B-2022-0055', CHILDNAME: 'NOAH GABRIEL LIM', SEX: 'M', BIRTHDATE: '03/10/2021', DATEBAPT: '21/11/2022', FATHER: 'GABRIEL LIM', MOTHER: 'MICHELLE TAN LIM', GODFATHER: 'ROBERT CHEN', GODMOTHER: 'CATHERINE ONG', BOOKNO: '3', PAGENO: '9', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: 'DELAYED DUE TO PANDEMIC' },
    { REGNO: 'B-2023-0056', CHILDNAME: 'MIA ELIZABETH FLORES', SEX: 'F', BIRTHDATE: '25/12/2022', DATEBAPT: '19/02/2023', FATHER: 'ELIZABETH FLORES', MOTHER: 'CHRISTINE REYES FLORES', GODFATHER: 'ALBERTO SANTOS', GODMOTHER: 'TERESITA LIM', BOOKNO: '3', PAGENO: '10', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
  ],
  issues: [
    'CP437 encoding detected in CHILDNAME field (special characters may appear garbled)',
    'Date format DD/MM/YYYY detected — will be converted to ISO format',
    'Full names in single field — will be split into First/Last/Middle',
    '2 rows have notations requiring review',
  ],
};

export const SAMPLE_MARRIAGE_DBF: SampleLegacyFile = {
  name: 'MARRIAGES.DBF',
  type: 'dbf',
  targetModule: 'registry',
  recordCount: 8,
  columns: [
    { name: 'REGNO', sample: 'M-2018-0012' },
    { name: 'GROOMNAME', sample: 'CARLOS MENDOZA BAUTISTA' },
    { name: 'BRIDENAME', sample: 'ANA MARIE REYES LIM' },
    { name: 'DATEMARR', sample: '15/06/2018' },
    { name: 'WITNESS1', sample: 'PEDRO SANTOS' },
    { name: 'WITNESS2', sample: 'LOURDES FLORES' },
    { name: 'BOOKNO', sample: '1' },
    { name: 'PAGENO', sample: '45' },
    { name: 'OFFICIANT', sample: 'FR. ANTONIO REYES' },
    { name: 'REMARKS', sample: '' },
  ],
  rows: [
    { REGNO: 'M-2018-0012', GROOMNAME: 'CARLOS MENDOZA BAUTISTA', BRIDENAME: 'ANA MARIE REYES LIM', DATEMARR: '15/06/2018', WITNESS1: 'PEDRO SANTOS', WITNESS2: 'LOURDES FLORES', BOOKNO: '1', PAGENO: '45', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: 'M-2019-0013', GROOMNAME: 'JOSE REYES SANTOS', BRIDENAME: 'MARIA CLARA LIM FLORES', DATEMARR: '22/09/2019', WITNESS1: 'FRANCISCO AQUINO', WITNESS2: 'BEATRIZ CRUZ', BOOKNO: '1', PAGENO: '46', OFFICIANT: 'FR. MIGUEL SANTOS', REMARKS: '' },
    { REGNO: '2020-0014', GROOMNAME: 'PEDRO DELA CRUZ LIM', BRIDENAME: 'SOFIA GRACE REYES', DATEMARR: '14/02/2020', WITNESS1: 'JUAN BAUTISTA', WITNESS2: 'ELENA SANTOS', BOOKNO: '1', PAGENO: '47', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: 'CIVIL MARRIAGE 2019' },
    { REGNO: '2021-0015', GROOMNAME: 'RAFAEL AQUINO TORRES', BRIDENAME: 'ISABELLA MARIE FLORES', DATEMARR: '08/05/2021', WITNESS1: 'DAVID GARCIA', WITNESS2: 'SARAH REYES', BOOKNO: '1', PAGENO: '48', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: '2022-0016', GROOMNAME: 'GABRIEL SANTOS LIM', BRIDENAME: 'EMMA ROSE CRUZ', DATEMARR: '18/06/2022', WITNESS1: 'ANDRES TORRES', WITNESS2: 'CAMILLE BAUTISTA', BOOKNO: '1', PAGENO: '49', OFFICIANT: 'FR. MIGUEL SANTOS', REMARKS: '' },
    { REGNO: '2023-0017', GROOMNAME: 'MIGUEL FLORES REYES', BRIDENAME: 'AVA GRACE SANTOS', DATEMARR: '16/09/2023', WITNESS1: 'ALEXANDER CRUZ', WITNESS2: 'NATALIE LIM', BOOKNO: '1', PAGENO: '50', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: '2024-0018', GROOMNAME: 'LUCAS JAMES BAUTISTA', BRIDENAME: 'OLIVIA MARIE LIM', DATEMARR: '15/02/2024', WITNESS1: 'MARCO REYES', WITNESS2: 'JULIA SANTOS', BOOKNO: '1', PAGENO: '51', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: '' },
    { REGNO: '2025-0019', GROOMNAME: 'ETHAN DELA CRUZ TORRES', BRIDENAME: 'SOPHIA ANNE FLORES', DATEMARR: '21/06/2025', WITNESS1: 'GABRIEL LIM', WITNESS2: 'MICHELLE TAN', BOOKNO: '1', PAGENO: '52', OFFICIANT: 'FR. ANTONIO REYES', REMARKS: 'PARENTAL CONSENT — BRIDE AGE 20' },
  ],
  issues: [
    'Inconsistent REGNO format (some missing "M-" prefix)',
    'Full names in single fields — will be auto-split',
    'Date format DD/MM/YYYY — converting to ISO',
  ],
};

export const SAMPLE_FINANCE_CSV: SampleLegacyFile = {
  name: 'COLLECTIONS_2024.CSV',
  type: 'csv',
  targetModule: 'finance',
  recordCount: 12,
  columns: [
    { name: 'DATE', sample: '07/01/2024' },
    { name: 'MASS_TIME', sample: '8:00 AM' },
    { name: 'CASH', sample: '32450.00' },
    { name: 'CHECKS', sample: '8200.00' },
    { name: 'GCASH', sample: '5030.00' },
    { name: 'TOTAL', sample: '45680.00' },
    { name: 'COUNTED_BY', sample: 'MARIA SANTOS' },
  ],
  rows: [
    { DATE: '07/01/2024', MASS_TIME: '6:00 AM', CASH: '18450.00', CHECKS: '3200.00', GCASH: '2100.00', TOTAL: '23750.00', COUNTED_BY: 'MARIA SANTOS' },
    { DATE: '07/01/2024', MASS_TIME: '8:00 AM', CASH: '32450.00', CHECKS: '8200.00', GCASH: '5030.00', TOTAL: '45680.00', COUNTED_BY: 'ELENA CRUZ' },
    { DATE: '07/01/2024', MASS_TIME: '10:00 AM', CASH: '28900.00', CHECKS: '5600.00', GCASH: '4300.00', TOTAL: '38800.00', COUNTED_BY: 'MARIA SANTOS' },
    { DATE: '07/01/2024', MASS_TIME: '6:00 PM', CASH: '22100.00', CHECKS: '4100.00', GCASH: '3800.00', TOTAL: '30000.00', COUNTED_BY: 'ROBERTO LIM' },
    { DATE: '14/01/2024', MASS_TIME: '6:00 AM', CASH: '19200.00', CHECKS: '2800.00', GCASH: '1950.00', TOTAL: '23950.00', COUNTED_BY: 'MARIA SANTOS' },
    { DATE: '14/01/2024', MASS_TIME: '8:00 AM', CASH: '30100.00', CHECKS: '7400.00', GCASH: '5200.00', TOTAL: '42700.00', COUNTED_BY: 'ELENA CRUZ' },
    { DATE: '14/01/2024', MASS_TIME: '10:00 AM', CASH: '27500.00', CHECKS: '4800.00', GCASH: '3600.00', TOTAL: '35900.00', COUNTED_BY: 'MARIA SANTOS' },
    { DATE: '14/01/2024', MASS_TIME: '6:00 PM', CASH: '19800.00', CHECKS: '3500.00', GCASH: '2900.00', TOTAL: '26200.00', COUNTED_BY: 'ROBERTO LIM' },
    { DATE: '21/01/2024', MASS_TIME: '6:00 AM', CASH: '17500.00', CHECKS: '3100.00', GCASH: '2200.00', TOTAL: '22800.00', COUNTED_BY: 'ELENA CRUZ' },
    { DATE: '21/01/2024', MASS_TIME: '8:00 AM', CASH: '31500.00', CHECKS: '6900.00', GCASH: '4800.00', TOTAL: '43200.00', COUNTED_BY: 'MARIA SANTOS' },
    { DATE: '21/01/2024', MASS_TIME: '10:00 AM', CASH: '26800.00', CHECKS: '5200.00', GCASH: '4100.00', TOTAL: '36100.00', COUNTED_BY: 'ELENA CRUZ' },
    { DATE: '21/01/2024', MASS_TIME: '6:00 PM', CASH: '20500.00', CHECKS: '3800.00', GCASH: '3100.00', TOTAL: '27400.00', COUNTED_BY: 'ROBERTO LIM' },
  ],
  issues: [
    'Date format DD/MM/YYYY — converting to ISO',
    'Numeric fields have decimal places — will be preserved',
    'MASS_TIME values will be standardized',
  ],
};

export const ALL_SAMPLE_FILES: SampleLegacyFile[] = [
  SAMPLE_BAPTISM_DBF,
  SAMPLE_MARRIAGE_DBF,
  SAMPLE_FINANCE_CSV,
];

// ── Auto-detect target module from filename ──

export function detectTargetModule(fileName: string): ImportTarget {
  const lower = fileName.toLowerCase();
  if (lower.includes('bapt') || lower.includes('marr') || lower.includes('conf') || lower.includes('death') || lower.includes('burial')) return 'registry';
  if (lower.includes('family') || lower.includes('parishion') || lower.includes('member')) return 'directory';
  if (lower.includes('collect') || lower.includes('journal') || lower.includes('ledger') || lower.includes('account') || lower.includes('expense') || lower.includes('income')) return 'finance';
  if (lower.includes('event') || lower.includes('calendar') || lower.includes('schedule') || lower.includes('mass')) return 'calendar';
  return 'registry'; // default
}

// ── Detect file type from extension ──

export function detectFileType(fileName: string): ImportFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.dbf')) return 'dbf';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (lower.endsWith('.json')) return 'json';
  return 'csv';
}

// ── Auto-map fields ──

export function autoMapFields(
  sourceColumns: string[],
  targetModule: ImportTarget
): ImportMapping[] {
  const fieldMap = targetModule === 'registry' ? REGISTRY_FIELD_MAP
    : targetModule === 'directory' ? DIRECTORY_FIELD_MAP
    : FINANCE_FIELD_MAP;

  const mappings: ImportMapping[] = [];

  for (const col of sourceColumns) {
    const upper = col.toUpperCase().trim();
    const match = fieldMap[upper];
    if (match) {
      let transform: ImportMapping['transform'] = 'none';
      if (match.target.includes('date')) transform = 'date_fix';
      if (match.target.includes('Name') && !match.target.includes('First') && !match.target.includes('Last')) transform = 'name_split';
      if (match.confidence < 0.8) transform = 'encoding_fix';

      mappings.push({
        sourceField: col,
        targetField: match.target,
        targetModule,
        transform,
      });
    }
  }

  return mappings;
}

// ── Validation ──

export function validateImportRow(
  row: Record<string, string>,
  mappings: ImportMapping[]
): { errors: ImportValidationError[]; warnings: ImportValidationWarning[] } {
  const errors: ImportValidationError[] = [];
  const warnings: ImportValidationWarning[] = [];

  for (const mapping of mappings) {
    const value = row[mapping.sourceField]?.trim() || '';

    // Check required fields
    const isRequired = CHURCHOS_REGISTRY_FIELDS.some(f => f.key === mapping.targetField && f.required)
      || CHURCHOS_DIRECTORY_FIELDS.some(f => f.key === mapping.targetField && f.required)
      || CHURCHOS_FINANCE_FIELDS.some(f => f.key === mapping.targetField && f.required);

    if (isRequired && !value) {
      errors.push({
        field: mapping.sourceField,
        message: `${mapping.targetField} is required but empty`,
        code: 'required',
      });
    }

    // Date validation
    if (mapping.targetField.includes('date') && value) {
      const datePatterns = [
        /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
        /^\d{4}-\d{2}-\d{2}$/,    // YYYY-MM-DD
        /^\d{2}-\d{2}-\d{4}$/,    // DD-MM-YYYY
        /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // flexible
      ];
      const isValidDate = datePatterns.some(p => p.test(value));
      if (!isValidDate) {
        errors.push({
          field: mapping.sourceField,
          message: `Invalid date format: "${value}". Expected DD/MM/YYYY or YYYY-MM-DD.`,
          code: 'invalid_date',
        });
      } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(value)) {
        warnings.push({
          field: mapping.sourceField,
          message: `Two-digit year detected: "${value}". Assuming 20th century.`,
          suggestion: 'Verify the year is correct.',
        });
      }
    }

    // Numeric validation
    if ((mapping.targetField.includes('Number') || mapping.targetField === 'debit' || mapping.targetField === 'credit') && value) {
      const num = parseFloat(value.replace(/,/g, ''));
      if (isNaN(num)) {
        errors.push({
          field: mapping.sourceField,
          message: `Invalid number: "${value}"`,
          code: 'invalid_number',
        });
      }
    }

    // Encoding warning
    if (/[\x80-\xFF]/.test(value)) {
      warnings.push({
        field: mapping.sourceField,
        message: `Possible encoding issue in "${value}" — special characters may need fixing.`,
        suggestion: 'Check for accented characters or special symbols.',
      });
    }
  }

  return { errors, warnings };
}

// ── Name splitting utility ──

export function splitFullName(fullName: string): { firstName: string; middleName?: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  // 3+ parts: first + middle(s) + last
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

// ── Date conversion ──

export function convertDate(dateStr: string): string | null {
  if (!dateStr) return null;
  // Try DD/MM/YYYY
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Try MM/DD/YYYY
  const mmddyyyy = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mmddyyyy) {
    const [, m, d, y] = mmddyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return null;
}

// ── Import History ──

const IMPORT_HISTORY_KEY = 'churchos_import_history';

export function getImportHistory(): ImportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(IMPORT_HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function addImportHistory(entry: ImportHistoryEntry) {
  const history = getImportHistory();
  history.unshift(entry);
  localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 50))); // Keep last 50
}

export function clearImportHistory() {
  localStorage.removeItem(IMPORT_HISTORY_KEY);
}
