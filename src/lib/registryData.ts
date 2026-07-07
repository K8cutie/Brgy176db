// Sacramental Registry Data
// Hardcoded sample data for all four sacrament types — with structured name fields

import { getJSON, setJSON } from './storageNamespaced';
import { getCurrentUserName } from './session';
import { getParishName, getFullAddress, getPriestName } from './parishConfig';
import type { AuditLogEntry } from './settingsData';
import type { CalendarEvent } from './calendarData';
import { todayISO } from './massIntentions';

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

// Structured marginal annotations (canon-law style margin notes). The freeform
// `notations` string stays for legacy display; new cross-references go here.
export type RegistryAnnotationType = 'confirmation' | 'marriage' | 'correction' | 'death' | 'note';

export interface RegistryAnnotation {
  id: string;
  date: string; // ISO date the annotated event happened / note was made
  type: RegistryAnnotationType;
  text: string;
  by: string;
  /** Canonical registers strike through, never erase: a voided annotation
   *  stays in the margin, rendered struck-through. Absent = live. */
  voided?: boolean;
}

// SHARED CONTRACT — soft delete. Absent fields = live record, so all stored
// data written before this feature keeps working unchanged.
export interface SoftDeletable {
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
}

export interface BaptismRecord {
  id: string;
  registryNumber: string;
  // --- CHILD ---
  childLastName: string;
  childFirstName: string;
  childMiddleName: string;
  dateOfBirth: string;
  placeOfBirthCity: string;
  placeOfBirthProvince: string;
  gender: 'Male' | 'Female';
  // --- FATHER ---
  fatherLastName: string;
  fatherFirstName: string;
  fatherMiddleName: string;
  fatherParishionerId?: string;
  // --- MOTHER ---
  motherLastName: string;
  motherFirstName: string;
  motherMiddleName: string;
  motherMaidenName: string;
  motherParishionerId?: string;
  // --- SPONSORS ---
  godfatherLastName: string;
  godfatherFirstName: string;
  godfatherParishionerId?: string;
  godmotherLastName: string;
  godmotherFirstName: string;
  godmotherParishionerId?: string;
  // --- DIRECTORY LINK ---
  childParishionerId?: string;
  // --- ADDRESS ---
  addressStreet: string;
  addressBarangay: string;
  addressSitio: string;
  addressCity: string;
  addressProvince: string;
  // --- RECORD ---
  dateOfBaptism: string;
  timeOfBaptism: string;
  officiant: string;
  bookNumber: number;
  pageNumber: number;
  notations: string;
  annotations?: RegistryAnnotation[];
  status: 'Active' | 'Cancelled' | 'Annotated';
  // --- SOFT DELETE (shared contract; absent = live) ---
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  // --- SCHEDULING ---
  scheduledDate: string;
  scheduledTime: string;
  scheduledOfficiant: string;
  scheduledLocation: string;
  calendarEventId?: string;
}

export interface MarriageRecord {
  id: string;
  registryNumber: string;
  // --- GROOM ---
  groomLastName: string;
  groomFirstName: string;
  groomMiddleName: string;
  groomAge: number;
  groomStatus: string;
  groomFather: string;
  groomMother: string;
  groomParishionerId?: string;
  // --- BRIDE ---
  brideLastName: string;
  brideFirstName: string;
  brideMiddleName: string;
  brideAge: number;
  brideStatus: string;
  brideFather: string;
  brideMother: string;
  brideParishionerId?: string;
  // --- WITNESSES ---
  witness1Name: string;
  witness1ParishionerId?: string;
  witness2Name: string;
  witness2ParishionerId?: string;
  // --- RECORD ---
  dateOfMarriage: string;
  timeOfMarriage: string;
  officiant: string;
  bookNumber: number;
  pageNumber: number;
  notations: string;
  annotations?: RegistryAnnotation[];
  status: 'Active' | 'Annulled' | 'Dispensed';
  // --- SOFT DELETE (shared contract; absent = live) ---
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  // --- SCHEDULING ---
  scheduledDate: string;
  scheduledTime: string;
  scheduledOfficiant: string;
  scheduledLocation: string;
  calendarEventId?: string;
}

export interface ConfirmationRecord {
  id: string;
  registryNumber: string;
  // --- CONFIRMAND ---
  confirmandLastName: string;
  confirmandFirstName: string;
  confirmandMiddleName: string;
  confirmandParishionerId?: string;
  dateOfBirth: string;
  parishOfBaptism: string;
  dateOfBaptism: string;
  // Link back to the baptism register (confirmation → baptism picker)
  baptismRecordId?: string;
  // --- OFFICIANT & BISHOP ---
  officiant: string;
  bishop: string;
  // --- SPONSOR ---
  sponsorLastName: string;
  sponsorFirstName: string;
  sponsorParishionerId?: string;
  // --- RECORD ---
  dateOfConfirmation: string;
  timeOfConfirmation: string;
  bookNumber: number;
  pageNumber: number;
  notations: string;
  annotations?: RegistryAnnotation[];
  status: 'Active' | 'Cancelled';
  // --- SOFT DELETE (shared contract; absent = live) ---
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  // --- SCHEDULING ---
  scheduledDate: string;
  scheduledTime: string;
  scheduledOfficiant: string;
  scheduledLocation: string;
  calendarEventId?: string;
}

export interface DeathRecord {
  id: string;
  registryNumber: string;
  // --- DECEASED ---
  deceasedLastName: string;
  deceasedFirstName: string;
  deceasedMiddleName: string;
  deceasedParishionerId?: string;
  age: number;
  gender: 'Male' | 'Female';
  // --- DEATH DETAILS ---
  dateOfDeath: string;
  dateOfBurial: string;
  timeOfBurial: string;
  causeOfDeath: string;
  cemetery: string;
  // --- RECORD ---
  officiant: string;
  bookNumber: number;
  pageNumber: number;
  notations: string;
  annotations?: RegistryAnnotation[];
  status: 'Active' | 'Annotated';
  // --- SOFT DELETE (shared contract; absent = live) ---
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  // --- SCHEDULING ---
  scheduledDate: string;
  scheduledTime: string;
  scheduledOfficiant: string;
  scheduledLocation: string;
  calendarEventId?: string;
}

export type RegistryRecord = BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord;

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

export const officiants = ['Fr. Reyes', 'Fr. Santos', 'Fr. Cruz', 'Fr. Mendoza', 'Fr. Aguilar'];

export const baptismLocations = ['Baptistry', 'Main Church'];
export const marriageLocations = ['Main Church', 'Parish Hall'];
export const confirmationLocations = ['Main Church', 'Bishop\'s Chapel'];
export const burialLocations = ['Main Church', 'Cemetery'];

export const baptismTimes = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM'];
export const marriageTimes = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM'];
export const confirmationTimes = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM'];
export const burialTimes = ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

/* ═══════════════════════════════════════════════════════════════════
   BAPTISM SAMPLE DATA  (10 records)
   ═══════════════════════════════════════════════════════════════════ */

export const baptismRecords: BaptismRecord[] = [
  {
    id: 'b1', registryNumber: '2024-0001',
    childLastName: 'Santos', childFirstName: 'Maria Clara', childMiddleName: 'Reyes',
    dateOfBirth: '2024-01-15', placeOfBirthCity: 'Mabalacat', placeOfBirthProvince: 'Pampanga', gender: 'Female',
    fatherLastName: 'Santos', fatherFirstName: 'Jose', fatherMiddleName: 'Cruz',
    motherLastName: 'Reyes', motherFirstName: 'Ana Marie', motherMiddleName: 'Santos', motherMaidenName: 'Reyes',
    godfatherLastName: 'Lim', godfatherFirstName: 'Pedro',
    godmotherLastName: 'Garcia', godmotherFirstName: 'Sofia',
    addressStreet: '123 Mango Street', addressBarangay: 'San Roque', addressSitio: 'Maligaya', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
    dateOfBaptism: '2024-02-10', timeOfBaptism: '9:00 AM', officiant: 'Fr. Reyes', bookNumber: 1, pageNumber: 45, notations: '', status: 'Active',
    scheduledDate: '2024-02-10', scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Baptistry',
  },
  {
    id: 'b2', registryNumber: '2024-0002',
    childLastName: 'Dela Cruz', childFirstName: 'Juan Miguel', childMiddleName: 'Bautista',
    dateOfBirth: '2023-11-20', placeOfBirthCity: 'Angeles', placeOfBirthProvince: 'Pampanga', gender: 'Male',
    fatherLastName: 'Dela Cruz', fatherFirstName: 'Roberto', fatherMiddleName: 'Santos',
    motherLastName: 'Bautista', motherFirstName: 'Elena', motherMiddleName: 'Flores', motherMaidenName: 'Bautista',
    godfatherLastName: 'Torres', godfatherFirstName: 'Miguel',
    godmotherLastName: 'Cruz', godmotherFirstName: 'Isabella',
    addressStreet: '456 Santol Road', addressBarangay: 'Dau', addressSitio: 'Mapagkalinga', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
    dateOfBaptism: '2024-02-18', timeOfBaptism: '10:00 AM', officiant: 'Fr. Santos', bookNumber: 1, pageNumber: 46, notations: '', status: 'Active',
    scheduledDate: '2024-02-18', scheduledTime: '10:00 AM', scheduledOfficiant: 'Fr. Santos', scheduledLocation: 'Baptistry',
  },
  {
    id: 'b3', registryNumber: '2024-0003',
    childLastName: 'Reyes', childFirstName: 'Ana Beatriz', childMiddleName: 'Flores',
    dateOfBirth: '2024-03-05', placeOfBirthCity: 'Mabalacat', placeOfBirthProvince: 'Pampanga', gender: 'Female',
    fatherLastName: 'Reyes', fatherFirstName: 'Antonio', fatherMiddleName: 'Dela Cruz',
    motherLastName: 'Flores', motherFirstName: 'Carmen', motherMiddleName: 'Lim', motherMaidenName: 'Flores',
    godfatherLastName: 'Aquino', godfatherFirstName: 'Rafael',
    godmotherLastName: 'Bautista', godmotherFirstName: 'Camille',
    addressStreet: '789 Sampaguita Drive', addressBarangay: 'San Roque', addressSitio: 'Mapayapa', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
    dateOfBaptism: '2024-04-12', timeOfBaptism: '9:00 AM', officiant: 'Fr. Cruz', bookNumber: 1, pageNumber: 47, notations: '', status: 'Active',
    scheduledDate: '2024-04-12', scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Cruz', scheduledLocation: 'Baptistry',
  },
  {
    id: 'b4', registryNumber: '2024-0004',
    childLastName: 'Lim', childFirstName: 'Pedro Antonio', childMiddleName: 'Garcia',
    dateOfBirth: '2024-02-14', placeOfBirthCity: 'Mabalacat', placeOfBirthProvince: 'Pampanga', gender: 'Male',
    fatherLastName: 'Lim', fatherFirstName: 'Manuel', fatherMiddleName: 'Torres',
    motherLastName: 'Garcia', motherFirstName: 'Rosario', motherMiddleName: 'Aquino', motherMaidenName: 'Garcia',
    godfatherLastName: 'Flores', godfatherFirstName: 'Diego',
    godmotherLastName: 'Santos', godmotherFirstName: 'Maria',
    addressStreet: '555 Narra Street', addressBarangay: 'Mabiga', addressSitio: 'Main', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
    dateOfBaptism: '2024-04-20', timeOfBaptism: '11:00 AM', officiant: 'Fr. Reyes', bookNumber: 1, pageNumber: 48, notations: '', status: 'Active',
    scheduledDate: '2024-04-20', scheduledTime: '11:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Baptistry',
  },
  {
    id: 'b5', registryNumber: '2024-0005',
    childLastName: 'Garcia', childFirstName: 'Sofia Marie', childMiddleName: 'Aquino',
    dateOfBirth: '2023-09-10', placeOfBirthCity: 'Mabalacat', placeOfBirthProvince: 'Pampanga', gender: 'Female',
    fatherLastName: 'Garcia', fatherFirstName: 'Carlos', fatherMiddleName: 'Lim',
    motherLastName: 'Aquino', motherFirstName: 'Diana', motherMiddleName: 'Reyes', motherMaidenName: 'Aquino',
    godfatherLastName: 'Dela Cruz', godfatherFirstName: 'Juan',
    godmotherLastName: 'Reyes', godmotherFirstName: 'Ana',
    addressStreet: '321 Acacia Lane', addressBarangay: 'Dau', addressSitio: 'Pag-asa', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
    dateOfBaptism: '2024-01-28', timeOfBaptism: '2:00 PM', officiant: 'Fr. Santos', bookNumber: 1, pageNumber: 49, notations: '', status: 'Active',
    scheduledDate: '2024-01-28', scheduledTime: '2:00 PM', scheduledOfficiant: 'Fr. Santos', scheduledLocation: 'Main Church',
  },
  {
    id: 'b6', registryNumber: '2023-0042',
    childLastName: 'Torres', childFirstName: 'Miguel Angelo', childMiddleName: 'Santos',
    dateOfBirth: '2023-05-22', placeOfBirthCity: 'Angeles', placeOfBirthProvince: 'Pampanga', gender: 'Male',
    fatherLastName: 'Torres', fatherFirstName: 'Fernando', fatherMiddleName: 'Reyes',
    motherLastName: 'Santos', motherFirstName: 'Grace', motherMiddleName: 'Dela Cruz', motherMaidenName: 'Santos',
    godfatherLastName: 'Lim', godfatherFirstName: 'Pedro',
    godmotherLastName: 'Garcia', godmotherFirstName: 'Sofia',
    addressStreet: '101 Ipil Street', addressBarangay: 'Dau', addressSitio: 'Sikat', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
    dateOfBaptism: '2023-07-15', timeOfBaptism: '9:00 AM', officiant: 'Fr. Cruz', bookNumber: 2, pageNumber: 112, notations: '', status: 'Active',
    scheduledDate: '2023-07-15', scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Cruz', scheduledLocation: 'Baptistry',
  },
  {
    id: 'b7', registryNumber: '2023-0043',
    childLastName: 'Cruz', childFirstName: 'Isabella Rose', childMiddleName: 'Dela Cruz',
    dateOfBirth: '2023-04-18', placeOfBirthCity: 'Mabalacat', placeOfBirthProvince: 'Pampanga', gender: 'Female',
    fatherLastName: 'Cruz', fatherFirstName: 'Ramon', fatherMiddleName: 'Bautista',
    motherLastName: 'Dela Cruz', motherFirstName: 'Patricia', motherMiddleName: 'Santos', motherMaidenName: 'Dela Cruz',
    godfatherLastName: 'Torres', godfatherFirstName: 'Miguel',
    godmotherLastName: 'Santos', godmotherFirstName: 'Maria',
    addressStreet: '202 Kaimito Ave', addressBarangay: 'San Roque', addressSitio: 'Bagong Silang', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
    dateOfBaptism: '2023-06-20', timeOfBaptism: '10:00 AM', officiant: 'Fr. Reyes', bookNumber: 2, pageNumber: 113, notations: '', status: 'Active',
    scheduledDate: '2023-06-20', scheduledTime: '10:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Baptistry',
  },
  {
    id: 'b8', registryNumber: '2022-0156',
    childLastName: 'Aquino', childFirstName: 'Rafael Joseph', childMiddleName: 'Reyes',
    dateOfBirth: '2022-08-30', placeOfBirthCity: 'Mabalacat', placeOfBirthProvince: 'Pampanga', gender: 'Male',
    fatherLastName: 'Aquino', fatherFirstName: 'Eduardo', fatherMiddleName: 'Santos',
    motherLastName: 'Reyes', motherFirstName: 'Lucia', motherMiddleName: 'Flores', motherMaidenName: 'Reyes',
    godfatherLastName: 'Dela Cruz', godfatherFirstName: 'Juan',
    godmotherLastName: 'Cruz', godmotherFirstName: 'Isabella',
    addressStreet: '321 Acacia Lane', addressBarangay: 'Dau', addressSitio: 'Pag-asa', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
    dateOfBaptism: '2022-10-22', timeOfBaptism: '9:00 AM', officiant: 'Fr. Santos', bookNumber: 2, pageNumber: 178, notations: '', status: 'Active',
    scheduledDate: '2022-10-22', scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Santos', scheduledLocation: 'Baptistry',
  },
  {
    id: 'b9', registryNumber: '2020-0089',
    childLastName: 'Bautista', childFirstName: 'Camille Faith', childMiddleName: 'Lim',
    dateOfBirth: '2020-03-12', placeOfBirthCity: 'Mabalacat', placeOfBirthProvince: 'Pampanga', gender: 'Female',
    fatherLastName: 'Bautista', fatherFirstName: 'Henry', fatherMiddleName: 'Garcia',
    motherLastName: 'Lim', motherFirstName: 'Mariel', motherMiddleName: 'Torres', motherMaidenName: 'Lim',
    godfatherLastName: 'Aquino', godfatherFirstName: 'Rafael',
    godmotherLastName: 'Garcia', godmotherFirstName: 'Sofia',
    addressStreet: '456 Santol Road', addressBarangay: 'Dau', addressSitio: 'Mapagkalinga', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
    dateOfBaptism: '2020-05-18', timeOfBaptism: '11:00 AM', officiant: 'Fr. Cruz', bookNumber: 3, pageNumber: 201, notations: '', status: 'Active',
    scheduledDate: '2020-05-18', scheduledTime: '11:00 AM', scheduledOfficiant: 'Fr. Cruz', scheduledLocation: 'Main Church',
  },
  {
    id: 'b10', registryNumber: '2018-0045',
    childLastName: 'Flores', childFirstName: 'Diego Lorenzo', childMiddleName: 'Torres',
    dateOfBirth: '2018-07-25', placeOfBirthCity: 'Mabalacat', placeOfBirthProvince: 'Pampanga', gender: 'Male',
    fatherLastName: 'Flores', fatherFirstName: 'Gabriel', fatherMiddleName: 'Reyes',
    motherLastName: 'Torres', motherFirstName: 'Teresa', motherMiddleName: 'Santos', motherMaidenName: 'Torres',
    godfatherLastName: 'Lim', godfatherFirstName: 'Pedro',
    godmotherLastName: 'Reyes', godmotherFirstName: 'Ana',
    addressStreet: '789 Sampaguita Drive', addressBarangay: 'San Roque', addressSitio: 'Gintong Araw', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
    dateOfBaptism: '2018-09-30', timeOfBaptism: '9:00 AM', officiant: 'Fr. Reyes', bookNumber: 3, pageNumber: 245, notations: '', status: 'Active',
    scheduledDate: '2018-09-30', scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Baptistry',
  },
];

/* ═══════════════════════════════════════════════════════════════════
   MARRIAGE SAMPLE DATA  (5 records)
   ═══════════════════════════════════════════════════════════════════ */

export const marriageRecords: MarriageRecord[] = [
  {
    id: 'm1', registryNumber: '2024-0101',
    groomLastName: 'Garcia', groomFirstName: 'Carlo', groomMiddleName: 'Lim', groomAge: 28, groomStatus: 'Single',
    groomFather: 'Carlos Garcia', groomMother: 'Diana Aquino',
    brideLastName: 'Lim', brideFirstName: 'Maria Elena', brideMiddleName: 'Santos', brideAge: 26, brideStatus: 'Single',
    brideFather: 'Manuel Lim', brideMother: 'Rosario Garcia',
    witness1Name: 'Jose Santos', witness2Name: 'Ana Marie Reyes',
    dateOfMarriage: '2024-06-15', timeOfMarriage: '10:00 AM', officiant: 'Fr. Reyes', bookNumber: 1, pageNumber: 32, notations: '', status: 'Active',
    scheduledDate: '2024-06-15', scheduledTime: '10:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Main Church',
  },
  {
    id: 'm2', registryNumber: '2024-0102',
    groomLastName: 'Reyes', groomFirstName: 'Roberto', groomMiddleName: 'Dela Cruz', groomAge: 32, groomStatus: 'Single',
    groomFather: 'Antonio Reyes', groomMother: 'Carmen Flores',
    brideLastName: 'Bautista', brideFirstName: 'Carmen', brideMiddleName: 'Lim', brideAge: 29, brideStatus: 'Single',
    brideFather: 'Henry Bautista', brideMother: 'Mariel Lim',
    witness1Name: 'Antonio Reyes', witness2Name: 'Henry Bautista',
    dateOfMarriage: '2024-08-22', timeOfMarriage: '2:00 PM', officiant: 'Fr. Santos', bookNumber: 1, pageNumber: 33, notations: '', status: 'Active',
    scheduledDate: '2024-08-22', scheduledTime: '2:00 PM', scheduledOfficiant: 'Fr. Santos', scheduledLocation: 'Main Church',
  },
  {
    id: 'm3', registryNumber: '2023-0089',
    groomLastName: 'Aquino', groomFirstName: 'Eduardo', groomMiddleName: 'Santos', groomAge: 30, groomStatus: 'Single',
    groomFather: 'Eduardo Aquino Sr.', groomMother: 'Lucia Reyes',
    brideLastName: 'Santos', brideFirstName: 'Grace', brideMiddleName: 'Dela Cruz', brideAge: 27, brideStatus: 'Single',
    brideFather: 'Roberto Santos', brideMother: 'Elena Bautista',
    witness1Name: 'Fernando Torres', witness2Name: 'Lucia Reyes',
    dateOfMarriage: '2023-12-18', timeOfMarriage: '9:00 AM', officiant: 'Fr. Cruz', bookNumber: 2, pageNumber: 67, notations: '', status: 'Active',
    scheduledDate: '2023-12-18', scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Cruz', scheduledLocation: 'Main Church',
  },
  {
    id: 'm4', registryNumber: '2023-0090',
    groomLastName: 'Torres', groomFirstName: 'Fernando', groomMiddleName: 'Reyes', groomAge: 35, groomStatus: 'Single',
    groomFather: 'Fernando Torres Sr.', groomMother: 'Isabella Cruz',
    brideLastName: 'Cruz', brideFirstName: 'Patricia', brideMiddleName: 'Bautista', brideAge: 33, brideStatus: 'Single',
    brideFather: 'Ramon Cruz', brideMother: 'Patricia Dela Cruz',
    witness1Name: 'Ramon Cruz', witness2Name: 'Rafael Aquino',
    dateOfMarriage: '2023-05-20', timeOfMarriage: '11:00 AM', officiant: 'Fr. Reyes', bookNumber: 2, pageNumber: 68, notations: '', status: 'Active',
    scheduledDate: '2023-05-20', scheduledTime: '11:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Main Church',
  },
  {
    id: 'm5', registryNumber: '2022-0078',
    groomLastName: 'Flores', groomFirstName: 'Gabriel', groomMiddleName: 'Aquino', groomAge: 29, groomStatus: 'Single',
    groomFather: 'Gabriel Flores Sr.', groomMother: 'Teresa Torres',
    brideLastName: 'Dela Cruz', brideFirstName: 'Teresa', brideMiddleName: 'Reyes', brideAge: 28, brideStatus: 'Single',
    brideFather: 'Roberto Dela Cruz', brideMother: 'Elena Bautista',
    witness1Name: 'Roberto Dela Cruz', witness2Name: 'Elena Bautista',
    dateOfMarriage: '2022-11-11', timeOfMarriage: '3:00 PM', officiant: 'Fr. Santos', bookNumber: 3, pageNumber: 45, notations: '', status: 'Active',
    scheduledDate: '2022-11-11', scheduledTime: '3:00 PM', scheduledOfficiant: 'Fr. Santos', scheduledLocation: 'Parish Hall',
  },
];

/* ═══════════════════════════════════════════════════════════════════
   CONFIRMATION SAMPLE DATA  (5 records)
   ═══════════════════════════════════════════════════════════════════ */

export const confirmationRecords: ConfirmationRecord[] = [
  {
    id: 'c1', registryNumber: '2024-0201',
    confirmandLastName: 'Dela Cruz', confirmandFirstName: 'Jose Antonio', confirmandMiddleName: 'Reyes',
    dateOfBirth: '2009-04-10', parishOfBaptism: 'St. Michael the Archangel Parish', dateOfBaptism: '2009-05-15',
    officiant: 'Fr. Reyes', bishop: 'Bishop Florentino Lavarias',
    sponsorLastName: 'Santos', sponsorFirstName: 'Maria Clara',
    dateOfConfirmation: '2024-04-28', timeOfConfirmation: '9:00 AM', bookNumber: 1, pageNumber: 22, notations: '', status: 'Active',
    scheduledDate: '2024-04-28', scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Main Church',
  },
  {
    id: 'c2', registryNumber: '2024-0202',
    confirmandLastName: 'Garcia', confirmandFirstName: 'Maria Sofia', confirmandMiddleName: 'Aquino',
    dateOfBirth: '2008-09-22', parishOfBaptism: 'St. Michael the Archangel Parish', dateOfBaptism: '2008-10-30',
    officiant: 'Fr. Reyes', bishop: 'Bishop Florentino Lavarias',
    sponsorLastName: 'Dela Cruz', sponsorFirstName: 'Juan Miguel',
    dateOfConfirmation: '2024-04-28', timeOfConfirmation: '10:00 AM', bookNumber: 1, pageNumber: 23, notations: '', status: 'Active',
    scheduledDate: '2024-04-28', scheduledTime: '10:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Main Church',
  },
  {
    id: 'c3', registryNumber: '2024-0203',
    confirmandLastName: 'Torres', confirmandFirstName: 'Miguel Angelo', confirmandMiddleName: 'Santos',
    dateOfBirth: '2010-01-05', parishOfBaptism: 'St. Michael the Archangel Parish', dateOfBaptism: '2010-02-20',
    officiant: 'Fr. Santos', bishop: 'Bishop Florentino Lavarias',
    sponsorLastName: 'Reyes', sponsorFirstName: 'Ana Beatriz',
    dateOfConfirmation: '2024-04-28', timeOfConfirmation: '11:00 AM', bookNumber: 1, pageNumber: 24, notations: '', status: 'Active',
    scheduledDate: '2024-04-28', scheduledTime: '11:00 AM', scheduledOfficiant: 'Fr. Santos', scheduledLocation: 'Main Church',
  },
  {
    id: 'c4', registryNumber: '2023-0189',
    confirmandLastName: 'Cruz', confirmandFirstName: 'Isabella Rose', confirmandMiddleName: 'Dela Cruz',
    dateOfBirth: '2007-12-18', parishOfBaptism: 'St. Michael the Archangel Parish', dateOfBaptism: '2008-01-25',
    officiant: 'Fr. Cruz', bishop: 'Bishop Florentino Lavarias',
    sponsorLastName: 'Lim', sponsorFirstName: 'Pedro Antonio',
    dateOfConfirmation: '2023-05-21', timeOfConfirmation: '9:00 AM', bookNumber: 2, pageNumber: 55, notations: '', status: 'Active',
    scheduledDate: '2023-05-21', scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Cruz', scheduledLocation: 'Main Church',
  },
  {
    id: 'c5', registryNumber: '2023-0190',
    confirmandLastName: 'Aquino', confirmandFirstName: 'Rafael Joseph', confirmandMiddleName: 'Reyes',
    dateOfBirth: '2006-03-30', parishOfBaptism: 'St. Michael the Archangel Parish', dateOfBaptism: '2006-05-10',
    officiant: 'Fr. Cruz', bishop: 'Bishop Florentino Lavarias',
    sponsorLastName: 'Garcia', sponsorFirstName: 'Sofia Marie',
    dateOfConfirmation: '2023-05-21', timeOfConfirmation: '10:00 AM', bookNumber: 2, pageNumber: 56, notations: '', status: 'Active',
    scheduledDate: '2023-05-21', scheduledTime: '10:00 AM', scheduledOfficiant: 'Fr. Cruz', scheduledLocation: 'Main Church',
  },
];

/* ═══════════════════════════════════════════════════════════════════
   DEATH SAMPLE DATA  (5 records)
   ═══════════════════════════════════════════════════════════════════ */

export const deathRecords: DeathRecord[] = [
  {
    id: 'd1', registryNumber: '2024-0301',
    deceasedLastName: 'Santos', deceasedFirstName: 'Eduardo', deceasedMiddleName: 'Cruz',
    age: 78, gender: 'Male',
    dateOfDeath: '2024-03-10', dateOfBurial: '2024-03-15', timeOfBurial: '9:00 AM',
    causeOfDeath: 'Natural causes', cemetery: 'San Lorenzo Cemetery',
    officiant: 'Fr. Reyes', bookNumber: 1, pageNumber: 18, notations: '', status: 'Active',
    scheduledDate: '2024-03-15', scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Main Church',
  },
  {
    id: 'd2', registryNumber: '2024-0302',
    deceasedLastName: 'Dela Cruz', deceasedFirstName: 'Rosario', deceasedMiddleName: 'Reyes',
    age: 82, gender: 'Female',
    dateOfDeath: '2024-05-22', dateOfBurial: '2024-05-27', timeOfBurial: '10:00 AM',
    causeOfDeath: 'Heart failure', cemetery: 'San Lorenzo Cemetery',
    officiant: 'Fr. Santos', bookNumber: 1, pageNumber: 19, notations: '', status: 'Active',
    scheduledDate: '2024-05-27', scheduledTime: '10:00 AM', scheduledOfficiant: 'Fr. Santos', scheduledLocation: 'Main Church',
  },
  {
    id: 'd3', registryNumber: '2023-0256',
    deceasedLastName: 'Garcia', deceasedFirstName: 'Manuel', deceasedMiddleName: 'Lim',
    age: 65, gender: 'Male',
    dateOfDeath: '2023-09-15', dateOfBurial: '2023-09-20', timeOfBurial: '2:00 PM',
    causeOfDeath: 'Stroke', cemetery: 'San Lorenzo Cemetery',
    officiant: 'Fr. Cruz', bookNumber: 2, pageNumber: 34, notations: '', status: 'Active',
    scheduledDate: '2023-09-20', scheduledTime: '2:00 PM', scheduledOfficiant: 'Fr. Cruz', scheduledLocation: 'Cemetery',
  },
  {
    id: 'd4', registryNumber: '2023-0257',
    deceasedLastName: 'Lim', deceasedFirstName: 'Teresa', deceasedMiddleName: 'Garcia',
    age: 71, gender: 'Female',
    dateOfDeath: '2023-11-30', dateOfBurial: '2023-12-05', timeOfBurial: '9:00 AM',
    causeOfDeath: 'Pneumonia', cemetery: 'San Lorenzo Cemetery',
    officiant: 'Fr. Reyes', bookNumber: 2, pageNumber: 35, notations: '', status: 'Active',
    scheduledDate: '2023-12-05', scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Main Church',
  },
  {
    id: 'd5', registryNumber: '2022-0201',
    deceasedLastName: 'Bautista', deceasedFirstName: 'Antonio', deceasedMiddleName: 'Flores',
    age: 58, gender: 'Male',
    dateOfDeath: '2022-07-18', dateOfBurial: '2022-07-23', timeOfBurial: '11:00 AM',
    causeOfDeath: 'Cancer', cemetery: 'San Lorenzo Cemetery',
    officiant: 'Fr. Santos', bookNumber: 3, pageNumber: 78, notations: '', status: 'Active',
    scheduledDate: '2022-07-23', scheduledTime: '11:00 AM', scheduledOfficiant: 'Fr. Santos', scheduledLocation: 'Cemetery',
  },
];

/* ═══════════════════════════════════════════════════════════════════
   CERTIFICATE TEMPLATES
   ═══════════════════════════════════════════════════════════════════ */

export type CertificateSacrament = 'baptism' | 'marriage' | 'confirmation' | 'death';

export interface CertificateTemplate {
  id: string;
  name: string;
  description: string;
  sacrament: CertificateSacrament;
  isDefault: boolean;
  isSystem: boolean;
  html: string;
}

// Optional watermark block for duplicate copies. Templates include the
// {{copy_watermark}} token; replaceTokens swaps in this block only when
// rendering a copy (opts.isCopy), otherwise the token disappears.
export const COPY_WATERMARK_HTML = `<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 10; overflow: hidden;">
  <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 160px; font-weight: 700; letter-spacing: 24px; color: rgba(184, 50, 47, 0.10); transform: rotate(-30deg); text-transform: uppercase; white-space: nowrap;">COPY</span>
</div>`;

export const certificateTemplates: CertificateTemplate[] = [
  {
    id: 't1',
    name: 'Standard Baptismal',
    description: 'Traditional format with gold border and parish seal',
    sacrament: 'baptism' as const,
    isDefault: true,
    isSystem: true,
    html: `<div style="font-family: 'Playfair Display', Georgia, serif; padding: 60px; border: 8px double #C9963B; min-height: 900px; position: relative; background: white;">
  <div style="text-align: center; margin-bottom: 40px;">
    <div style="font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #1B2A4A; margin-bottom: 8px;">St. Michael the Archangel Parish</div>
    <div style="font-size: 12px; color: #8C8374;">Mabalacat, Pampanga, Philippines</div>
  </div>
  <h1 style="text-align: center; font-size: 32px; color: #C9963B; letter-spacing: 4px; text-transform: uppercase; margin: 40px 0;">Certificate of Baptism</h1>
  <div style="text-align: center; margin: 50px 0; line-height: 2; font-size: 16px; color: #3D3A36;">
    <p>This is to certify that</p>
    <p style="font-size: 28px; font-weight: 600; color: #1B2A4A; margin: 20px 0; font-style: italic;">{{child_name}}</p>
    <p>born on <strong>{{birth_date}}</strong></p>
    <p>was duly baptized according to the Rite of the</p>
    <p>Roman Catholic Church on</p>
    <p style="font-size: 22px; font-weight: 600; color: #1B2A4A; margin: 15px 0;">{{baptism_date}}</p>
    <p>at {{parish_name}}</p>
  </div>
  <div style="margin: 40px 0; text-align: center; line-height: 2; font-size: 14px;">
    <p><strong>Parents:</strong> {{father_name}} &amp; {{mother_name}}</p>
    <p><strong>Godparents:</strong> {{godfather}} &amp; {{godmother}}</p>
    <p><strong>Officiating Minister:</strong> {{officiant}}</p>
  </div>
  <div style="position: absolute; bottom: 80px; left: 60px; right: 60px; display: flex; justify-content: space-between; align-items: flex-end;">
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 200px; padding-top: 8px; font-size: 12px;">{{priest_name}}</div>
      <div style="font-size: 11px; color: #8C8374;">Parish Priest</div>
    </div>
    <div style="width: 80px; height: 80px; border: 3px solid #C9963B; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #C9963B; font-size: 10px; text-align: center;">OFFICIAL<br/>SEAL</div>
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 120px; padding-top: 8px; font-size: 12px;">{{date_today}}</div>
      <div style="font-size: 11px; color: #8C8374;">Date Issued</div>
    </div>
  </div>
  <div style="position: absolute; bottom: 30px; left: 60px; right: 60px; text-align: center; font-size: 10px; color: #8C8374; font-family: 'JetBrains Mono', monospace;">
    Registry Ref: Book {{book_number}}, Page {{page_number}}
  </div>
</div>`,
  },
  {
    id: 't2',
    name: 'Formal with Seal',
    description: 'Elegant design with ornate corners and embossed seal area',
    sacrament: 'baptism' as const,
    isDefault: false,
    isSystem: true,
    html: `<div style="font-family: 'Playfair Display', Georgia, serif; padding: 60px; border: 12px solid #1B2A4A; min-height: 900px; position: relative; background: white;">
  <div style="position: absolute; top: 20px; left: 20px; width: 60px; height: 60px; border-top: 4px solid #C9963B; border-left: 4px solid #C9963B;"></div>
  <div style="position: absolute; top: 20px; right: 20px; width: 60px; height: 60px; border-top: 4px solid #C9963B; border-right: 4px solid #C9963B;"></div>
  <div style="position: absolute; bottom: 20px; left: 20px; width: 60px; height: 60px; border-bottom: 4px solid #C9963B; border-left: 4px solid #C9963B;"></div>
  <div style="position: absolute; bottom: 20px; right: 20px; width: 60px; height: 60px; border-bottom: 4px solid #C9963B; border-right: 4px solid #C9963B;"></div>
  <div style="text-align: center; margin: 30px 0 50px;">
    <div style="font-size: 16px; letter-spacing: 4px; text-transform: uppercase; color: #1B2A4A; margin-bottom: 4px;">St. Michael the Archangel Parish</div>
    <div style="font-size: 13px; color: #8C8374;">Mabalacat, Pampanga</div>
  </div>
  <h1 style="text-align: center; font-size: 36px; color: #1B2A4A; letter-spacing: 6px; text-transform: uppercase; margin: 50px 0;">Certificate<br/><span style="color: #C9963B;">of Baptism</span></h1>
  <div style="text-align: center; margin: 60px 0; line-height: 2.2; font-size: 17px; color: #3D3A36;">
    <p>I certify that</p>
    <p style="font-size: 30px; font-weight: 700; color: #1B2A4A; margin: 25px 0; font-style: italic; letter-spacing: 1px;">{{child_name}}</p>
    <p>child of <strong>{{father_name}}</strong> and <strong>{{mother_name}}</strong></p>
    <p>born <strong>{{birth_date}}</strong></p>
    <p>was baptized on <strong style="font-size: 20px;">{{baptism_date}}</strong></p>
    <p>at {{parish_name}}</p>
  </div>
  <div style="position: absolute; bottom: 100px; left: 60px; right: 60px; display: flex; justify-content: space-between;">
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 180px; padding-top: 8px; font-size: 13px;">{{godfather}}</div>
      <div style="font-size: 11px; color: #8C8374;">Godfather / Sponsor</div>
    </div>
    <div style="width: 90px; height: 90px; border: 4px double #C9963B; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #C9963B; font-size: 11px; text-align: center; font-weight: 600;">PARISH<br/>SEAL</div>
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 180px; padding-top: 8px; font-size: 13px;">{{godmother}}</div>
      <div style="font-size: 11px; color: #8C8374;">Godmother / Sponsor</div>
    </div>
  </div>
  <div style="position: absolute; bottom: 50px; left: 60px; right: 60px; display: flex; justify-content: space-between; font-size: 11px; color: #8C8374;">
    <span>Officiant: {{officiant}}</span>
    <span style="font-family: 'JetBrains Mono', monospace;">Book {{book_number}}, Page {{page_number}}</span>
    <span>{{date_today}}</span>
  </div>
</div>`,
  },
  {
    id: 't3',
    name: 'Simple',
    description: 'Clean minimal design without ornate decorations',
    sacrament: 'baptism' as const,
    isDefault: false,
    isSystem: false,
    html: `<div style="font-family: 'Inter', sans-serif; padding: 60px; min-height: 900px; background: white;">
  <div style="text-align: center; margin-bottom: 60px;">
    <h2 style="font-size: 24px; color: #1B2A4A; font-weight: 600;">St. Michael the Archangel Parish</h2>
    <p style="font-size: 13px; color: #8C8374;">Mabalacat, Pampanga</p>
  </div>
  <h1 style="text-align: center; font-size: 28px; color: #3D3A36; margin: 50px 0; font-weight: 400; letter-spacing: 2px;">CERTIFICATE OF BAPTISM</h1>
  <div style="max-width: 500px; margin: 0 auto; line-height: 2; font-size: 15px; color: #3D3A36;">
    <p style="margin-bottom: 8px;"><strong>Name:</strong> {{child_name}}</p>
    <p style="margin-bottom: 8px;"><strong>Date of Birth:</strong> {{birth_date}}</p>
    <p style="margin-bottom: 8px;"><strong>Date of Baptism:</strong> {{baptism_date}}</p>
    <p style="margin-bottom: 8px;"><strong>Father:</strong> {{father_name}}</p>
    <p style="margin-bottom: 8px;"><strong>Mother:</strong> {{mother_name}}</p>
    <p style="margin-bottom: 8px;"><strong>Godfather:</strong> {{godfather}}</p>
    <p style="margin-bottom: 8px;"><strong>Godmother:</strong> {{godmother}}</p>
    <p style="margin-bottom: 8px;"><strong>Officiant:</strong> {{officiant}}</p>
    <p style="margin-bottom: 8px;"><strong>Parish:</strong> {{parish_name}}</p>
    <p style="margin-top: 30px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #8C8374;">Book {{book_number}}, Page {{page_number}}</p>
  </div>
  <div style="margin-top: 80px; text-align: center;">
    <div style="border-top: 1px solid #3D3A36; width: 200px; margin: 0 auto; padding-top: 8px; font-size: 13px;">{{priest_name}}</div>
    <div style="font-size: 11px; color: #8C8374;">Parish Priest</div>
    <div style="margin-top: 20px; font-size: 11px; color: #8C8374;">{{date_today}}</div>
  </div>
</div>`,
  },
  {
    id: 't4',
    name: 'Standard Marriage',
    description: 'Traditional marriage certificate with gold border and parish seal',
    sacrament: 'marriage' as const,
    isDefault: true,
    isSystem: true,
    html: `<div style="font-family: 'Playfair Display', Georgia, serif; padding: 60px; border: 8px double #C9963B; min-height: 900px; position: relative; background: white;">
  {{copy_watermark}}
  <div style="text-align: center; margin-bottom: 40px;">
    <div style="font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #1B2A4A; margin-bottom: 8px;">{{parish_name}}</div>
    <div style="font-size: 12px; color: #8C8374;">{{parish_address}}, Philippines</div>
  </div>
  <h1 style="text-align: center; font-size: 32px; color: #C9963B; letter-spacing: 4px; text-transform: uppercase; margin: 40px 0;">Certificate of Marriage</h1>
  <div style="text-align: center; margin: 50px 0; line-height: 2; font-size: 16px; color: #3D3A36;">
    <p>This is to certify that</p>
    <p style="font-size: 26px; font-weight: 600; color: #1B2A4A; margin: 15px 0; font-style: italic;">{{groom_name}}</p>
    <p>and</p>
    <p style="font-size: 26px; font-weight: 600; color: #1B2A4A; margin: 15px 0; font-style: italic;">{{bride_name}}</p>
    <p>were united in Holy Matrimony according to the Rite of the</p>
    <p>Roman Catholic Church on</p>
    <p style="font-size: 22px; font-weight: 600; color: #1B2A4A; margin: 15px 0;">{{marriage_date}}</p>
    <p>at {{parish_name}}</p>
  </div>
  <div style="margin: 40px 0; text-align: center; line-height: 2; font-size: 14px;">
    <p><strong>Parents of the Groom:</strong> {{groom_parents}}</p>
    <p><strong>Parents of the Bride:</strong> {{bride_parents}}</p>
    <p><strong>Witnesses:</strong> {{witness1}} &amp; {{witness2}}</p>
    <p><strong>Officiating Minister:</strong> {{officiant}}</p>
  </div>
  <div style="position: absolute; bottom: 80px; left: 60px; right: 60px; display: flex; justify-content: space-between; align-items: flex-end;">
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 200px; padding-top: 8px; font-size: 12px;">{{priest_name}}</div>
      <div style="font-size: 11px; color: #8C8374;">Parish Priest</div>
    </div>
    <div style="width: 80px; height: 80px; border: 3px solid #C9963B; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #C9963B; font-size: 10px; text-align: center;">OFFICIAL<br/>SEAL</div>
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 120px; padding-top: 8px; font-size: 12px;">{{date_today}}</div>
      <div style="font-size: 11px; color: #8C8374;">Date Issued</div>
    </div>
  </div>
  <div style="position: absolute; bottom: 30px; left: 60px; right: 60px; text-align: center; font-size: 10px; color: #8C8374; font-family: 'JetBrains Mono', monospace;">
    Registry Ref: Book {{book_number}}, Page {{page_number}}
  </div>
</div>`,
  },
  {
    id: 't5',
    name: 'Standard Confirmation',
    description: 'Traditional confirmation certificate with gold border and parish seal',
    sacrament: 'confirmation' as const,
    isDefault: true,
    isSystem: true,
    html: `<div style="font-family: 'Playfair Display', Georgia, serif; padding: 60px; border: 8px double #C9963B; min-height: 900px; position: relative; background: white;">
  {{copy_watermark}}
  <div style="text-align: center; margin-bottom: 40px;">
    <div style="font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #1B2A4A; margin-bottom: 8px;">{{parish_name}}</div>
    <div style="font-size: 12px; color: #8C8374;">{{parish_address}}, Philippines</div>
  </div>
  <h1 style="text-align: center; font-size: 32px; color: #C9963B; letter-spacing: 4px; text-transform: uppercase; margin: 40px 0;">Certificate of Confirmation</h1>
  <div style="text-align: center; margin: 50px 0; line-height: 2; font-size: 16px; color: #3D3A36;">
    <p>This is to certify that</p>
    <p style="font-size: 28px; font-weight: 600; color: #1B2A4A; margin: 20px 0; font-style: italic;">{{confirmand_name}}</p>
    <p>born on <strong>{{birth_date}}</strong></p>
    <p>and baptized on <strong>{{baptism_date}}</strong> at {{baptism_parish}}</p>
    <p>received the Sacrament of Confirmation on</p>
    <p style="font-size: 22px; font-weight: 600; color: #1B2A4A; margin: 15px 0;">{{confirmation_date}}</p>
    <p>at {{parish_name}}</p>
  </div>
  <div style="margin: 40px 0; text-align: center; line-height: 2; font-size: 14px;">
    <p><strong>Sponsor:</strong> {{sponsor_name}}</p>
    <p><strong>Confirming Bishop:</strong> {{bishop}}</p>
    <p><strong>Officiating Minister:</strong> {{officiant}}</p>
  </div>
  <div style="position: absolute; bottom: 80px; left: 60px; right: 60px; display: flex; justify-content: space-between; align-items: flex-end;">
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 200px; padding-top: 8px; font-size: 12px;">{{priest_name}}</div>
      <div style="font-size: 11px; color: #8C8374;">Parish Priest</div>
    </div>
    <div style="width: 80px; height: 80px; border: 3px solid #C9963B; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #C9963B; font-size: 10px; text-align: center;">OFFICIAL<br/>SEAL</div>
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 120px; padding-top: 8px; font-size: 12px;">{{date_today}}</div>
      <div style="font-size: 11px; color: #8C8374;">Date Issued</div>
    </div>
  </div>
  <div style="position: absolute; bottom: 30px; left: 60px; right: 60px; text-align: center; font-size: 10px; color: #8C8374; font-family: 'JetBrains Mono', monospace;">
    Registry Ref: Book {{book_number}}, Page {{page_number}}
  </div>
</div>`,
  },
  {
    id: 't6',
    name: 'Standard Death',
    description: 'Traditional death/burial certificate with gold border and parish seal',
    sacrament: 'death' as const,
    isDefault: true,
    isSystem: true,
    html: `<div style="font-family: 'Playfair Display', Georgia, serif; padding: 60px; border: 8px double #C9963B; min-height: 900px; position: relative; background: white;">
  {{copy_watermark}}
  <div style="text-align: center; margin-bottom: 40px;">
    <div style="font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #1B2A4A; margin-bottom: 8px;">{{parish_name}}</div>
    <div style="font-size: 12px; color: #8C8374;">{{parish_address}}, Philippines</div>
  </div>
  <h1 style="text-align: center; font-size: 32px; color: #C9963B; letter-spacing: 4px; text-transform: uppercase; margin: 40px 0;">Certificate of Death</h1>
  <div style="text-align: center; margin: 50px 0; line-height: 2; font-size: 16px; color: #3D3A36;">
    <p>This is to certify that according to the Register of Deaths of this parish</p>
    <p style="font-size: 28px; font-weight: 600; color: #1B2A4A; margin: 20px 0; font-style: italic;">{{deceased_name}}</p>
    <p>aged <strong>{{deceased_age}}</strong> years, departed this life on</p>
    <p style="font-size: 22px; font-weight: 600; color: #1B2A4A; margin: 15px 0;">{{death_date}}</p>
    <p>and was given Christian burial on <strong>{{burial_date}}</strong></p>
    <p>at {{cemetery}}</p>
  </div>
  <div style="margin: 40px 0; text-align: center; line-height: 2; font-size: 14px;">
    <p><strong>Officiating Minister:</strong> {{officiant}}</p>
  </div>
  <div style="position: absolute; bottom: 80px; left: 60px; right: 60px; display: flex; justify-content: space-between; align-items: flex-end;">
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 200px; padding-top: 8px; font-size: 12px;">{{priest_name}}</div>
      <div style="font-size: 11px; color: #8C8374;">Parish Priest</div>
    </div>
    <div style="width: 80px; height: 80px; border: 3px solid #C9963B; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #C9963B; font-size: 10px; text-align: center;">OFFICIAL<br/>SEAL</div>
    <div style="text-align: center;">
      <div style="border-top: 1px solid #3D3A36; width: 120px; padding-top: 8px; font-size: 12px;">{{date_today}}</div>
      <div style="font-size: 11px; color: #8C8374;">Date Issued</div>
    </div>
  </div>
  <div style="position: absolute; bottom: 30px; left: 60px; right: 60px; text-align: center; font-size: 10px; color: #8C8374; font-family: 'JetBrains Mono', monospace;">
    Registry Ref: Book {{book_number}}, Page {{page_number}}
  </div>
</div>`,
  },
];

export interface CertificateToken {
  token: string;
  label: string;
  category: string;
}

// Tokens every template can use regardless of sacrament type.
const commonCertificateTokens: CertificateToken[] = [
  { token: '{{officiant}}', label: 'Officiant', category: 'Official' },
  { token: '{{book_number}}', label: 'Book Number', category: 'Record Reference' },
  { token: '{{page_number}}', label: 'Page Number', category: 'Record Reference' },
  { token: '{{registry_number}}', label: 'Registry Number', category: 'Record Reference' },
  { token: '{{parish_name}}', label: 'Parish Name', category: 'Location' },
  { token: '{{parish_address}}', label: 'Parish Address', category: 'Location' },
  { token: '{{priest_name}}', label: 'Parish Priest', category: 'Official' },
  { token: '{{date_today}}', label: 'Date Today', category: 'Date' },
  { token: '{{copy_watermark}}', label: 'COPY Watermark (shown on copies)', category: 'Special' },
];

export const certificateTokens: CertificateToken[] = [
  { token: '{{child_name}}', label: 'Child Name', category: 'Person' },
  { token: '{{baptism_date}}', label: 'Baptism Date', category: 'Date' },
  { token: '{{birth_date}}', label: 'Birth Date', category: 'Date' },
  { token: '{{father_name}}', label: 'Father Name', category: 'Person' },
  { token: '{{mother_name}}', label: 'Mother Name', category: 'Person' },
  { token: '{{godfather}}', label: 'Godfather', category: 'Person' },
  { token: '{{godmother}}', label: 'Godmother', category: 'Person' },
  ...commonCertificateTokens,
];

export const marriageCertificateTokens: CertificateToken[] = [
  { token: '{{groom_name}}', label: 'Groom Name', category: 'Person' },
  { token: '{{bride_name}}', label: 'Bride Name', category: 'Person' },
  { token: '{{marriage_date}}', label: 'Marriage Date', category: 'Date' },
  { token: '{{witness1}}', label: 'Witness 1', category: 'Person' },
  { token: '{{witness2}}', label: 'Witness 2', category: 'Person' },
  { token: '{{groom_parents}}', label: 'Parents of the Groom', category: 'Person' },
  { token: '{{bride_parents}}', label: 'Parents of the Bride', category: 'Person' },
  ...commonCertificateTokens,
];

export const confirmationCertificateTokens: CertificateToken[] = [
  { token: '{{confirmand_name}}', label: 'Confirmand Name', category: 'Person' },
  { token: '{{confirmation_date}}', label: 'Confirmation Date', category: 'Date' },
  { token: '{{sponsor_name}}', label: 'Sponsor', category: 'Person' },
  { token: '{{bishop}}', label: 'Confirming Bishop', category: 'Official' },
  { token: '{{birth_date}}', label: 'Birth Date', category: 'Date' },
  { token: '{{baptism_date}}', label: 'Baptism Date (reference)', category: 'Date' },
  { token: '{{baptism_parish}}', label: 'Parish of Baptism', category: 'Location' },
  ...commonCertificateTokens,
];

export const deathCertificateTokens: CertificateToken[] = [
  { token: '{{deceased_name}}', label: 'Deceased Name', category: 'Person' },
  { token: '{{deceased_age}}', label: 'Age at Death', category: 'Person' },
  { token: '{{death_date}}', label: 'Date of Death', category: 'Date' },
  { token: '{{burial_date}}', label: 'Date of Burial', category: 'Date' },
  { token: '{{cemetery}}', label: 'Cemetery / Place of Burial', category: 'Location' },
  ...commonCertificateTokens,
];

export const certificateTokensByType: Record<CertificateSacrament, CertificateToken[]> = {
  baptism: certificateTokens,
  marriage: marriageCertificateTokens,
  confirmation: confirmationCertificateTokens,
  death: deathCertificateTokens,
};

// Escape HTML special chars so record data (names, officiant, etc.) can't
// inject markup/script when the certificate is rendered via innerHTML.
export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════════════════════════════
   RECORD TYPE GUARDS
   ═══════════════════════════════════════════════════════════════════ */

export function isBaptismRecord(r: RegistryRecord): r is BaptismRecord {
  return 'childFirstName' in r;
}
export function isMarriageRecord(r: RegistryRecord): r is MarriageRecord {
  return 'groomFirstName' in r;
}
export function isConfirmationRecord(r: RegistryRecord): r is ConfirmationRecord {
  return 'confirmandFirstName' in r;
}
export function isDeathRecord(r: RegistryRecord): r is DeathRecord {
  return 'deceasedFirstName' in r;
}

export interface ReplaceTokensOptions {
  /** When true, {{copy_watermark}} renders the diagonal COPY overlay. */
  isCopy?: boolean;
}

// Accepts any of the four record types; unmatched sacrament-specific tokens
// are simply left alone (templates are curated per sacrament). ALL record
// values are HTML-escaped before insertion, and every value is inserted via a
// replacer FUNCTION so $&, $', $` in the data (which escaping itself can
// manufacture — ' becomes &#39;) stays literal text instead of being
// interpreted as a String.replace replacement pattern.
export function replaceTokens(template: string, record: RegistryRecord, opts?: ReplaceTokensOptions): string {
  // Escape, then freeze as a literal replacement.
  const e = (value: string) => () => escapeHtml(value);
  const lit = (value: string) => () => value;
  let out = template
    .replace(/\{\{officiant\}\}/g, e(record.officiant))
    .replace(/\{\{book_number\}\}/g, e(String(record.bookNumber)))
    .replace(/\{\{page_number\}\}/g, e(String(record.pageNumber)))
    .replace(/\{\{registry_number\}\}/g, e(record.registryNumber))
    // Parish identity comes from the configured parish (Settings), never
    // hardcoded literals — the t4/t5/t6 templates rely on these tokens.
    .replace(/\{\{parish_name\}\}/g, e(getParishName()))
    .replace(/\{\{parish_address\}\}/g, e(getFullAddress()))
    .replace(/\{\{priest_name\}\}/g, e(getPriestName()))
    .replace(/\{\{date_today\}\}/g, lit(formatPhilippineDate(todayISO())))
    .replace(/\{\{copy_watermark\}\}/g, lit(opts?.isCopy ? COPY_WATERMARK_HTML : ''));

  if (isBaptismRecord(record)) {
    out = out
      .replace(/\{\{child_name\}\}/g, e(`${record.childFirstName} ${record.childMiddleName} ${record.childLastName}`))
      .replace(/\{\{baptism_date\}\}/g, lit(formatPhilippineDate(record.dateOfBaptism)))
      .replace(/\{\{birth_date\}\}/g, lit(formatPhilippineDate(record.dateOfBirth)))
      .replace(/\{\{father_name\}\}/g, e(`${record.fatherFirstName} ${record.fatherMiddleName} ${record.fatherLastName}`))
      .replace(/\{\{mother_name\}\}/g, e(`${record.motherFirstName} ${record.motherMiddleName} ${record.motherLastName}` + (record.motherMaidenName ? ` (${record.motherMaidenName})` : '')))
      .replace(/\{\{godfather\}\}/g, e(`${record.godfatherFirstName} ${record.godfatherLastName}`))
      .replace(/\{\{godmother\}\}/g, e(`${record.godmotherFirstName} ${record.godmotherLastName}`));
  } else if (isMarriageRecord(record)) {
    out = out
      .replace(/\{\{groom_name\}\}/g, e(`${record.groomFirstName} ${record.groomMiddleName} ${record.groomLastName}`))
      .replace(/\{\{bride_name\}\}/g, e(`${record.brideFirstName} ${record.brideMiddleName} ${record.brideLastName}`))
      .replace(/\{\{marriage_date\}\}/g, lit(formatPhilippineDate(record.dateOfMarriage)))
      .replace(/\{\{witness1\}\}/g, e(record.witness1Name))
      .replace(/\{\{witness2\}\}/g, e(record.witness2Name))
      .replace(/\{\{groom_parents\}\}/g, e(`${record.groomFather} & ${record.groomMother}`))
      .replace(/\{\{bride_parents\}\}/g, e(`${record.brideFather} & ${record.brideMother}`));
  } else if (isConfirmationRecord(record)) {
    out = out
      .replace(/\{\{confirmand_name\}\}/g, e(`${record.confirmandFirstName} ${record.confirmandMiddleName} ${record.confirmandLastName}`))
      .replace(/\{\{confirmation_date\}\}/g, lit(formatPhilippineDate(record.dateOfConfirmation)))
      .replace(/\{\{sponsor_name\}\}/g, e(`${record.sponsorFirstName} ${record.sponsorLastName}`))
      .replace(/\{\{bishop\}\}/g, e(record.bishop))
      .replace(/\{\{birth_date\}\}/g, lit(formatPhilippineDate(record.dateOfBirth)))
      .replace(/\{\{baptism_date\}\}/g, lit(formatPhilippineDate(record.dateOfBaptism)))
      .replace(/\{\{baptism_parish\}\}/g, e(record.parishOfBaptism));
  } else if (isDeathRecord(record)) {
    out = out
      .replace(/\{\{deceased_name\}\}/g, e(`${record.deceasedFirstName} ${record.deceasedMiddleName} ${record.deceasedLastName}`))
      .replace(/\{\{deceased_age\}\}/g, e(String(record.age)))
      .replace(/\{\{death_date\}\}/g, lit(formatPhilippineDate(record.dateOfDeath)))
      .replace(/\{\{burial_date\}\}/g, lit(formatPhilippineDate(record.dateOfBurial)))
      .replace(/\{\{cemetery\}\}/g, e(record.cemetery));
  }
  return out;
}

export function formatPhilippineDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/* ═══════════════════════════════════════════════════════════════════
   SOFT DELETE — pure helpers (shared contract)
   ═══════════════════════════════════════════════════════════════════ */

/** Records written before soft delete existed have no flag → they are live. */
export function liveOnly<T extends SoftDeletable>(records: T[]): T[] {
  return records.filter((r) => !r.isDeleted);
}

/** Returns a soft-deleted copy; the original is not mutated. */
export function softDelete<T extends SoftDeletable>(record: T, by: string): T {
  return { ...record, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: by };
}

/* ═══════════════════════════════════════════════════════════════════
   MARGINAL ANNOTATIONS — pure helpers
   ═══════════════════════════════════════════════════════════════════ */

interface Annotatable {
  annotations?: RegistryAnnotation[];
}

export function newAnnotationId(): string {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Returns a copy with the annotation appended (legacy records without an
 *  annotations array work — it is created on first write). */
export function addAnnotation<T extends Annotatable>(record: T, ann: RegistryAnnotation): T {
  return { ...record, annotations: [...(record.annotations ?? []), ann] };
}

export interface AutoAnnotationPayload {
  /** ISO date of the annotated event; defaults to today. */
  date?: string;
  /** Who recorded the annotation; defaults to the logged-in user. */
  by?: string;
  // marriage
  spouse?: string;
  // marriage / confirmation
  parish?: string;
  registryNumber?: string;
  bishop?: string;
  // death
  cemetery?: string;
  // correction
  field?: string;
  oldValue?: string;
  newValue?: string;
  // correction / note
  text?: string;
}

/** Canonical wording for auto-generated margin notes. Defensive: missing
 *  payload fields degrade to shorter sentences, never "undefined". */
export function buildAutoAnnotation(type: RegistryAnnotationType, payload: AutoAnnotationPayload = {}): RegistryAnnotation {
  const date = payload.date || todayISO(); // local — UTC is a day off before 8 AM PH time
  const when = formatPhilippineDate(date);
  const at = payload.parish ? ` at ${payload.parish}` : '';
  const reg = payload.registryNumber ? ` (Reg. ${payload.registryNumber})` : '';
  let text: string;
  switch (type) {
    case 'marriage':
      text = `Married${payload.spouse ? ` ${payload.spouse}` : ''} on ${when}${at}${reg}`;
      break;
    case 'confirmation':
      text = `Confirmed on ${when}${at}${payload.bishop ? ` by ${payload.bishop}` : ''}${reg}`;
      break;
    case 'death':
      text = `Died on ${when}${payload.cemetery ? `; buried at ${payload.cemetery}` : ''}${reg}`;
      break;
    case 'correction':
      text = payload.field
        ? `Correction: ${payload.field} changed from "${payload.oldValue ?? ''}" to "${payload.newValue ?? ''}"`
        : `Correction: ${payload.text ?? ''}`;
      break;
    case 'note':
    default:
      text = payload.text ?? '';
      break;
  }
  return {
    id: newAnnotationId(),
    date,
    type,
    text,
    by: payload.by || getCurrentUserName(),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   ANNOTATION CORRECTIONS & VOIDING — pure helpers
   Canonical registers strike through, never erase: history is voided
   (rendered struck-through) and corrected with a new dated note.
   ═══════════════════════════════════════════════════════════════════ */

/** True when `ann` is the LIVE auto-annotation that a confirmation/marriage/
 *  death record with this registry number produced — the canonical wording
 *  from buildAutoAnnotation embeds "(Reg. <n>)", which is the only reference
 *  the margin note carries back to its source record. */
export function annotationReferencesRecord(
  ann: RegistryAnnotation,
  type: RegistryAnnotationType,
  registryNumber: string,
): boolean {
  if (!registryNumber) return false;
  return ann.type === type && !ann.voided && ann.text.includes(`(Reg. ${registryNumber})`);
}

/** Margin note appended when the source record of an auto-annotation is
 *  archived: the previous note is voided, never deleted. */
export function buildArchiveCorrectionAnnotation(
  sourceType: 'confirmation' | 'marriage' | 'death',
  sourceRegistryNumber: string,
  archivedOn?: string,
  by?: string,
): RegistryAnnotation {
  const date = archivedOn || todayISO(); // local — UTC is a day off before 8 AM PH time
  const label = sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
  return {
    id: newAnnotationId(),
    date,
    type: 'correction',
    text: `${label} record ${sourceRegistryNumber} archived on ${formatPhilippineDate(date)} — previous note void`,
    by: by || getCurrentUserName(),
  };
}

/** Returns a copy with the annotation marked voided (struck through). The
 *  annotation is never removed; the original record is not mutated. */
export function voidAnnotation<T extends Annotatable>(record: T, annotationId: string): T {
  return {
    ...record,
    annotations: (record.annotations ?? []).map((a) => (a.id === annotationId ? { ...a, voided: true } : a)),
  };
}

/** Annotations voided in `after` that were still live in `before` — voiding
 *  is an audited action, so the caller writes one audit line per entry. */
export function newlyVoidedAnnotations(
  before: RegistryAnnotation[] | undefined,
  after: RegistryAnnotation[] | undefined,
): RegistryAnnotation[] {
  const alreadyVoided = new Set((before ?? []).filter((a) => a.voided).map((a) => a.id));
  return (after ?? []).filter((a) => a.voided && !alreadyVoided.has(a.id));
}

/* ═══════════════════════════════════════════════════════════════════
   CONFIRMATION → BAPTISM PICKER
   ═══════════════════════════════════════════════════════════════════ */

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/** Find baptism records that plausibly belong to a confirmand. Last name must
 *  match (either direction of containment tolerates compound surnames); first
 *  name, when given, must overlap the same way. If a birth date is provided
 *  and any name match shares it, only those exact matches are returned.
 *  Soft-deleted records are never candidates. */
export function findBaptismCandidates(
  first: string,
  last: string,
  dob?: string,
  records: BaptismRecord[] = baptismRecords,
): BaptismRecord[] {
  const qf = norm(first);
  const ql = norm(last);
  if (!ql) return [];
  const matches = liveOnly(records).filter((r) => {
    const rl = norm(r.childLastName);
    const rf = norm(r.childFirstName);
    const lastOk = rl === ql || rl.includes(ql) || ql.includes(rl);
    const firstOk = !qf || rf === qf || rf.includes(qf) || qf.includes(rf);
    return lastOk && firstOk;
  });
  if (dob) {
    const exact = matches.filter((r) => r.dateOfBirth === dob);
    if (exact.length) return exact;
  }
  // Exact full-name matches first, then most recent baptisms.
  return [...matches].sort((a, b) => {
    const aExact = norm(a.childFirstName) === qf && norm(a.childLastName) === ql ? 0 : 1;
    const bExact = norm(b.childFirstName) === qf && norm(b.childLastName) === ql ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return (b.dateOfBaptism || '').localeCompare(a.dateOfBaptism || '');
  });
}

/** Resolve the ONE baptism record a cross-record auto-annotation (marriage/
 *  death) should land on. The explicit directory link wins; otherwise only an
 *  UNAMBIGUOUS exact-name match — with namesakes we cannot know whose baptism
 *  this is, so `ambiguous` is returned and annotation is left to the operator.
 *  Soft-deleted records are never candidates. */
export function resolveBaptismForAnnotation(
  records: BaptismRecord[],
  query: { parishionerId?: string; first: string; last: string },
): { target?: BaptismRecord; ambiguous: boolean } {
  const linked = query.parishionerId
    ? records.find((b) => !b.isDeleted && b.childParishionerId === query.parishionerId)
    : undefined;
  if (linked) return { target: linked, ambiguous: false };
  const exact = findBaptismCandidates(query.first, query.last, undefined, records).filter(
    (b) => norm(b.childFirstName) === norm(query.first) && norm(b.childLastName) === norm(query.last),
  );
  if (exact.length > 1) return { ambiguous: true };
  return { target: exact[0], ambiguous: false };
}

/* ═══════════════════════════════════════════════════════════════════
   REGISTRY → PARISH CALENDAR — pure builder for the "Auto-add to parish
   calendar" checkbox. Produces the exact CalendarEvent shape CalendarPage/
   RequestsPage read from KEYS.calendarEvents; the caller appends it via the
   storage seam and stores the REAL event id on the record.
   ═══════════════════════════════════════════════════════════════════ */

/** Registry schedule times are 12-hour ("9:00 AM"); CalendarEvent wants
 *  24-hour "HH:MM". Unparseable input falls back to 09:00. */
export function to24Hour(time: string): string {
  const t = (time || '').trim();
  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t);
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12;
    if (ampm[3].toUpperCase() === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${ampm[2]}`;
  }
  const plain = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (plain) return `${plain[1].padStart(2, '0')}:${plain[2]}`;
  return '09:00';
}

function addMinutesTo24h(hhmm: string, minutes: number): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Same titles the ScheduleSection checkbox previews (Event: "…").
function registryEventTitle(r: RegistryRecord): string {
  if (isBaptismRecord(r)) return `Baptism: ${r.childLastName}, ${[r.childFirstName, r.childMiddleName].filter(Boolean).join(' ')}`;
  if (isMarriageRecord(r)) return `Wedding: ${r.groomFirstName} ${r.groomLastName} & ${r.brideFirstName} ${r.brideLastName}`;
  if (isConfirmationRecord(r)) return `Confirmation: ${r.confirmandLastName}, ${[r.confirmandFirstName, r.confirmandMiddleName].filter(Boolean).join(' ')}`;
  return `Burial: ${[r.deceasedFirstName, r.deceasedMiddleName, r.deceasedLastName].filter(Boolean).join(' ')}`;
}

function registryPersonSummary(r: RegistryRecord): string {
  if (isBaptismRecord(r)) return `${r.childLastName}, ${r.childFirstName}`;
  if (isMarriageRecord(r)) return `${r.groomFirstName} ${r.groomLastName} & ${r.brideFirstName} ${r.brideLastName}`;
  if (isConfirmationRecord(r)) return `${r.confirmandLastName}, ${r.confirmandFirstName}`;
  return `${r.deceasedLastName}, ${r.deceasedFirstName}`;
}

/** Build a real parish-calendar event from a registry record's schedule
 *  fields. Always PRIVATE (isPublic false) — the title carries parishioner
 *  names, so publishing to the public calendar stays opt-in on the Calendar
 *  page. Ceremony duration defaults to one hour, like RequestsPage. */
export function buildRegistryCalendarEvent(record: RegistryRecord): CalendarEvent {
  const recordType: NonNullable<CalendarEvent['sacramentRecordType']> =
    isBaptismRecord(record) ? 'baptism'
    : isMarriageRecord(record) ? 'marriage'
    : isConfirmationRecord(record) ? 'confirmation'
    : 'death';
  // Calendar lanes: a marriage books the Wedding lane; a death books Death.
  const eventType: CalendarEvent['type'] =
    recordType === 'baptism' ? 'Baptism'
    : recordType === 'marriage' ? 'Wedding'
    : recordType === 'confirmation' ? 'Confirmation'
    : 'Death';
  const startTime = to24Hour(record.scheduledTime);
  return {
    id: `evt-reg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: registryEventTitle(record),
    type: eventType,
    date: record.scheduledDate,
    startTime,
    endTime: addMinutesTo24h(startTime, 60),
    location: record.scheduledLocation,
    officiant: record.scheduledOfficiant,
    description: `From the sacramental registry — Reg. ${record.registryNumber}`,
    isPublic: false,
    sacramentRecordId: record.id,
    sacramentRecordType: recordType,
    sacramentSummary: registryPersonSummary(record),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   CERTIFICATE TEMPLATE MERGE — pure core of the RegistryPage loader
   ═══════════════════════════════════════════════════════════════════ */

/** Merge stored template edits/copies with the shipped defaults:
 *  - saved entries whose id matches a default OVERRIDE that default;
 *  - defaults with no saved entry ship as-is (new templates keep working);
 *  - saved entries with UNKNOWN ids are user duplicates — preserved, but
 *    forced editable (never system) and never allowed to steal the default
 *    slot; malformed entries are dropped instead of crashing the loader. */
export function mergeCertificateTemplates(
  defaults: CertificateTemplate[],
  saved: Partial<CertificateTemplate>[],
): CertificateTemplate[] {
  if (!saved.length) return defaults.map((t) => ({ ...t }));
  const byId = new Map(saved.map((t) => [t.id, t]));
  const defaultIds = new Set(defaults.map((t) => t.id));
  const merged = defaults.map((t) => {
    const override = byId.get(t.id);
    return override ? { ...t, ...override } : { ...t };
  });
  const custom = saved.filter(
    (t): t is CertificateTemplate =>
      !!t.id && !defaultIds.has(t.id) && typeof t.name === 'string' && typeof t.html === 'string' && !!t.sacrament,
  );
  return [...merged, ...custom.map((t) => ({ ...t, description: t.description ?? '', isSystem: false, isDefault: false }))];
}

/* ═══════════════════════════════════════════════════════════════════
   REGISTRY AUDIT — same 'audit_log' key/shape as FinancePage.appendFinanceAudit
   ═══════════════════════════════════════════════════════════════════ */

export function appendRegistryAudit(action: string, recordId: string, details: string): void {
  const log = getJSON<AuditLogEntry[]>('audit_log', []);
  const entry: AuditLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    user: getCurrentUserName(),
    action,
    table: 'Registry',
    recordId,
    details,
    ipAddress: 'local',
  };
  setJSON('audit_log', [entry, ...log]);
}
