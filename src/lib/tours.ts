import type { Step } from 'react-joyride';

export interface TourConfig {
  id: string;
  title: string;
  description: string;
  targetRoles: string[]; // e.g., ['Parish Priest', 'Secretary', 'Bookkeeper', 'Finance Council']
  steps: Step[];
}

// Key tour IDs
export const TOUR_FIRST_LOGIN = 'first-login';
export const TOUR_DASHBOARD = 'dashboard';
export const TOUR_REGISTRY = 'registry';
export const TOUR_DIRECTORY = 'directory';
export const TOUR_CALENDAR = 'calendar';
export const TOUR_FINANCE = 'finance';
export const TOUR_MINISTRIES = 'ministries';
export const TOUR_SSDM = 'ssdm';
export const TOUR_REPORTS = 'reports';
export const TOUR_SETTINGS = 'settings';

// ── First Login Tour (runs once automatically) ──
export const firstLoginTour: TourConfig = {
  id: TOUR_FIRST_LOGIN,
  title: 'Welcome to ChurchOS!',
  description: 'A quick walkthrough of your new parish management system.',
  targetRoles: ['Parish Priest', 'Secretary', 'Bookkeeper', 'Finance Council'],
  steps: [
    {
      target: '.sidebar-logo',
      title: 'Welcome to ChurchOS!',
      content: 'This is your new parish management system. Everything you need is right here in the sidebar. Take a deep breath \u2014 you got this!',
      placement: 'right',
    },
    {
      target: '[data-tour="dashboard"]',
      title: 'Your Dashboard',
      content: 'This is your home base. See parishioner counts, upcoming sacraments, Sunday collections, and anything needing your attention.',
      placement: 'right',
    },
    {
      target: '[data-tour="registry"]',
      title: 'Sacramental Records',
      content: 'Record baptisms, marriages, confirmations, and funerals here. You can also print certificates \u2014 no more handwritten forms!',
      placement: 'right',
    },
    {
      target: '[data-tour="directory"]',
      title: 'Parishioner Directory',
      content: 'All your parish families in one place. Search by name, barangay, or phone number.',
      placement: 'right',
    },
    {
      target: '[data-tour="calendar"]',
      title: 'Parish Calendar',
      content: 'Schedule Masses, baptisms, weddings, meetings, and more. The calendar will warn you if something conflicts.',
      placement: 'right',
    },
    {
      target: '[data-tour="finance"]',
      title: 'Finance & Collections',
      content: 'Track Sunday collections, expenses, and approvals. Only Parish Priest and Bookkeeper have full access.',
      placement: 'right',
    },
    {
      target: '[data-tour="settings"]',
      title: 'Settings',
      content: 'Configure parish info, certificate templates, and user accounts. You can also turn off these guided tours here.',
      placement: 'right',
    },
  ],
};

// ── Dashboard Tour ──
export const dashboardTour: TourConfig = {
  id: TOUR_DASHBOARD,
  title: 'Dashboard Overview',
  description: 'Learn how to read your dashboard and use quick actions.',
  targetRoles: ['Parish Priest', 'Secretary', 'Bookkeeper', 'Finance Council'],
  steps: [
    {
      target: '[data-tour="dashboard-kpi"]',
      title: 'Your Numbers at a Glance',
      content: 'Think of this like the bulletin board in the parish office. These four cards show your most important numbers \u2014 total parishioners, sacraments this month, latest collection, and anything pending approval.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="dashboard-quick-actions"]',
      title: 'Quick Actions',
      content: 'In a hurry? These buttons let you jump straight to the most common tasks. Just click here and you\u2019ll be taken right where you need to go!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="dashboard-activity"]',
      title: 'Recent Activity',
      content: 'This shows what\u2019s been happening lately \u2014 baptisms recorded, collections posted, new families registered. It\u2019s like a logbook, but automatic!',
      placement: 'left',
    },
  ],
};

// ── Registry Tour ──
export const registryTour: TourConfig = {
  id: TOUR_REGISTRY,
  title: 'Sacramental Registry',
  description: 'How to record sacraments and generate certificates.',
  targetRoles: ['Parish Priest', 'Secretary'],
  steps: [
    {
      target: '[data-tour="registry-tabs"]',
      title: 'Four Types of Records',
      content: 'Switch between Baptism, Marriage, Confirmation, and Death records. Each has its own form and rules. No need to worry \u2014 just pick the right tab and the form will guide you!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="registry-add"]',
      title: 'Add a New Record',
      content: 'Click here to add a new sacrament record. The form will guide you through every field. You\u2019ll get the hang of it!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="registry-search"]',
      title: 'Find a Record',
      content: 'Search by name, registry number, or date. No more flipping through paper books!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="registry-certificate"]',
      title: 'Print Certificates',
      content: 'Click the certificate icon to generate and print official certificates. The parish seal and priest signature are included automatically.',
      placement: 'bottom',
    },
  ],
};

// ── Directory Tour ──
export const directoryTour: TourConfig = {
  id: TOUR_DIRECTORY,
  title: 'Parishioner Directory',
  description: 'Manage your parish families and members.',
  targetRoles: ['Parish Priest', 'Secretary', 'Bookkeeper'],
  steps: [
    {
      target: '[data-tour="directory-list"]',
      title: 'Your Parish Families',
      content: 'All your parish families are listed here. Think of this like your old family card index \u2014 but it never gets messy and you can search instantly!',
      placement: 'right',
    },
    {
      target: '[data-tour="directory-search"]',
      title: 'Search Families',
      content: 'Looking for someone? Just type a name, barangay, or phone number here. Results appear instantly \u2014 no need to scroll through pages!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="directory-add"]',
      title: 'Add a New Family',
      content: 'Just click here and fill out the form to register a new family. You can add all their members at once, too!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="directory-filter"]',
      title: 'Filter by Barangay',
      content: 'Want to see only families from a certain area? Use this filter. Great for organizing barangay Masses or outreach!',
      placement: 'bottom',
    },
  ],
};

// ── Calendar Tour ──
export const calendarTour: TourConfig = {
  id: TOUR_CALENDAR,
  title: 'Parish Calendar',
  description: 'Schedule events and manage parish activities.',
  targetRoles: ['Parish Priest', 'Secretary', 'Bookkeeper', 'Finance Council'],
  steps: [
    {
      target: '[data-tour="calendar-views"]',
      title: 'Switch Calendar Views',
      content: 'View by month, week, or day \u2014 whatever works best for you. Just click here to switch between views!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="calendar-add"]',
      title: 'Add an Event',
      content: 'Schedule a Mass, baptism, wedding, meeting, or any other event. Just click here and fill in the details. You\u2019ll get the hang of it!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="calendar-legend"]',
      title: 'Color Coding',
      content: 'Each event type has its own color. Masses are blue, baptisms green, weddings burgundy, and meetings gray. Makes it easy to see what\u2019s coming up at a glance!',
      placement: 'right',
    },
    {
      target: '[data-tour="calendar-conflict"]',
      title: 'Conflict Warning',
      content: 'If two events overlap, the calendar will warn you. No more double-booking the church!',
      placement: 'top',
    },
  ],
};

// ── Finance Tour ──
export const financeTour: TourConfig = {
  id: TOUR_FINANCE,
  title: 'Finance & Collections',
  description: 'Track collections, expenses, and approvals.',
  targetRoles: ['Parish Priest', 'Bookkeeper'],
  steps: [
    {
      target: '[data-tour="finance-collections"]',
      title: 'Sunday Collections',
      content: 'Record Sunday and special collections here. Think of this like your collection ledger \u2014 but it does the math for you!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="finance-journal"]',
      title: 'Journal Entries',
      content: 'Log expenses, donations, and other transactions. Each entry is tracked and can\u2019t be deleted without approval.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="finance-approvals"]',
      title: 'Approval Workflow',
      content: 'Only the Parish Priest can approve certain transactions. Think of this like the sign-off sheet \u2014 but digital and trackable!',
      placement: 'right',
    },
    {
      target: '[data-tour="finance-reports"]',
      title: 'Financial Reports',
      content: 'Generate income statements, balance sheets, and collection summaries. Perfect for the Finance Council meeting!',
      placement: 'bottom',
    },
  ],
};

// ── Ministries Tour ──
export const ministriesTour: TourConfig = {
  id: TOUR_MINISTRIES,
  title: 'Ministries & Liturgy',
  description: 'Manage ministry rosters, attendance, and schedules.',
  targetRoles: ['Parish Priest', 'Secretary'],
  steps: [
    {
      target: '[data-tour="ministries-roster"]',
      title: 'Ministry Rosters',
      content: 'Keep track of who serves in each ministry \u2014 lectors, choir, ushers, sacristans, and more. No more wondering who\u2019s on duty this Sunday!',
      placement: 'right',
    },
    {
      target: '[data-tour="ministries-attendance"]',
      title: 'Mass Attendance',
      content: 'Record how many attended each Mass. This helps you see trends and plan accordingly.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="ministries-schedule"]',
      title: 'Schedule Ministers',
      content: 'Assign ministers to specific Masses and dates. The system will remind you if someone is double-booked!',
      placement: 'bottom',
    },
  ],
};

// ── SSDM Tour ──
export const ssdmTour: TourConfig = {
  id: TOUR_SSDM,
  title: 'SSD & Scholarship Ministry',
  description: 'Manage outreach programs and scholarship applications.',
  targetRoles: ['Parish Priest', 'Secretary'],
  steps: [
    {
      target: '[data-tour="ssdm-programs"]',
      title: 'Programs & Projects',
      content: 'Manage your parish outreach programs \u2014 scholarship funds, feeding programs, medical missions, and more.',
      placement: 'right',
    },
    {
      target: '[data-tour="ssdm-applications"]',
      title: 'Scholarship Applications',
      content: 'Review and process student scholarship applications. Just click on an application to see all the details!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="ssdm-disbursements"]',
      title: 'Disbursements',
      content: 'Track fund releases and monitor balances. Everything is logged for transparency.',
      placement: 'bottom',
    },
  ],
};

// ── Reports Tour ──
export const reportsTour: TourConfig = {
  id: TOUR_REPORTS,
  title: 'Reports & Analytics',
  description: 'Generate reports for the diocese, parish council, and more.',
  targetRoles: ['Parish Priest', 'Secretary', 'Bookkeeper', 'Finance Council'],
  steps: [
    {
      target: '[data-tour="reports-types"]',
      title: 'Report Types',
      content: 'Choose from sacramental statistics, financial summaries, parish census, and more. There\u2019s even a report for diocesan requirements!',
      placement: 'right',
    },
    {
      target: '[data-tour="reports-preview"]',
      title: 'Preview Before Printing',
      content: 'See exactly how your report will look before you print or export it. No surprises!',
      placement: 'bottom',
    },
    {
      target: '[data-tour="reports-export"]',
      title: 'Export Options',
      content: 'Export as PDF for printing, or Excel if you need to edit further. Just click here and pick your format!',
      placement: 'bottom',
    },
  ],
};

// ── Settings Tour ──
export const settingsTour: TourConfig = {
  id: TOUR_SETTINGS,
  title: 'Settings',
  description: 'Configure parish info, users, fees, and certificate templates.',
  targetRoles: ['Parish Priest', 'Secretary', 'Bookkeeper'],
  steps: [
    {
      target: '[data-tour="settings-parish"]',
      title: 'Parish Information',
      content: 'Set your parish name, priest, address, and contact details. This info appears on certificates and reports automatically.',
      placement: 'right',
    },
    {
      target: '[data-tour="settings-users"]',
      title: 'User Accounts',
      content: 'Add or manage staff accounts. Each person gets their own login, and you control what they can see and do.',
      placement: 'right',
    },
    {
      target: '[data-tour="settings-fees"]',
      title: 'Fee Schedule',
      content: 'Set fees for baptisms, weddings, confirmations, and certificates. Only the Parish Priest and Bookkeeper can edit these.',
      placement: 'right',
    },
    {
      target: '[data-tour="settings-templates"]',
      title: 'Certificate Templates',
      content: 'Customize how certificates look. You can edit the layout, add your parish seal, and make them look just right!',
      placement: 'right',
    },
  ],
};

// ── Helper Functions ──
export function getTourStatus(tourId: string): { completed: boolean; skipped: boolean } {
  try {
    const raw = localStorage.getItem(`churchos_tour_${tourId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { completed: false, skipped: false };
}

export function markTourCompleted(tourId: string) {
  localStorage.setItem(`churchos_tour_${tourId}`, JSON.stringify({ completed: true, skipped: false }));
}

export function markTourSkipped(tourId: string) {
  localStorage.setItem(`churchos_tour_${tourId}`, JSON.stringify({ completed: false, skipped: true }));
}

export function areAllToursDisabled(): boolean {
  return localStorage.getItem('churchos_tours_disabled') === 'true';
}

export function setAllToursDisabled(disabled: boolean) {
  localStorage.setItem('churchos_tours_disabled', String(disabled));
}

export function resetTourProgress() {
  // Clear all tour progress
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('churchos_tour_')) localStorage.removeItem(key);
  });
  localStorage.removeItem('churchos_tours_disabled');
}

// ── Get available tours for current user ──
export function getAvailableTours(userRole: string): TourConfig[] {
  const allTours = [
    firstLoginTour, dashboardTour, registryTour, directoryTour,
    calendarTour, financeTour, ministriesTour,
    ssdmTour, reportsTour, settingsTour,
  ];
  return allTours.filter(t => t.targetRoles.includes(userRole));
}

// ── Check if first login tour should run ──
export function shouldRunFirstLogin(): boolean {
  if (areAllToursDisabled()) return false;
  const status = getTourStatus(TOUR_FIRST_LOGIN);
  return !status.completed && !status.skipped;
}
