// =====================================================================
// friendlyLabels.ts — Friendly Microcopy Dictionary
// =====================================================================
//
// Friendly labels that replace intimidating jargon. Used throughout
// ChurchOS to make the app approachable for non-technical church staff.
//
// Think of this like explaining things to your 60-year-old mother who
// has never used a computer beyond PIMS (Parish Information Management
// System). Warm, patient, and never condescending.
//
// =====================================================================

/* ─── Label dictionary ─── */

export const friendlyLabels: Record<string, string> = {
  /* ── Sacramental Registry ── */
  'registry.title': 'Sacrament Records',
  'registry.subtitle': 'Keep track of baptisms, marriages, confirmations, and burials. Everything in one place — no more paper books!',
  'registry.add': 'Add New Record',
  'registry.search': 'Search by name, date, or registry number...',
  'registry.certificate': 'Print Certificate',
  'registry.empty.title': 'No baptism records yet',
  'registry.empty.description': "When you start recording baptisms, they'll appear here. Click 'Add New Record' to begin!",
  'registry.empty.tip': 'You can also search existing records by name or date.',

  /* ── Form Fields: Registry ── */
  'field.registryNumber': 'Registry Number',
  'field.registryNumber.help': 'The unique number for this record. Usually assigned automatically.',
  'field.childName': "Child's Name",
  'field.fatherName': "Father's Name",
  'field.fatherName.help': 'The child\'s father as listed on the birth certificate.',
  'field.motherName': "Mother's Name",
  'field.motherName.help': "The child's mother. Her maiden name (name before marriage) is also recorded.",
  'field.godfather': 'Godfather (Sponsor)',
  'field.godfather.help': 'A practicing Catholic who will guide the child in faith. At least one Catholic godparent is required.',
  'field.godmother': 'Godmother (Sponsor)',
  'field.godmother.help': 'A practicing Catholic who will guide the child in faith.',
  'field.godparents.canon': 'Canon 872: At least one godparent must be a confirmed, practicing Catholic.',
  'field.bookNumber': 'Book Number',
  'field.bookNumber.help': 'Which physical record book this entry goes into. Ask your secretary for the current book number.',
  'field.pageNumber': 'Page Number',
  'field.pageNumber.help': 'The page number in the record book.',
  'field.officiant': 'Officiating Priest',
  'field.officiant.help': 'The priest who performed the sacrament.',
  'field.notations': 'Official Notes',
  'field.notations.help': 'Any special notes required by church law. For example: "Condition: Sanate" for secret (private) marriages.',
  'field.notations.canon': 'Canon 1133: Notations regarding secret marriages or special conditions.',

  /* ── Finance ── */
  'finance.title': 'Finance Records',
  'finance.postToLedger': 'Save to Finance Records',
  'finance.unbalanced': "The amounts don't match yet. Total money in must equal total money out.",
  'finance.balanced': 'Looks good! The amounts match.',
  'finance.sundayCollection': 'Sunday Collection',
  'finance.sundayCollection.help': 'Record the offerings collected during Sunday Mass. Cash, checks, and digital payments (GCash) are tracked separately.',
  'finance.ceremonyFee': 'Sacrament Fee',
  'finance.ceremonyFee.help': 'Fees for baptisms, marriages, etc. Set by the parish and approved by the priest.',
  'finance.certificateFee': 'Certificate Copy Fee',
  'finance.certificateFee.help': 'Fee for additional or replacement certificates. First certificate is usually included with the sacrament.',
  'finance.empty.title': 'No finance records yet',
  'finance.empty.description': 'Record Sunday collections, expenses, and fees here. This helps track your parish finances.',
  'finance.empty.tip': 'Start by recording this Sunday\'s collection.',

  /* ── Calendar ── */
  'calendar.title': 'Calendar & Scheduling',
  'calendar.conflict': 'This time is already taken',
  'calendar.conflict.help': 'The priest or location is already booked. Try a different time, priest, or room.',
  'calendar.addEvent': 'Schedule Event',
  'calendar.empty.title': 'The calendar is quiet',
  'calendar.empty.description': 'Schedule Masses, baptisms, weddings, and meetings here. Everything appears on the calendar for everyone to see.',
  'calendar.empty.tip': 'Click "New Event" to schedule your first activity.',

  /* ── Directory ── */
  'directory.title': 'Parishioner Directory',
  'directory.empty.title': 'Your parishioner directory is empty',
  'directory.empty.description': 'Add families to keep track of who\'s in your parish. You can search by name, barangay, or phone number.',
  'directory.empty.tip': 'Start with the families who attend Mass regularly.',

  /* ── Ministries ── */
  'ministries.title': 'Ministry Management',
  'ministries.attendance': 'Attendance',
  'ministries.attendance.help': 'Mark who was present. This helps track active participation.',
  'ministries.empty.title': 'No ministry members yet',
  'ministries.empty.description': 'Add Eucharistic ministers, altar servers, choir members, and more. Track attendance and assignments.',
  'ministries.empty.tip': 'Tap any ministry card above to start adding members.',

  /* ── SSDM ── */
  'ssdm.title': 'Social Services & Development',
  'ssdm.empty.title': 'No assistance applications yet',
  'ssdm.empty.description': 'Record scholarship, medical, feeding, and livelihood program applications here.',
  'ssdm.empty.tip': 'Applications go through a review process before approval.',

  /* ── Reports ── */
  'reports.title': 'Reports',
  'reports.empty.title': 'Not enough data for reports',
  'reports.empty.description': 'Once you have sacrament records and financial entries, reports will be generated automatically.',
  'reports.empty.tip': 'Try adding some records in the Registry and Finance modules first.',

  /* ── Buttons ── */
  'btn.save': 'Save',
  'btn.cancel': 'Never mind',
  'btn.delete': 'Remove',
  'btn.edit': 'Make Changes',
  'btn.print': 'Print',
  'btn.download': 'Download',
  'btn.search': 'Find',
  'btn.filter': 'Show Options',
  'btn.export': 'Save as File',
  'btn.add': 'Add New',
  'btn.back': 'Go Back',

  /* ── General Messages ── */
  'loading': 'Just a moment...',
  'saved': 'All set! Your changes have been saved.',
  'deleted': 'Removed successfully.',
  'error': 'Oops! Something went wrong. Please try again.',
  'required': 'This field is needed to continue.',
  'welcome': 'Welcome to ChurchOS',
  'welcome.subtitle': 'Your parish management companion. Simple, friendly, and built for you.',

  /* ── Form Help Text ── */
  'help.registryNumber': 'This number is usually given automatically. You only need to change it if you are entering an old record.',
  'help.bookNumber': 'Each sacrament has its own physical book. Ask your parish secretary which book is currently being used.',
  'help.pageNumber': 'The next available page number in the book. The secretary usually keeps track of this.',
  'help.officiant': 'Select the priest who performed or will perform this sacrament.',
  'help.godparents': 'The Church requires at least one godparent who is a confirmed, practicing Catholic (Canon 872).',
  'help.notations': 'For special cases only — like secret marriages ("Condition: Sanate"). Ask the priest if unsure.',
  'help.motherMaiden': "The mother's family name before she got married. This is required for church records.",
};

/* ─── Helper: get a friendly label ─── */

export function getLabel(key: string, fallback?: string): string {
  return friendlyLabels[key] ?? fallback ?? key;
}
