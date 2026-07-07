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
import { getLeafAccounts } from './financeData';
import * as nsStore from './storageNamespaced';

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
  duplicateRows?: number;
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
  duplicatesSkipped?: number;
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
  // Marriage record fields (the auto-mapper produces these targets for
  // MARRIAGES.DBF-style files — they must exist here or the mapping dropdown
  // cannot display/select them).
  { key: 'groomFirstName', label: "Groom's Name", required: false, module: 'registry' as ImportTarget },
  { key: 'groomLastName', label: "Groom's Last Name", required: false, module: 'registry' as ImportTarget },
  { key: 'brideFirstName', label: "Bride's Name", required: false, module: 'registry' as ImportTarget },
  { key: 'brideLastName', label: "Bride's Last Name", required: false, module: 'registry' as ImportTarget },
  { key: 'dateOfMarriage', label: 'Date of Marriage', required: false, module: 'registry' as ImportTarget },
  { key: 'witness1Name', label: 'Witness 1', required: false, module: 'registry' as ImportTarget },
  { key: 'witness2Name', label: 'Witness 2', required: false, module: 'registry' as ImportTarget },
  // Confirmation record fields
  { key: 'confirmandFirstName', label: "Confirmand's Name", required: false, module: 'registry' as ImportTarget },
  { key: 'confirmandLastName', label: "Confirmand's Last Name", required: false, module: 'registry' as ImportTarget },
  { key: 'dateOfConfirmation', label: 'Date of Confirmation', required: false, module: 'registry' as ImportTarget },
  { key: 'bishop', label: 'Confirming Bishop', required: false, module: 'registry' as ImportTarget },
  { key: 'sponsorName', label: 'Sponsor', required: false, module: 'registry' as ImportTarget },
  // Death record fields
  { key: 'deceasedFirstName', label: "Deceased's Name", required: false, module: 'registry' as ImportTarget },
  { key: 'deceasedLastName', label: "Deceased's Last Name", required: false, module: 'registry' as ImportTarget },
  { key: 'dateOfDeath', label: 'Date of Death', required: false, module: 'registry' as ImportTarget },
  { key: 'dateOfBurial', label: 'Date of Burial', required: false, module: 'registry' as ImportTarget },
  { key: 'cemetery', label: 'Cemetery', required: false, module: 'registry' as ImportTarget },
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

// ── File Parsing (CSV and XLSX share the same normalization path) ──

export interface ParsedSheet {
  columns: { name: string; sample: string }[];
  rows: Record<string, string>[];
}

// Header row + raw cell matrix → columns/rows. Blank-header columns are
// dropped, fully-empty rows are skipped, every cell is stringified + trimmed.
export function normalizeSheetMatrix(matrix: unknown[][]): ParsedSheet {
  if (matrix.length === 0) return { columns: [], rows: [] };
  const headers = matrix[0].map(h => String(h ?? '').trim());
  const rows: Record<string, string>[] = [];
  for (const raw of matrix.slice(1)) {
    const row: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const v = String(raw[i] ?? '').trim();
      row[h] = v;
      if (v) hasValue = true;
    });
    if (hasValue) rows.push(row);
  }
  const columns = headers.filter(Boolean).map(name => ({
    name,
    sample: rows.find(r => r[name])?.[name] ?? '',
  }));
  return { columns, rows };
}

// RFC-4180-ish CSV: quoted fields may contain commas, newlines and "" escapes.
export function parseCSV(text: string): ParsedSheet {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      matrix.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); matrix.push(row); }
  return normalizeSheetMatrix(matrix.filter(r => r.some(c => c.trim() !== '')));
}

// Lazy dynamic import keeps SheetJS (~400KB) out of the initial bundle; it
// only loads the first time someone actually uploads an .xlsx file.
export async function parseXLSX(data: ArrayBuffer): Promise<ParsedSheet> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return { columns: [], rows: [] };
  // raw:false formats dates/numbers as display strings so XLSX cells flow
  // through the exact same normalization + validation path as CSV text.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], {
    header: 1, raw: false, defval: '',
  });
  return normalizeSheetMatrix(matrix);
}

export function detectParsedIssues(parsed: ParsedSheet): string[] {
  const issues: string[] = [];
  if (parsed.columns.some(c => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c.sample))) {
    issues.push('Date format DD/MM/YYYY detected — will be converted to ISO format');
  }
  return issues;
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

// ── Row mapping ──

// Applies the field mappings to one source row, producing a record keyed by
// ChurchOS target field. date_fix values are converted to ISO when possible.
export function mapImportRow(
  sourceRow: Record<string, string>,
  mappings: ImportMapping[],
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const m of mappings) {
    const raw = (sourceRow[m.sourceField] ?? '').trim();
    mapped[m.targetField] = m.transform === 'date_fix' ? (convertDate(raw) ?? raw) : raw;
  }
  return mapped;
}

// ── Type-aware required mappings ──

// Which registry record type do the chosen mappings describe?
export function registryTypeOfMappings(mappings: ImportMapping[]): RegistryRecordType {
  const keys = new Set(mappings.map((m) => m.targetField));
  if (keys.has('groomFirstName') || keys.has('brideFirstName') || keys.has('dateOfMarriage')) return 'marriage';
  if (keys.has('confirmandFirstName') || keys.has('dateOfConfirmation')) return 'confirmation';
  if (keys.has('deceasedFirstName') || keys.has('dateOfDeath')) return 'death';
  return 'baptism';
}

// The minimum mappings each import needs before real records can be written.
// LastName fields are deliberately absent: a full-name column mapped to the
// FirstName field satisfies them — buildImportedRecord splits
// "MARIA CLARA SANTOS" into first/middle/last on write.
const REGISTRY_REQUIRED_BY_TYPE: Record<RegistryRecordType, string[]> = {
  baptism: ['childFirstName', 'dateOfBirth', 'dateOfBaptism', 'fatherFirstName', 'motherFirstName', 'officiant', 'bookNumber', 'pageNumber', 'registryNumber'],
  marriage: ['groomFirstName', 'brideFirstName', 'dateOfMarriage', 'officiant', 'bookNumber', 'pageNumber', 'registryNumber'],
  confirmation: ['confirmandFirstName', 'dateOfConfirmation', 'registryNumber'],
  death: ['deceasedFirstName', 'dateOfDeath', 'registryNumber'],
};

// Required target fields that no mapping covers. For the registry the set is
// record-type aware (a marriage file must not be blocked for lacking
// baptism-only fields like childFirstName).
export function missingRequiredFields(
  mappings: ImportMapping[],
  module: ImportTarget,
): { key: string; label: string }[] {
  const mappedKeys = new Set(mappings.map((m) => m.targetField));
  if (module === 'registry') {
    const type = registryTypeOfMappings(mappings);
    return REGISTRY_REQUIRED_BY_TYPE[type]
      .filter((k) => !mappedKeys.has(k))
      .map((k) => ({ key: k, label: CHURCHOS_REGISTRY_FIELDS.find((f) => f.key === k)?.label ?? k }));
  }
  const fields = module === 'directory' ? CHURCHOS_DIRECTORY_FIELDS : CHURCHOS_FINANCE_FIELDS;
  return fields
    .filter((f) => f.required && !mappedKeys.has(f.key))
    .map((f) => ({ key: f.key, label: f.label }));
}

// ── Building real module records from mapped rows ──
// The import wizard's final step must WRITE to the same persisted stores the
// Registry/Directory/Finance pages read — an import that only animates a
// progress bar is not an import.

export type ImportedRecord =
  | { store: 'baptismRecords'; record: BaptismRecord }
  | { store: 'marriageRecords'; record: MarriageRecord }
  | { store: 'confirmationRecords'; record: ConfirmationRecord }
  | { store: 'deathRecords'; record: DeathRecord }
  | { store: 'families'; record: Family }
  | { store: 'journalEntries'; record: JournalEntry };

const isoOrRaw = (v?: string): string => {
  const s = (v ?? '').trim();
  return convertDate(s) ?? s;
};

// A legacy full-name column mapped onto the FirstName field is split into
// first/middle/last; explicit Last/Middle mappings win when present.
function personName(first?: string, last?: string, middle?: string): { firstName: string; middleName: string; lastName: string } {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  const m = (middle ?? '').trim();
  if (!l && f.includes(' ')) {
    const split = splitFullName(f);
    return { firstName: split.firstName, middleName: m || split.middleName || '', lastName: split.lastName };
  }
  return { firstName: f, middleName: m, lastName: l };
}

const intOf = (v?: string): number => {
  const n = parseInt((v ?? '').trim(), 10);
  return isNaN(n) ? 0 : n;
};

const pesoOf = (v?: string): number => {
  const n = parseFloat((v ?? '').replace(/,/g, '').replace(/[₱\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
};

const genderOf = (v?: string): 'Male' | 'Female' =>
  (v ?? '').trim().toUpperCase().startsWith('F') ? 'Female' : 'Male';

const SCHED_DEFAULTS = { scheduledDate: '', scheduledTime: '', scheduledOfficiant: '', scheduledLocation: '' };

let importSeq = 0;

export function buildImportedRecord(
  mapped: Record<string, string>,
  module: ImportTarget,
  importedBy: string,
): ImportedRecord | null {
  const uid = `imp-${Date.now()}-${++importSeq}`;

  if (module === 'registry') {
    const type = registryTypeOf(mapped);
    if (type === 'baptism') {
      const child = personName(mapped.childFirstName, mapped.childLastName, mapped.childMiddleName);
      const father = personName(mapped.fatherFirstName, mapped.fatherLastName);
      const mother = personName(mapped.motherFirstName, mapped.motherLastName);
      const godfather = personName(mapped.godfatherFirstName, mapped.godfatherLastName);
      const godmother = personName(mapped.godmotherFirstName, mapped.godmotherLastName);
      const record: BaptismRecord = {
        id: `bap-${uid}`,
        registryNumber: mapped.registryNumber ?? '',
        childLastName: child.lastName, childFirstName: child.firstName, childMiddleName: child.middleName,
        dateOfBirth: isoOrRaw(mapped.dateOfBirth),
        placeOfBirthCity: '', placeOfBirthProvince: '',
        gender: genderOf(mapped.gender),
        fatherLastName: father.lastName, fatherFirstName: father.firstName, fatherMiddleName: father.middleName,
        motherLastName: mother.lastName, motherFirstName: mother.firstName, motherMiddleName: mother.middleName,
        motherMaidenName: '',
        godfatherLastName: godfather.lastName, godfatherFirstName: godfather.firstName,
        godmotherLastName: godmother.lastName, godmotherFirstName: godmother.firstName,
        addressStreet: '', addressBarangay: '', addressSitio: '', addressCity: '', addressProvince: '',
        dateOfBaptism: isoOrRaw(mapped.dateOfBaptism),
        timeOfBaptism: '',
        officiant: mapped.officiant ?? '',
        bookNumber: intOf(mapped.bookNumber),
        pageNumber: intOf(mapped.pageNumber),
        notations: mapped.notations ?? '',
        status: 'Active',
        ...SCHED_DEFAULTS,
      };
      return { store: 'baptismRecords', record };
    }
    if (type === 'marriage') {
      const groom = personName(mapped.groomFirstName, mapped.groomLastName);
      const bride = personName(mapped.brideFirstName, mapped.brideLastName);
      const record: MarriageRecord = {
        id: `mar-${uid}`,
        registryNumber: mapped.registryNumber ?? '',
        groomLastName: groom.lastName, groomFirstName: groom.firstName, groomMiddleName: groom.middleName,
        groomAge: 0, groomStatus: '', groomFather: '', groomMother: '',
        brideLastName: bride.lastName, brideFirstName: bride.firstName, brideMiddleName: bride.middleName,
        brideAge: 0, brideStatus: '', brideFather: '', brideMother: '',
        witness1Name: mapped.witness1Name ?? '',
        witness2Name: mapped.witness2Name ?? '',
        dateOfMarriage: isoOrRaw(mapped.dateOfMarriage),
        timeOfMarriage: '',
        officiant: mapped.officiant ?? '',
        bookNumber: intOf(mapped.bookNumber),
        pageNumber: intOf(mapped.pageNumber),
        notations: mapped.notations ?? '',
        status: 'Active',
        ...SCHED_DEFAULTS,
      };
      return { store: 'marriageRecords', record };
    }
    if (type === 'confirmation') {
      const confirmand = personName(mapped.confirmandFirstName, mapped.confirmandLastName);
      const sponsor = personName(mapped.sponsorName);
      const record: ConfirmationRecord = {
        id: `con-${uid}`,
        registryNumber: mapped.registryNumber ?? '',
        confirmandLastName: confirmand.lastName, confirmandFirstName: confirmand.firstName, confirmandMiddleName: confirmand.middleName,
        dateOfBirth: isoOrRaw(mapped.dateOfBirth),
        parishOfBaptism: '', dateOfBaptism: isoOrRaw(mapped.dateOfBaptism),
        officiant: mapped.officiant ?? '',
        bishop: mapped.bishop ?? '',
        sponsorLastName: sponsor.lastName, sponsorFirstName: sponsor.firstName,
        dateOfConfirmation: isoOrRaw(mapped.dateOfConfirmation),
        timeOfConfirmation: '',
        bookNumber: intOf(mapped.bookNumber),
        pageNumber: intOf(mapped.pageNumber),
        notations: mapped.notations ?? '',
        status: 'Active',
        ...SCHED_DEFAULTS,
      };
      return { store: 'confirmationRecords', record };
    }
    if (type === 'death') {
      const deceased = personName(mapped.deceasedFirstName, mapped.deceasedLastName);
      const record: DeathRecord = {
        id: `dth-${uid}`,
        registryNumber: mapped.registryNumber ?? '',
        deceasedLastName: deceased.lastName, deceasedFirstName: deceased.firstName, deceasedMiddleName: deceased.middleName,
        age: intOf(mapped.age),
        gender: genderOf(mapped.gender),
        dateOfDeath: isoOrRaw(mapped.dateOfDeath),
        dateOfBurial: isoOrRaw(mapped.dateOfBurial),
        timeOfBurial: '',
        causeOfDeath: '',
        cemetery: mapped.cemetery ?? '',
        officiant: mapped.officiant ?? '',
        bookNumber: intOf(mapped.bookNumber),
        pageNumber: intOf(mapped.pageNumber),
        notations: mapped.notations ?? '',
        status: 'Active',
        ...SCHED_DEFAULTS,
      };
      return { store: 'deathRecords', record };
    }
    return null;
  }

  if (module === 'directory') {
    const familyName = (mapped.familyName ?? '').trim()
      || personName(mapped.headFirstName).lastName;
    if (!familyName) return null;
    const noteParts = [
      mapped.headFirstName ? `Head of family: ${mapped.headFirstName}` : '',
      mapped.spouseFirstName ? `Spouse: ${mapped.spouseFirstName}` : '',
      'Imported from legacy data.',
    ].filter(Boolean);
    const record: Family = {
      id: `fam-${uid}`,
      familyName,
      color: '#C9963B',
      status: 'Active',
      street: mapped.address ?? '',
      barangay: mapped.addressBarangay ?? '',
      sitio: mapped.addressSitio ?? '',
      city: mapped.addressCity ?? '',
      province: '',
      primaryPhone: mapped.contactNumber ?? '',
      email: mapped.email || undefined,
      notes: noteParts.join(' '),
      members: [],
    };
    return { store: 'families', record };
  }

  // finance (and calendar files, which the wizard maps with the finance
  // field set): one legacy row = one amount against one account. Book it as a
  // balanced two-line entry with Cash on Hand (1000) as the offsetting
  // account — the standard treatment for single-column cash books.
  const debit = pesoOf(mapped.debit);
  const credit = pesoOf(mapped.credit);
  const amount = debit > 0 ? debit : credit > 0 ? credit : pesoOf(mapped.amount);
  if (amount <= 0) return null;
  const side: 'debit' | 'credit' = debit > 0 ? 'debit' : 'credit';

  // Resolve the stated account against the chart by (case-insensitive) name;
  // unmatched names keep their label under a derived 4xxx/5xxx code so the
  // ledger's unknown-code handling reports them without breaking the tie.
  const accountName = (mapped.accountName ?? '').trim();
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const leaf = accountName
    ? getLeafAccounts().find((a) => norm(a.name) === norm(accountName) || norm(a.name).includes(norm(accountName)) || norm(accountName).includes(norm(a.name)))
    : undefined;
  const accountCode = leaf?.code ?? (side === 'credit' ? '4990' : '5990');
  const resolvedName = leaf?.name ?? (accountName || (side === 'credit' ? 'Imported Income' : 'Imported Expense'));

  const accountLine = side === 'debit'
    ? { accountCode, accountName: resolvedName, debit: amount, credit: 0 }
    : { accountCode, accountName: resolvedName, debit: 0, credit: amount };
  const cashLine = side === 'debit'
    ? { accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: amount }
    : { accountCode: '1000', accountName: 'Cash on Hand', debit: amount, credit: 0 };

  const record: JournalEntry = {
    id: `JE-IMP-${uid}`,
    date: isoOrRaw(mapped.date),
    reference: (mapped.reference ?? '').trim() || 'Legacy import',
    description: (mapped.description ?? '').trim() || 'Imported legacy transaction',
    lines: side === 'debit' ? [accountLine, cashLine] : [cashLine, accountLine],
    status: 'Posted',
    postedBy: (mapped.postedBy ?? '').trim() || importedBy,
    totalDr: amount,
    totalCr: amount,
  };
  return { store: 'journalEntries', record };
}

// ── Duplicate Detection ──

export type DuplicateKind = 'existing' | 'in_file';

export interface DuplicateInfo {
  rowIndex: number; // index into mappedRows
  kind: DuplicateKind;
  key: string;
  reason: string;
}

const normText = (v: unknown) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// Token-sorted so an unsplit PIMS full name ("MARIA CLARA SANTOS") still
// matches a hand-entered record split into first "Maria Clara" + last "Santos".
const normName = (...parts: unknown[]) =>
  parts.map(normText).join(' ').split(' ').filter(Boolean).sort().join(' ');

const normDateKey = (v: unknown) => {
  const s = String(v ?? '').trim();
  return convertDate(s) ?? s;
};

const normAmount = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? '' : n.toFixed(2);
};

export type RegistryRecordType = 'baptism' | 'marriage' | 'confirmation' | 'death';

const REGISTRY_KEY_FIELDS: Record<RegistryRecordType, { last: string; first: string; date: string }> = {
  baptism: { last: 'childLastName', first: 'childFirstName', date: 'dateOfBaptism' },
  marriage: { last: 'groomLastName', first: 'groomFirstName', date: 'dateOfMarriage' },
  confirmation: { last: 'confirmandLastName', first: 'confirmandFirstName', date: 'dateOfConfirmation' },
  death: { last: 'deceasedLastName', first: 'deceasedFirstName', date: 'dateOfDeath' },
};

export function registryTypeOf(rec: Record<string, any>): RegistryRecordType | null {
  if (rec.childFirstName || rec.childLastName) return 'baptism';
  if (rec.groomFirstName || rec.groomLastName || rec.brideFirstName) return 'marriage';
  if (rec.confirmandFirstName || rec.confirmandLastName) return 'confirmation';
  if (rec.deceasedFirstName || rec.deceasedLastName) return 'death';
  return null;
}

function financeAmountOf(rec: Record<string, any>): string {
  for (const k of ['amount', 'debit', 'credit', 'totalDr', 'totalCr']) {
    const a = normAmount(rec[k]);
    if (a && a !== '0.00') return a;
  }
  return '';
}

// A record only gets a key when every key component is present — an
// incomplete key must not flag half the file as duplicates.
function dedupKey(rec: Record<string, any>, module: ImportTarget): string | null {
  if (module === 'registry') {
    const type = registryTypeOf(rec);
    if (!type) return null;
    const f = REGISTRY_KEY_FIELDS[type];
    const name = normName(rec[f.last], rec[f.first]);
    const date = normDateKey(rec[f.date]);
    if (!name || !date) return null;
    return `${type}|${name}|${date}`;
  }
  if (module === 'directory') {
    // Mapped rows use the addressBarangay target field; Family records store barangay.
    const name = normText(rec.familyName);
    const barangay = normText(rec.addressBarangay ?? rec.barangay);
    if (!name) return null;
    return `family|${name}|${barangay}`;
  }
  if (module === 'finance') {
    const date = normDateKey(rec.date);
    const desc = normText(rec.description);
    const amount = financeAmountOf(rec);
    if (!date || !desc || !amount) return null;
    return `entry|${date}|${desc}|${amount}`;
  }
  return null; // calendar: no dedup rule
}

function recordLabel(rec: Record<string, any>, module: ImportTarget): string {
  if (module === 'registry') {
    const type = registryTypeOf(rec) ?? 'record';
    return rec.registryNumber ? `${type} #${rec.registryNumber}` : type;
  }
  if (module === 'directory') {
    return `family "${rec.familyName}"${rec.barangay ? ` (${rec.barangay})` : ''}`;
  }
  if (module === 'finance') {
    return `journal entry${rec.reference ? ` ${rec.reference}` : ''} on ${rec.date}`;
  }
  return 'record';
}

// Flags mapped rows that collide with an existing ChurchOS record OR with an
// earlier row in the same file. The first in-file occurrence is not flagged.
export function detectDuplicates(
  mappedRows: Record<string, any>[],
  existingRecords: Record<string, any>[],
  module: ImportTarget,
): DuplicateInfo[] {
  const existingByKey = new Map<string, Record<string, any>>();
  for (const rec of existingRecords) {
    const key = dedupKey(rec, module);
    if (key && !existingByKey.has(key)) existingByKey.set(key, rec);
  }

  const seenInFile = new Map<string, number>();
  const duplicates: DuplicateInfo[] = [];
  mappedRows.forEach((row, i) => {
    const key = dedupKey(row, module);
    if (!key) return;
    const existing = existingByKey.get(key);
    if (existing) {
      duplicates.push({
        rowIndex: i, kind: 'existing', key,
        reason: `matches existing ${recordLabel(existing, module)}`,
      });
      return;
    }
    const firstAt = seenInFile.get(key);
    if (firstAt !== undefined) {
      duplicates.push({
        rowIndex: i, kind: 'in_file', key,
        reason: `duplicate of row ${firstAt + 1} in this file`,
      });
    } else {
      seenInFile.set(key, i);
    }
  });
  return duplicates;
}

// ── Import History ──

const IMPORT_HISTORY_KEY = 'import_history'; // namespaced short key (bare churchos_import_history migrates via parishIdentity)

export function getImportHistory(): ImportHistoryEntry[] {
  try {
    const raw = nsStore.getItem(IMPORT_HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function addImportHistory(entry: ImportHistoryEntry) {
  const history = getImportHistory();
  history.unshift(entry);
  nsStore.setItem(IMPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 50))); // Keep last 50
}

export function clearImportHistory() {
  nsStore.removeItem(IMPORT_HISTORY_KEY);
}
