export type ProgramType = 'Scholarship' | 'Medical' | 'Feeding' | 'Livelihood' | 'Emergency';
export type ApplicationStatus = 'Pending Review' | 'Approved' | 'Rejected' | 'On Hold';
export type BeneficiaryStatus = 'Active' | 'Completed' | 'Suspended';
export type DisbursementType = 'Cash' | 'Check' | 'Bank Transfer';

export interface SSDMProgram {
  id: ProgramType;
  name: string;
  icon: string;
  color: string;
  bgClass: string;
  borderClass: string;
  budget: number;
  spent: number;
  activeBeneficiaries: number;
  approvedThisYear: number;
  pendingReview: number;
  description: string;
}

export interface Application {
  id: string;
  applicantName: string;
  age: number;
  address: string;
  contact: string;
  familySize: number;
  monthlyIncome: number;
  dateApplied: string;
  programType: ProgramType;
  status: ApplicationStatus;
  assignedReviewer: string;
  amountRequested: number;
  notes: string;
  // Scholarship fields
  school?: string;
  gradeLevel?: string;
  gpa?: string;
  course?: string;
  // Medical fields
  diagnosis?: string;
  estimatedCost?: number;
  hospital?: string;
  doctorName?: string;
  // Livelihood fields
  businessProposal?: string;
  // Emergency fields
  emergencyType?: string;
  // Documents
  documents: { name: string; size: string }[];
  // Review workflow
  reviewers: ReviewerVote[];
  overallStatus: string;
}

export interface ReviewerVote {
  name: string;
  initials: string;
  vote: 'Approve' | 'Reject' | 'Abstain' | 'Pending';
  comment: string;
}

export interface Beneficiary {
  id: string;
  name: string;
  program: ProgramType;
  dateApproved: string;
  amountAwarded: number;
  disbursementStatus: 'Ongoing' | 'Complete' | 'Pending';
  lastDisbursementDate: string;
  totalDisbursed: number;
  address: string;
  contact: string;
  history: DisbursementRecord[];
}

export interface DisbursementRecord {
  id: string;
  date: string;
  beneficiary: string;
  program: ProgramType;
  amount: number;
  type: DisbursementType;
  reference: string;
  approvedBy: string;
  notes: string;
}

export const programs: SSDMProgram[] = [
  {
    id: 'Scholarship',
    name: 'Scholarship Program',
    icon: 'GraduationCap',
    color: '#5B3A73',
    bgClass: 'bg-purple',
    borderClass: 'border-t-purple',
    budget: 120000,
    spent: 45200,
    activeBeneficiaries: 24,
    approvedThisYear: 15,
    pendingReview: 3,
    description: 'Educational assistance for deserving parish youth from low-income families. Covers tuition, books, and transportation allowances.',
  },
  {
    id: 'Medical',
    name: 'Medical Assistance',
    icon: 'Stethoscope',
    color: '#B8322F',
    bgClass: 'bg-error',
    borderClass: 'border-t-[#B8322F]',
    budget: 60000,
    spent: 25100,
    activeBeneficiaries: 18,
    approvedThisYear: 10,
    pendingReview: 2,
    description: 'Medical and health assistance for parishioners needing hospitalization, medication, and medical procedures.',
  },
  {
    id: 'Feeding',
    name: 'Feeding Program',
    icon: 'Utensils',
    color: '#C9963B',
    bgClass: 'bg-warning',
    borderClass: 'border-t-[#C9963B]',
    budget: 80000,
    spent: 32100,
    activeBeneficiaries: 120,
    approvedThisYear: 150,
    pendingReview: 5,
    description: 'Regular feeding program for undernourished children and elderly in the parish community.',
  },
  {
    id: 'Livelihood',
    name: 'Livelihood Support',
    icon: 'Briefcase',
    color: '#2D6A4F',
    bgClass: 'bg-success',
    borderClass: 'border-t-[#2D6A4F]',
    budget: 50000,
    spent: 18400,
    activeBeneficiaries: 8,
    approvedThisYear: 6,
    pendingReview: 1,
    description: 'Financial grants and support for small business startups and livelihood projects for families.',
  },
  {
    id: 'Emergency',
    name: 'Emergency Assistance',
    icon: 'AlertCircle',
    color: '#3B6BC9',
    bgClass: 'bg-info',
    borderClass: 'border-t-[#3B6BC9]',
    budget: 40000,
    spent: 28500,
    activeBeneficiaries: 3,
    approvedThisYear: 8,
    pendingReview: 1,
    description: 'Rapid response financial aid for families affected by calamities, fires, and other emergencies.',
  },
];

export const applications: Application[] = [
  {
    id: 'APP-001',
    applicantName: 'Maria Santos',
    age: 16,
    address: 'Barangay San Francisco, Mabalacat, Pampanga',
    contact: '0912-345-6789',
    familySize: 5,
    monthlyIncome: 8500,
    dateApplied: '2026-01-10',
    programType: 'Scholarship',
    status: 'Pending Review',
    assignedReviewer: 'Mrs. Elena Cruz',
    amountRequested: 15000,
    notes: 'Honor student, father works as tricycle driver',
    school: 'St. Scholastica\'s College',
    gradeLevel: 'Grade 11',
    gpa: '92%',
    course: 'STEM',
    documents: [
      { name: 'Application form.pdf', size: '245 KB' },
      { name: 'Grade report.pdf', size: '180 KB' },
      { name: 'Barangay clearance.jpg', size: '320 KB' },
      { name: 'Income affidavit.pdf', size: '150 KB' },
    ],
    reviewers: [
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Approve', comment: 'Excellent academic record, deserving student' },
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Approve', comment: 'Family truly in need' },
      { name: 'Ms. Ana Lim', initials: 'AL', vote: 'Pending', comment: '' },
    ],
    overallStatus: 'Committee Review',
  },
  {
    id: 'APP-002',
    applicantName: 'Juan Dela Cruz',
    age: 67,
    address: 'Barangay Dau, Mabalacat, Pampanga',
    contact: '0918-234-5678',
    familySize: 4,
    monthlyIncome: 6000,
    dateApplied: '2026-01-15',
    programType: 'Medical',
    status: 'Approved',
    assignedReviewer: 'Fr. Antonio Reyes',
    amountRequested: 25000,
    notes: 'Senior citizen, needs cataract surgery',
    diagnosis: 'Bilateral cataracts',
    estimatedCost: 35000,
    hospital: 'Jose B. Lingad Memorial Hospital',
    doctorName: 'Dr. Maria Garcia',
    documents: [
      { name: 'Medical certificate.pdf', size: '210 KB' },
      { name: 'Hospital quote.pdf', size: '165 KB' },
      { name: 'Senior ID.jpg', size: '290 KB' },
    ],
    reviewers: [
      { name: 'Fr. Antonio Reyes', initials: 'AR', vote: 'Approve', comment: 'Legitimate medical need' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Approve', comment: 'Senior citizen, priority' },
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Approve', comment: 'Approved' },
    ],
    overallStatus: 'Approved',
  },
  {
    id: 'APP-003',
    applicantName: 'Elena Garcia',
    age: 19,
    address: 'Barangay Macabebe, Mabalacat, Pampanga',
    contact: '0917-456-7890',
    familySize: 6,
    monthlyIncome: 10000,
    dateApplied: '2026-01-20',
    programType: 'Scholarship',
    status: 'On Hold',
    assignedReviewer: 'Ms. Ana Lim',
    amountRequested: 20000,
    notes: 'Missing grade report for 2nd semester',
    school: 'Holy Angel University',
    gradeLevel: '1st Year College',
    gpa: '88%',
    course: 'BS Education',
    documents: [
      { name: 'Application form.pdf', size: '230 KB' },
      { name: 'Barangay clearance.jpg', size: '310 KB' },
    ],
    reviewers: [
      { name: 'Ms. Ana Lim', initials: 'AL', vote: 'Abstain', comment: 'Incomplete documents' },
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Abstain', comment: 'Need more info' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Pending', comment: '' },
    ],
    overallStatus: 'Pending',
  },
  {
    id: 'APP-004',
    applicantName: 'Pedro Mangilit',
    age: 45,
    address: 'Barangay San Francisco, Mabalacat, Pampanga',
    contact: '0919-567-8901',
    familySize: 7,
    monthlyIncome: 12000,
    dateApplied: '2026-02-01',
    programType: 'Livelihood',
    status: 'Pending Review',
    assignedReviewer: 'Mr. Jose Reyes',
    amountRequested: 8000,
    notes: 'Wants to start a sari-sari store',
    businessProposal: 'Sari-sari store in front of house. Expected monthly income: ₱5,000-8,000',
    documents: [
      { name: 'Business plan.pdf', size: '280 KB' },
      { name: 'Barangay permit.jpg', size: '340 KB' },
      { name: 'Income affidavit.pdf', size: '160 KB' },
    ],
    reviewers: [
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Pending', comment: '' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Pending', comment: '' },
      { name: 'Fr. Antonio Reyes', initials: 'AR', vote: 'Pending', comment: '' },
    ],
    overallStatus: 'Pending',
  },
  {
    id: 'APP-005',
    applicantName: 'Sofia Aquino',
    age: 8,
    address: 'Barangay Dau, Mabalacat, Pampanga',
    contact: '0916-678-9012',
    familySize: 5,
    monthlyIncome: 7000,
    dateApplied: '2026-02-05',
    programType: 'Feeding',
    status: 'Approved',
    assignedReviewer: 'Mrs. Elena Cruz',
    amountRequested: 0,
    notes: 'Malnourished, weight below normal for age',
    documents: [
      { name: 'Health checkup.pdf', size: '190 KB' },
      { name: 'Barangay cert.jpg', size: '275 KB' },
    ],
    reviewers: [
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Approve', comment: 'Child needs nutrition support' },
      { name: 'Ms. Ana Lim', initials: 'AL', vote: 'Approve', comment: 'Agreed' },
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Approve', comment: 'Approved' },
    ],
    overallStatus: 'Approved',
  },
  {
    id: 'APP-006',
    applicantName: 'Ramon Lapid',
    age: 55,
    address: 'Barangay Mangga, Mabalacat, Pampanga',
    contact: '0915-789-0123',
    familySize: 3,
    monthlyIncome: 5000,
    dateApplied: '2026-02-10',
    programType: 'Emergency',
    status: 'Approved',
    assignedReviewer: 'Fr. Antonio Reyes',
    amountRequested: 10000,
    notes: 'House partially burned in fire incident',
    emergencyType: 'Fire damage',
    documents: [
      { name: 'Fire report.pdf', size: '220 KB' },
      { name: 'Barangay cert.jpg', size: '300 KB' },
      { name: 'Photo of damage.jpg', size: '1.2 MB' },
    ],
    reviewers: [
      { name: 'Fr. Antonio Reyes', initials: 'AR', vote: 'Approve', comment: 'Verified fire incident' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Approve', comment: 'Immediate need' },
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Approve', comment: 'Approved for emergency' },
    ],
    overallStatus: 'Approved',
  },
  {
    id: 'APP-007',
    applicantName: 'Carmen Tolentino',
    age: 72,
    address: 'Barangay San Francisco, Mabalacat, Pampanga',
    contact: '0914-890-1234',
    familySize: 2,
    monthlyIncome: 3500,
    dateApplied: '2026-02-15',
    programType: 'Medical',
    status: 'Pending Review',
    assignedReviewer: 'Dr. Maria Garcia',
    amountRequested: 18000,
    notes: 'Diabetes medication and checkup needed',
    diagnosis: 'Type 2 Diabetes Mellitus',
    estimatedCost: 18000,
    hospital: 'Rural Health Unit',
    doctorName: 'Dr. Maria Garcia',
    documents: [
      { name: 'Medical abstract.pdf', size: '175 KB' },
      { name: 'Prescription.jpg', size: '250 KB' },
      { name: 'Senior ID.jpg', size: '280 KB' },
    ],
    reviewers: [
      { name: 'Dr. Maria Garcia', initials: 'MG', vote: 'Approve', comment: 'Chronic condition, needs maintenance meds' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Pending', comment: '' },
      { name: 'Fr. Antonio Reyes', initials: 'AR', vote: 'Pending', comment: '' },
    ],
    overallStatus: 'Pending',
  },
  {
    id: 'APP-008',
    applicantName: 'Josefina Dizon',
    age: 14,
    address: 'Barangay Dau, Mabalacat, Pampanga',
    contact: '0913-901-2345',
    familySize: 8,
    monthlyIncome: 9000,
    dateApplied: '2026-02-20',
    programType: 'Scholarship',
    status: 'Approved',
    assignedReviewer: 'Mrs. Elena Cruz',
    amountRequested: 12000,
    notes: 'Consistent honor student',
    school: 'Mabalacat National High School',
    gradeLevel: 'Grade 9',
    gpa: '94%',
    course: 'Special Science',
    documents: [
      { name: 'Grade report.pdf', size: '200 KB' },
      { name: 'Barangay clearance.jpg', size: '315 KB' },
      { name: 'Recommendation letter.pdf', size: '185 KB' },
      { name: 'Income affidavit.pdf', size: '155 KB' },
    ],
    reviewers: [
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Approve', comment: 'Top of her class, very deserving' },
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Approve', comment: 'Excellent grades' },
      { name: 'Ms. Ana Lim', initials: 'AL', vote: 'Approve', comment: 'Approved' },
    ],
    overallStatus: 'Approved',
  },
  {
    id: 'APP-009',
    applicantName: 'Roberto Castillo',
    age: 38,
    address: 'Barangay Macabebe, Mabalacat, Pampanga',
    contact: '0912-012-3456',
    familySize: 6,
    monthlyIncome: 11000,
    dateApplied: '2026-03-01',
    programType: 'Livelihood',
    status: 'Rejected',
    assignedReviewer: 'Mr. Jose Reyes',
    amountRequested: 15000,
    notes: 'Previous business failed, high risk',
    businessProposal: 'Motorcycle repair shop. Has experience but previous attempt failed.',
    documents: [
      { name: 'Business plan.pdf', size: '260 KB' },
      { name: 'Barangay clearance.jpg', size: '305 KB' },
    ],
    reviewers: [
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Reject', comment: 'Previous business venture failed' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Reject', comment: 'High risk, no collateral' },
      { name: 'Fr. Antonio Reyes', initials: 'AR', vote: 'Abstain', comment: 'Consider after 1 year' },
    ],
    overallStatus: 'Rejected',
  },
  {
    id: 'APP-010',
    applicantName: 'Lourdes Pangan',
    age: 62,
    address: 'Barangay Mangga, Mabalacat, Pampanga',
    contact: '0911-123-4567',
    familySize: 3,
    monthlyIncome: 4500,
    dateApplied: '2026-03-05',
    programType: 'Feeding',
    status: 'Pending Review',
    assignedReviewer: 'Ms. Ana Lim',
    amountRequested: 0,
    notes: 'Underweight senior, lives alone',
    documents: [
      { name: 'Health cert.pdf', size: '195 KB' },
      { name: 'Barangay cert.jpg', size: '280 KB' },
      { name: 'ID photo.jpg', size: '150 KB' },
    ],
    reviewers: [
      { name: 'Ms. Ana Lim', initials: 'AL', vote: 'Approve', comment: 'Senior in need' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Pending', comment: '' },
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Pending', comment: '' },
    ],
    overallStatus: 'Pending',
  },
  {
    id: 'APP-011',
    applicantName: 'Fernando Sy',
    age: 28,
    address: 'Barangay Dau, Mabalacat, Pampanga',
    contact: '0910-234-5678',
    familySize: 4,
    monthlyIncome: 8000,
    dateApplied: '2026-03-10',
    programType: 'Emergency',
    status: 'On Hold',
    assignedReviewer: 'Fr. Antonio Reyes',
    amountRequested: 5000,
    notes: 'Lost job due to company closure, needs temporary help',
    emergencyType: 'Job loss',
    documents: [
      { name: 'Certificate of employment.pdf', size: '210 KB' },
      { name: 'Termination letter.pdf', size: '165 KB' },
    ],
    reviewers: [
      { name: 'Fr. Antonio Reyes', initials: 'AR', vote: 'Abstain', comment: 'Verify employment details' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Abstain', comment: 'Need to verify' },
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Abstain', comment: 'More info needed' },
    ],
    overallStatus: 'On Hold',
  },
  {
    id: 'APP-012',
    applicantName: 'Teresita Tan',
    age: 20,
    address: 'Barangay San Francisco, Mabalacat, Pampanga',
    contact: '0909-345-6789',
    familySize: 5,
    monthlyIncome: 9500,
    dateApplied: '2026-03-12',
    programType: 'Scholarship',
    status: 'Pending Review',
    assignedReviewer: 'Ms. Ana Lim',
    amountRequested: 22000,
    notes: '2nd year college, Dean\'s lister',
    school: 'Don Honorio Ventura State University',
    gradeLevel: '2nd Year',
    gpa: '91%',
    course: 'BS Nursing',
    documents: [
      { name: 'Grade report.pdf', size: '205 KB' },
      { name: 'Barangay clearance.jpg', size: '325 KB' },
      { name: 'Income affidavit.pdf', size: '148 KB' },
    ],
    reviewers: [
      { name: 'Ms. Ana Lim', initials: 'AL', vote: 'Approve', comment: 'Dean\'s lister, very promising' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Pending', comment: '' },
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Pending', comment: '' },
    ],
    overallStatus: 'Committee Review',
  },
  {
    id: 'APP-013',
    applicantName: 'Benito Cruz',
    age: 58,
    address: 'Barangay Dau, Mabalacat, Pampanga',
    contact: '0908-456-7890',
    familySize: 4,
    monthlyIncome: 7000,
    dateApplied: '2026-03-15',
    programType: 'Medical',
    status: 'Rejected',
    assignedReviewer: 'Dr. Maria Garcia',
    amountRequested: 30000,
    notes: 'Expired documents, non-resident',
    diagnosis: 'Chronic kidney disease',
    estimatedCost: 45000,
    hospital: 'Jose B. Lingad Memorial Hospital',
    doctorName: 'Dr. Carlos Tan',
    documents: [
      { name: 'Old medical cert.pdf', size: '180 KB' },
    ],
    reviewers: [
      { name: 'Dr. Maria Garcia', initials: 'MG', vote: 'Reject', comment: 'Documents expired, not current resident' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Reject', comment: 'Non-resident' },
      { name: 'Fr. Antonio Reyes', initials: 'AR', vote: 'Reject', comment: 'Cannot approve, non-parishioner' },
    ],
    overallStatus: 'Rejected',
  },
  {
    id: 'APP-014',
    applicantName: 'Angela Ocampo',
    age: 11,
    address: 'Barangay Macabebe, Mabalacat, Pampanga',
    contact: '0907-567-8901',
    familySize: 7,
    monthlyIncome: 8000,
    dateApplied: '2026-03-18',
    programType: 'Feeding',
    status: 'Approved',
    assignedReviewer: 'Ms. Ana Lim',
    amountRequested: 0,
    notes: 'Stunted growth, needs nutrition program',
    documents: [
      { name: 'Health report.pdf', size: '220 KB' },
      { name: 'Barangay cert.jpg', size: '290 KB' },
    ],
    reviewers: [
      { name: 'Ms. Ana Lim', initials: 'AL', vote: 'Approve', comment: 'Child needs nutrition' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Approve', comment: 'Approved' },
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Approve', comment: 'Approved' },
    ],
    overallStatus: 'Approved',
  },
  {
    id: 'APP-015',
    applicantName: 'Rodrigo Miranda',
    age: 42,
    address: 'Barangay Mangga, Mabalacat, Pampanga',
    contact: '0906-678-9012',
    familySize: 5,
    monthlyIncome: 13000,
    dateApplied: '2026-03-20',
    programType: 'Livelihood',
    status: 'Pending Review',
    assignedReviewer: 'Mr. Jose Reyes',
    amountRequested: 10000,
    notes: 'Wants to start a vulcanizing shop',
    businessProposal: 'Vulcanizing and tire repair shop near highway. Experienced worker.',
    documents: [
      { name: 'Business plan.pdf', size: '295 KB' },
      { name: 'Barangay permit.jpg', size: '330 KB' },
      { name: 'Skills cert.pdf', size: '210 KB' },
    ],
    reviewers: [
      { name: 'Mr. Jose Reyes', initials: 'JR', vote: 'Approve', comment: 'Has skills and experience' },
      { name: 'Mrs. Elena Cruz', initials: 'EC', vote: 'Pending', comment: '' },
      { name: 'Fr. Antonio Reyes', initials: 'AR', vote: 'Pending', comment: '' },
    ],
    overallStatus: 'Committee Review',
  },
];

export const beneficiaries: Beneficiary[] = [
  {
    id: 'BEN-001', name: 'Maria Santos', program: 'Scholarship', dateApproved: '2026-01-25',
    amountAwarded: 15000, disbursementStatus: 'Ongoing', lastDisbursementDate: '2026-05-15',
    totalDisbursed: 10000, address: 'Barangay San Francisco', contact: '0912-345-6789',
    history: [
      { id: 'D-001', date: '2026-01-25', beneficiary: 'Maria Santos', program: 'Scholarship', amount: 5000, type: 'Cash', reference: 'SS-001', approvedBy: 'Fr. Antonio Reyes', notes: '1st quarter allowance' },
      { id: 'D-002', date: '2026-02-25', beneficiary: 'Maria Santos', program: 'Scholarship', amount: 2500, type: 'Cash', reference: 'SS-002', approvedBy: 'Mrs. Elena Cruz', notes: 'Book allowance' },
      { id: 'D-003', date: '2026-05-15', beneficiary: 'Maria Santos', program: 'Scholarship', amount: 2500, type: 'Bank Transfer', reference: 'BPI-4567', approvedBy: 'Mrs. Elena Cruz', notes: 'Transportation' },
    ],
  },
  {
    id: 'BEN-002', name: 'Juan Dela Cruz', program: 'Medical', dateApproved: '2026-01-28',
    amountAwarded: 25000, disbursementStatus: 'Complete', lastDisbursementDate: '2026-04-10',
    totalDisbursed: 25000, address: 'Barangay Dau', contact: '0918-234-5678',
    history: [
      { id: 'D-004', date: '2026-01-28', beneficiary: 'Juan Dela Cruz', program: 'Medical', amount: 10000, type: 'Check', reference: 'CHK-001', approvedBy: 'Fr. Antonio Reyes', notes: 'Initial deposit for surgery' },
      { id: 'D-005', date: '2026-02-15', beneficiary: 'Juan Dela Cruz', program: 'Medical', amount: 10000, type: 'Bank Transfer', reference: 'BPI-3456', approvedBy: 'Mrs. Elena Cruz', notes: 'Surgery fee balance' },
      { id: 'D-006', date: '2026-04-10', beneficiary: 'Juan Dela Cruz', program: 'Medical', amount: 5000, type: 'Cash', reference: 'SS-003', approvedBy: 'Fr. Antonio Reyes', notes: 'Follow-up medication' },
    ],
  },
  {
    id: 'BEN-003', name: 'Sofia Aquino', program: 'Feeding', dateApproved: '2026-02-08',
    amountAwarded: 0, disbursementStatus: 'Ongoing', lastDisbursementDate: '2026-05-18',
    totalDisbursed: 3600, address: 'Barangay Dau', contact: '0916-678-9012',
    history: [
      { id: 'D-007', date: '2026-02-08', beneficiary: 'Sofia Aquino', program: 'Feeding', amount: 900, type: 'Cash', reference: 'FD-001', approvedBy: 'Ms. Ana Lim', notes: 'February meals' },
      { id: 'D-008', date: '2026-03-10', beneficiary: 'Sofia Aquino', program: 'Feeding', amount: 900, type: 'Cash', reference: 'FD-002', approvedBy: 'Ms. Ana Lim', notes: 'March meals' },
      { id: 'D-009', date: '2026-04-12', beneficiary: 'Sofia Aquino', program: 'Feeding', amount: 900, type: 'Cash', reference: 'FD-003', approvedBy: 'Ms. Ana Lim', notes: 'April meals' },
      { id: 'D-010', date: '2026-05-18', beneficiary: 'Sofia Aquino', program: 'Feeding', amount: 900, type: 'Cash', reference: 'FD-004', approvedBy: 'Ms. Ana Lim', notes: 'May meals' },
    ],
  },
  {
    id: 'BEN-004', name: 'Ramon Lapid', program: 'Emergency', dateApproved: '2026-02-12',
    amountAwarded: 10000, disbursementStatus: 'Complete', lastDisbursementDate: '2026-03-05',
    totalDisbursed: 10000, address: 'Barangay Mangga', contact: '0915-789-0123',
    history: [
      { id: 'D-011', date: '2026-02-12', beneficiary: 'Ramon Lapid', program: 'Emergency', amount: 5000, type: 'Cash', reference: 'EM-001', approvedBy: 'Fr. Antonio Reyes', notes: 'Immediate relief' },
      { id: 'D-012', date: '2026-03-05', beneficiary: 'Ramon Lapid', program: 'Emergency', amount: 5000, type: 'Check', reference: 'CHK-002', approvedBy: 'Fr. Antonio Reyes', notes: 'Reconstruction materials' },
    ],
  },
  {
    id: 'BEN-005', name: 'Josefina Dizon', program: 'Scholarship', dateApproved: '2026-02-25',
    amountAwarded: 12000, disbursementStatus: 'Ongoing', lastDisbursementDate: '2026-05-10',
    totalDisbursed: 8000, address: 'Barangay Dau', contact: '0913-901-2345',
    history: [
      { id: 'D-013', date: '2026-02-25', beneficiary: 'Josefina Dizon', program: 'Scholarship', amount: 4000, type: 'Cash', reference: 'SS-004', approvedBy: 'Mrs. Elena Cruz', notes: 'Tuition 1st sem' },
      { id: 'D-014', date: '2026-05-10', beneficiary: 'Josefina Dizon', program: 'Scholarship', amount: 4000, type: 'Bank Transfer', reference: 'BPI-5678', approvedBy: 'Mrs. Elena Cruz', notes: 'Tuition 2nd sem' },
    ],
  },
  {
    id: 'BEN-006', name: 'Angela Ocampo', program: 'Feeding', dateApproved: '2026-03-20',
    amountAwarded: 0, disbursementStatus: 'Ongoing', lastDisbursementDate: '2026-05-20',
    totalDisbursed: 1800, address: 'Barangay Macabebe', contact: '0907-567-8901',
    history: [
      { id: 'D-015', date: '2026-03-20', beneficiary: 'Angela Ocampo', program: 'Feeding', amount: 900, type: 'Cash', reference: 'FD-005', approvedBy: 'Ms. Ana Lim', notes: 'March-April meals' },
      { id: 'D-016', date: '2026-05-20', beneficiary: 'Angela Ocampo', program: 'Feeding', amount: 900, type: 'Cash', reference: 'FD-006', approvedBy: 'Ms. Ana Lim', notes: 'May-June meals' },
    ],
  },
  {
    id: 'BEN-007', name: 'Carmen Tolentino', program: 'Medical', dateApproved: '2026-02-28',
    amountAwarded: 18000, disbursementStatus: 'Ongoing', lastDisbursementDate: '2026-05-01',
    totalDisbursed: 12000, address: 'Barangay San Francisco', contact: '0914-890-1234',
    history: [
      { id: 'D-017', date: '2026-02-28', beneficiary: 'Carmen Tolentino', program: 'Medical', amount: 6000, type: 'Cash', reference: 'MD-001', approvedBy: 'Fr. Antonio Reyes', notes: '3-month medication supply' },
      { id: 'D-018', date: '2026-05-01', beneficiary: 'Carmen Tolentino', program: 'Medical', amount: 6000, type: 'Cash', reference: 'MD-002', approvedBy: 'Dr. Maria Garcia', notes: 'Next 3 months medication' },
    ],
  },
  {
    id: 'BEN-008', name: 'Teresita Tan', program: 'Scholarship', dateApproved: '2026-03-15',
    amountAwarded: 22000, disbursementStatus: 'Pending', lastDisbursementDate: '',
    totalDisbursed: 0, address: 'Barangay San Francisco', contact: '0909-345-6789',
    history: [],
  },
  {
    id: 'BEN-009', name: 'Pedro Mangilit', program: 'Livelihood', dateApproved: '2026-03-10',
    amountAwarded: 8000, disbursementStatus: 'Ongoing', lastDisbursementDate: '2026-04-15',
    totalDisbursed: 4000, address: 'Barangay San Francisco', contact: '0919-567-8901',
    history: [
      { id: 'D-019', date: '2026-03-10', beneficiary: 'Pedro Mangilit', program: 'Livelihood', amount: 4000, type: 'Check', reference: 'LV-001', approvedBy: 'Mr. Jose Reyes', notes: 'Initial capital (50%)' },
      { id: 'D-020', date: '2026-04-15', beneficiary: 'Pedro Mangilit', program: 'Livelihood', amount: 2000, type: 'Cash', reference: 'LV-002', approvedBy: 'Mr. Jose Reyes', notes: 'Partial release' },
    ],
  },
  {
    id: 'BEN-010', name: 'Lourdes Pangan', program: 'Feeding', dateApproved: '2026-03-25',
    amountAwarded: 0, disbursementStatus: 'Ongoing', lastDisbursementDate: '2026-05-22',
    totalDisbursed: 900, address: 'Barangay Mangga', contact: '0911-123-4567',
    history: [
      { id: 'D-021', date: '2026-03-25', beneficiary: 'Lourdes Pangan', program: 'Feeding', amount: 450, type: 'Cash', reference: 'FD-007', approvedBy: 'Ms. Ana Lim', notes: 'March meals' },
      { id: 'D-022', date: '2026-05-22', beneficiary: 'Lourdes Pangan', program: 'Feeding', amount: 450, type: 'Cash', reference: 'FD-008', approvedBy: 'Ms. Ana Lim', notes: 'May meals' },
    ],
  },
  {
    id: 'BEN-011', name: 'Rodrigo Miranda', program: 'Livelihood', dateApproved: '2026-04-01',
    amountAwarded: 10000, disbursementStatus: 'Pending', lastDisbursementDate: '',
    totalDisbursed: 0, address: 'Barangay Mangga', contact: '0906-678-9012',
    history: [],
  },
  {
    id: 'BEN-012', name: 'Elena Garcia', program: 'Scholarship', dateApproved: '2026-04-05',
    amountAwarded: 20000, disbursementStatus: 'Ongoing', lastDisbursementDate: '2026-05-20',
    totalDisbursed: 5000, address: 'Barangay Macabebe', contact: '0917-456-7890',
    history: [
      { id: 'D-023', date: '2026-04-05', beneficiary: 'Elena Garcia', program: 'Scholarship', amount: 5000, type: 'Bank Transfer', reference: 'BPI-6789', approvedBy: 'Mrs. Elena Cruz', notes: 'Enrollment fee' },
    ],
  },
];

export const disbursements: DisbursementRecord[] = beneficiaries.flatMap(b => b.history);

export function getProgramColorClasses(program: ProgramType) {
  const map: Record<ProgramType, { bg: string; text: string; border: string; light: string }> = {
    Scholarship: { bg: 'bg-[#5B3A73]', text: 'text-[#5B3A73]', border: 'border-t-[#5B3A73]', light: 'bg-[#5B3A73]/10' },
    Medical: { bg: 'bg-[#B8322F]', text: 'text-[#B8322F]', border: 'border-t-[#B8322F]', light: 'bg-[#B8322F]/10' },
    Feeding: { bg: 'bg-[#C9963B]', text: 'text-[#C9963B]', border: 'border-t-[#C9963B]', light: 'bg-[#C9963B]/10' },
    Livelihood: { bg: 'bg-[#2D6A4F]', text: 'text-[#2D6A4F]', border: 'border-t-[#2D6A4F]', light: 'bg-[#2D6A4F]/10' },
    Emergency: { bg: 'bg-[#3B6BC9]', text: 'text-[#3B6BC9]', border: 'border-t-[#3B6BC9]', light: 'bg-[#3B6BC9]/10' },
  };
  return map[program];
}

export function getStatusBadgeClasses(status: ApplicationStatus | BeneficiaryStatus) {
  const map: Record<string, { badge: string; border: string }> = {
    'Pending Review': { badge: 'cos-badge cos-badge-warning', border: 'border-l-warning' },
    'Approved': { badge: 'cos-badge cos-badge-success', border: 'border-l-success' },
    'Rejected': { badge: 'cos-badge cos-badge-error', border: 'border-l-error' },
    'On Hold': { badge: 'cos-badge cos-badge-info', border: 'border-l-info' },
    'Active': { badge: 'cos-badge cos-badge-success', border: '' },
    'Completed': { badge: 'cos-badge cos-badge-info', border: '' },
    'Suspended': { badge: 'cos-badge cos-badge-warning', border: '' },
  };
  return map[status] || { badge: 'cos-badge cos-badge-default', border: '' };
}
