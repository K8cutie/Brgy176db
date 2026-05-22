// Sacramental Registry Data
// Hardcoded sample data for all four sacrament types — with structured name fields

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

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
  godmotherLastName: string;
  godmotherFirstName: string;
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
  status: 'Active' | 'Cancelled' | 'Annotated';
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
  // --- BRIDE ---
  brideLastName: string;
  brideFirstName: string;
  brideMiddleName: string;
  brideAge: number;
  brideStatus: string;
  brideFather: string;
  brideMother: string;
  // --- WITNESSES ---
  witness1Name: string;
  witness2Name: string;
  // --- RECORD ---
  dateOfMarriage: string;
  timeOfMarriage: string;
  officiant: string;
  bookNumber: number;
  pageNumber: number;
  notations: string;
  status: 'Active' | 'Annulled' | 'Dispensed';
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
  dateOfBirth: string;
  parishOfBaptism: string;
  dateOfBaptism: string;
  // --- OFFICIANT & BISHOP ---
  officiant: string;
  bishop: string;
  // --- SPONSOR ---
  sponsorLastName: string;
  sponsorFirstName: string;
  // --- RECORD ---
  dateOfConfirmation: string;
  timeOfConfirmation: string;
  bookNumber: number;
  pageNumber: number;
  notations: string;
  status: 'Active' | 'Cancelled';
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
  status: 'Active' | 'Annotated';
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

export const certificateTemplates = [
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
];

export const certificateTokens = [
  { token: '{{child_name}}', label: 'Child Name', category: 'Person' },
  { token: '{{baptism_date}}', label: 'Baptism Date', category: 'Date' },
  { token: '{{birth_date}}', label: 'Birth Date', category: 'Date' },
  { token: '{{father_name}}', label: 'Father Name', category: 'Person' },
  { token: '{{mother_name}}', label: 'Mother Name', category: 'Person' },
  { token: '{{godfather}}', label: 'Godfather', category: 'Person' },
  { token: '{{godmother}}', label: 'Godmother', category: 'Person' },
  { token: '{{officiant}}', label: 'Officiant', category: 'Official' },
  { token: '{{book_number}}', label: 'Book Number', category: 'Record Reference' },
  { token: '{{page_number}}', label: 'Page Number', category: 'Record Reference' },
  { token: '{{parish_name}}', label: 'Parish Name', category: 'Location' },
  { token: '{{parish_address}}', label: 'Parish Address', category: 'Location' },
  { token: '{{priest_name}}', label: 'Parish Priest', category: 'Official' },
  { token: '{{date_today}}', label: 'Date Today', category: 'Date' },
];

export function replaceTokens(template: string, record: BaptismRecord): string {
  return template
    .replace(/\{\{child_name\}\}/g, `${record.childFirstName} ${record.childMiddleName} ${record.childLastName}`)
    .replace(/\{\{baptism_date\}\}/g, formatPhilippineDate(record.dateOfBaptism))
    .replace(/\{\{birth_date\}\}/g, formatPhilippineDate(record.dateOfBirth))
    .replace(/\{\{father_name\}\}/g, `${record.fatherFirstName} ${record.fatherMiddleName} ${record.fatherLastName}`)
    .replace(/\{\{mother_name\}\}/g, `${record.motherFirstName} ${record.motherMiddleName} ${record.motherLastName}` + (record.motherMaidenName ? ` (${record.motherMaidenName})` : ''))
    .replace(/\{\{godfather\}\}/g, `${record.godfatherFirstName} ${record.godfatherLastName}`)
    .replace(/\{\{godmother\}\}/g, `${record.godmotherFirstName} ${record.godmotherLastName}`)
    .replace(/\{\{officiant\}\}/g, record.officiant)
    .replace(/\{\{book_number\}\}/g, String(record.bookNumber))
    .replace(/\{\{page_number\}\}/g, String(record.pageNumber))
    .replace(/\{\{parish_name\}\}/g, 'St. Michael the Archangel Parish')
    .replace(/\{\{parish_address\}\}/g, 'Mabalacat, Pampanga')
    .replace(/\{\{priest_name\}\}/g, 'Fr. Antonio Reyes')
    .replace(/\{\{date_today\}\}/g, formatPhilippineDate(new Date().toISOString().split('T')[0]));
}

function formatPhilippineDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
