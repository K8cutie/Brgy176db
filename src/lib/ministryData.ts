export type MinistryAccent = 'gold' | 'blue' | 'purple' | 'green' | 'orange';

export interface MinistryMember {
  id: string;
  name: string;
  role: string;
  contact: string;
  dateJoined: string;
  status: 'Active' | 'Inactive' | 'On Leave' | 'Trainee';
  notes?: string;
  age?: number; // for altar servers
  section?: string; // for choir
}

export interface Ministry {
  id: string;
  name: string;
  accent: MinistryAccent;
  memberCount: number;
  activeAssignments: number;
  coordinator: string;
  schedule: string;
  members: MinistryMember[];
  scheduleAssignments: ScheduleAssignment[];
  attendance: AttendanceRecord[];
}

export interface ScheduleAssignment {
  id: string;
  day: string; // Mon, Tue, Wed, Thu, Fri, Sat, Sun
  massTime: string; // 6:00 AM, 8:00 AM, 10:00 AM, 6:00 PM
  memberName: string;
  position?: number;
}

export interface AttendanceRecord {
  memberId: string;
  memberName: string;
  dates: { date: string; present: boolean }[];
}

const ACCENT_COLORS: Record<MinistryAccent, { bg: string; text: string; border: string; light: string }> = {
  gold: { bg: '#C9963B', text: '#FFFFFF', border: '#C9963B', light: 'rgba(201,150,59,0.12)' },
  blue: { bg: '#3B6BC9', text: '#FFFFFF', border: '#3B6BC9', light: 'rgba(59,107,201,0.12)' },
  purple: { bg: '#5B3A73', text: '#FFFFFF', border: '#5B3A73', light: 'rgba(91,58,115,0.12)' },
  green: { bg: '#2D6A4F', text: '#FFFFFF', border: '#2D6A4F', light: 'rgba(45,106,79,0.12)' },
  orange: { bg: '#D4853B', text: '#FFFFFF', border: '#D4853B', light: 'rgba(212,133,59,0.12)' },
};

export function getAccentColor(accent: MinistryAccent) {
  return ACCENT_COLORS[accent];
}

export const MINISTRIES: Ministry[] = [
  {
    id: 'eucharistic',
    name: 'Eucharistic Ministers',
    accent: 'gold',
    memberCount: 12,
    activeAssignments: 8,
    coordinator: 'Carlos Mendoza',
    schedule: 'Sundays, all Masses',
    members: [
      { id: 'em1', name: 'Carlos Mendoza', role: 'Head', contact: '0917-123-4567', dateJoined: '2019-03-15', status: 'Active' },
      { id: 'em2', name: 'Ana Bautista', role: 'Coordinator', contact: '0918-234-5678', dateJoined: '2020-01-10', status: 'Active' },
      { id: 'em3', name: 'Pedro Reyes', role: 'Member', contact: '0919-345-6789', dateJoined: '2020-06-22', status: 'Active' },
      { id: 'em4', name: 'Maria Cruz', role: 'Member', contact: '0917-456-7890', dateJoined: '2021-02-14', status: 'Active' },
      { id: 'em5', name: 'Jose Santos', role: 'Member', contact: '0918-567-8901', dateJoined: '2021-08-05', status: 'Active' },
      { id: 'em6', name: 'Lucia Lim', role: 'Member', contact: '0919-678-9012', dateJoined: '2022-01-20', status: 'Active' },
      { id: 'em7', name: 'Roberto Tan', role: 'Member', contact: '0917-789-0123', dateJoined: '2022-04-18', status: 'Active' },
      { id: 'em8', name: 'Elena Garcia', role: 'Member', contact: '0918-890-1234', dateJoined: '2023-03-08', status: 'Active' },
      { id: 'em9', name: 'Miguel Rivera', role: 'Member', contact: '0919-901-2345', dateJoined: '2023-07-15', status: 'Inactive' },
      { id: 'em10', name: 'Carmen Ocampo', role: 'Member', contact: '0917-012-3456', dateJoined: '2024-01-12', status: 'Active' },
      { id: 'em11', name: 'Antonio Reyes', role: 'Trainee', contact: '0918-123-4567', dateJoined: '2024-09-01', status: 'Active' },
      { id: 'em12', name: 'Sofia Bautista', role: 'Trainee', contact: '0919-234-5678', dateJoined: '2025-01-15', status: 'Active' },
    ],
    scheduleAssignments: [
      { id: 'sa1', day: 'Sun', massTime: '6:00 AM', memberName: 'Carlos Mendoza' },
      { id: 'sa2', day: 'Sun', massTime: '8:00 AM', memberName: 'Ana Bautista' },
      { id: 'sa3', day: 'Sun', massTime: '10:00 AM', memberName: 'Pedro Reyes' },
      { id: 'sa4', day: 'Sun', massTime: '6:00 PM', memberName: 'Maria Cruz' },
      { id: 'sa5', day: 'Mon', massTime: '6:00 PM', memberName: 'Jose Santos' },
      { id: 'sa6', day: 'Tue', massTime: '6:00 PM', memberName: 'Lucia Lim' },
      { id: 'sa7', day: 'Wed', massTime: '6:00 PM', memberName: 'Roberto Tan' },
      { id: 'sa8', day: 'Thu', massTime: '6:00 PM', memberName: 'Elena Garcia' },
    ],
    attendance: [
      { memberId: 'em1', memberName: 'Carlos Mendoza', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: false }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'em2', memberName: 'Ana Bautista', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: false },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: false },
      ]},
      { memberId: 'em3', memberName: 'Pedro Reyes', dates: [
        { date: '2026-04-20', present: false }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: false },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'em4', memberName: 'Maria Cruz', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: false }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'em5', memberName: 'Jose Santos', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'em6', memberName: 'Lucia Lim', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: false }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: false },
      ]},
    ],
  },
  {
    id: 'altar',
    name: 'Altar Servers',
    accent: 'blue',
    memberCount: 8,
    activeAssignments: 5,
    coordinator: 'Fr. Cruz',
    schedule: 'Sundays, all Masses; First Saturday devotions',
    members: [
      { id: 'as1', name: 'Daniel Cruz', role: 'Head Server', contact: '0917-111-2222', dateJoined: '2021-06-01', status: 'Active', age: 17 },
      { id: 'as2', name: 'Matthew Santos', role: 'Senior Server', contact: '0918-222-3333', dateJoined: '2022-02-15', status: 'Active', age: 16 },
      { id: 'as3', name: 'Joshua Reyes', role: 'Server', contact: '0919-333-4444', dateJoined: '2023-01-10', status: 'Active', age: 14 },
      { id: 'as4', name: 'Gabriel Lim', role: 'Server', contact: '0917-444-5555', dateJoined: '2023-03-20', status: 'Active', age: 13 },
      { id: 'as5', name: 'Raphael Bautista', role: 'Server', contact: '0918-555-6666', dateJoined: '2023-07-01', status: 'Active', age: 12 },
      { id: 'as6', name: 'Michael Garcia', role: 'Server', contact: '0919-666-7777', dateJoined: '2024-01-15', status: 'Active', age: 11 },
      { id: 'as7', name: 'Luke Mendoza', role: 'Trainee', contact: '0917-777-8888', dateJoined: '2024-06-01', status: 'Active', age: 10 },
      { id: 'as8', name: 'John Rivera', role: 'Trainee', contact: '0918-888-9999', dateJoined: '2025-01-20', status: 'Inactive', age: 10 },
    ],
    scheduleAssignments: [
      { id: 'asg1', day: 'Sun', massTime: '6:00 AM', memberName: 'Daniel Cruz' },
      { id: 'asg2', day: 'Sun', massTime: '8:00 AM', memberName: 'Matthew Santos' },
      { id: 'asg3', day: 'Sun', massTime: '10:00 AM', memberName: 'Joshua Reyes' },
      { id: 'asg4', day: 'Sun', massTime: '6:00 PM', memberName: 'Gabriel Lim' },
      { id: 'asg5', day: 'Sat', massTime: '6:00 PM', memberName: 'Raphael Bautista' },
    ],
    attendance: [
      { memberId: 'as1', memberName: 'Daniel Cruz', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: false },
      ]},
      { memberId: 'as2', memberName: 'Matthew Santos', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: false },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'as3', memberName: 'Joshua Reyes', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: false }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'as4', memberName: 'Gabriel Lim', dates: [
        { date: '2026-04-20', present: false }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: false },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'as5', memberName: 'Raphael Bautista', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: false }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'as6', memberName: 'Michael Garcia', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: false },
      ]},
    ],
  },
  {
    id: 'choir',
    name: 'Choir',
    accent: 'purple',
    memberCount: 15,
    activeAssignments: 8,
    coordinator: 'Jose Santos',
    schedule: 'Sundays — 8AM & 10AM Mass; Thursday rehearsals 7PM',
    members: [
      { id: 'ch1', name: 'Jose Santos', role: 'Choirmaster', contact: '0917-999-0000', dateJoined: '2018-01-15', status: 'Active' },
      { id: 'ch2', name: 'Maria Reyes', role: 'Soprano Lead', contact: '0918-000-1111', dateJoined: '2019-03-10', status: 'Active', section: 'Soprano' },
      { id: 'ch3', name: 'Ana Cruz', role: 'Soprano', contact: '0919-111-2222', dateJoined: '2020-06-01', status: 'Active', section: 'Soprano' },
      { id: 'ch4', name: 'Carmen Bautista', role: 'Alto Lead', contact: '0917-222-3333', dateJoined: '2019-05-20', status: 'Active', section: 'Alto' },
      { id: 'ch5', name: 'Lucia Garcia', role: 'Alto', contact: '0918-333-4444', dateJoined: '2020-08-15', status: 'Active', section: 'Alto' },
      { id: 'ch6', name: 'Pedro Mendoza', role: 'Tenor Lead', contact: '0919-444-5555', dateJoined: '2020-01-10', status: 'Active', section: 'Tenor' },
      { id: 'ch7', name: 'Carlos Lim', role: 'Tenor', contact: '0917-555-6666', dateJoined: '2021-03-22', status: 'Active', section: 'Tenor' },
      { id: 'ch8', name: 'Roberto Tan', role: 'Bass', contact: '0918-666-7777', dateJoined: '2021-07-01', status: 'Active', section: 'Bass' },
      { id: 'ch9', name: 'Miguel Rivera', contact: '0919-901-2345', dateJoined: '2023-07-15', role: 'Member', status: 'Inactive' },
      { id: 'ch10', name: 'Carmen Ocampo', contact: '0917-012-3456', dateJoined: '2024-01-12', role: 'Member', status: 'Active' },
      { id: 'ch11', name: 'Elena Ocampo', role: 'Soprano', contact: '0917-777-8888', dateJoined: '2022-04-10', status: 'On Leave', section: 'Soprano' },
      { id: 'ch12', name: 'Miguel Garcia', role: 'Tenor', contact: '0918-888-9999', dateJoined: '2023-01-20', status: 'Active', section: 'Tenor' },
      { id: 'ch13', name: 'Sofia Reyes', role: 'Alto', contact: '0919-999-0000', dateJoined: '2023-09-01', status: 'Active', section: 'Alto' },
      { id: 'ch14', name: 'Gabriel Santos', role: 'Bass', contact: '0917-000-1111', dateJoined: '2024-01-15', status: 'Active', section: 'Bass' },
      { id: 'ch15', name: 'Daniela Cruz', role: 'Soprano', contact: '0918-111-2222', dateJoined: '2024-06-01', status: 'Trainee', section: 'Soprano' },
    ],
    scheduleAssignments: [
      { id: 'cs1', day: 'Sun', massTime: '8:00 AM', memberName: 'Jose Santos' },
      { id: 'cs2', day: 'Sun', massTime: '10:00 AM', memberName: 'Maria Reyes' },
      { id: 'cs3', day: 'Thu', massTime: '7:00 PM', memberName: 'Full Choir' },
    ],
    attendance: [
      { memberId: 'ch1', memberName: 'Jose Santos', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: false },
      ]},
      { memberId: 'ch2', memberName: 'Maria Reyes', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: false },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'ch3', memberName: 'Ana Cruz', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: false }, { date: '2026-05-11', present: false },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'ch4', memberName: 'Carmen Bautista', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: false }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'ch6', memberName: 'Pedro Mendoza', dates: [
        { date: '2026-04-20', present: false }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'ch7', memberName: 'Carlos Lim', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: false },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
    ],
  },
  {
    id: 'lectors',
    name: 'Lectors',
    accent: 'green',
    memberCount: 6,
    activeAssignments: 5,
    coordinator: 'Miguel Rivera',
    schedule: 'Sundays — rotating schedule for all Masses',
    members: [
      { id: 'le1', name: 'Miguel Rivera', role: 'Head Lector', contact: '0919-123-4567', dateJoined: '2020-02-01', status: 'Active' },
      { id: 'le2', name: 'Sofia Mendoza', role: 'Lector — 6AM', contact: '0917-234-5678', dateJoined: '2021-04-15', status: 'Active' },
      { id: 'le3', name: 'Antonio Garcia', role: 'Lector — 8AM', contact: '0918-345-6789', dateJoined: '2021-09-10', status: 'Active' },
      { id: 'le4', name: 'Elena Cruz', role: 'Lector — 10AM', contact: '0919-456-7890', dateJoined: '2022-03-01', status: 'Active' },
      { id: 'le5', name: 'Roberto Santos', role: 'Lector — 6PM', contact: '0917-567-8901', dateJoined: '2022-06-20', status: 'Active' },
      { id: 'le6', name: 'Carmen Reyes', role: 'Trainee', contact: '0918-678-9012', dateJoined: '2025-01-10', status: 'Active' },
    ],
    scheduleAssignments: [
      { id: 'ls1', day: 'Sun', massTime: '6:00 AM', memberName: 'Sofia Mendoza' },
      { id: 'ls2', day: 'Sun', massTime: '8:00 AM', memberName: 'Antonio Garcia' },
      { id: 'ls3', day: 'Sun', massTime: '10:00 AM', memberName: 'Elena Cruz' },
      { id: 'ls4', day: 'Sun', massTime: '6:00 PM', memberName: 'Roberto Santos' },
    ],
    attendance: [
      { memberId: 'le1', memberName: 'Miguel Rivera', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'le2', memberName: 'Sofia Mendoza', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: false },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'le3', memberName: 'Antonio Garcia', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: false }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: false },
      ]},
      { memberId: 'le4', memberName: 'Elena Cruz', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: false },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'le5', memberName: 'Roberto Santos', dates: [
        { date: '2026-04-20', present: false }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'le6', memberName: 'Carmen Reyes', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: false }, { date: '2026-05-25', present: true },
      ]},
    ],
  },
  {
    id: 'ushers',
    name: 'Ushers',
    accent: 'orange',
    memberCount: 10,
    activeAssignments: 7,
    coordinator: 'Roberto Tan',
    schedule: 'Sundays, all Masses; special events',
    members: [
      { id: 'us1', name: 'Roberto Tan', role: 'Head Usher', contact: '0917-888-9999', dateJoined: '2019-01-15', status: 'Active' },
      { id: 'us2', name: 'Jose Garcia', role: 'Usher — Collection', contact: '0918-999-0000', dateJoined: '2020-05-20', status: 'Active' },
      { id: 'us3', name: 'Pedro Mendoza', role: 'Usher — Greeter', contact: '0919-000-1111', dateJoined: '2020-08-01', status: 'Active' },
      { id: 'us4', name: 'Ana Santos', role: 'Usher — Greeter', contact: '0917-111-2222', dateJoined: '2021-02-14', status: 'Active' },
      { id: 'us5', name: 'Carlos Reyes', role: 'Usher', contact: '0918-222-3333', dateJoined: '2021-06-10', status: 'Active' },
      { id: 'us6', name: 'Maria Bautista', role: 'Usher — Collection', contact: '0919-333-4444', dateJoined: '2022-01-20', status: 'Active' },
      { id: 'us7', name: 'Lucia Cruz', role: 'Usher', contact: '0917-444-5555', dateJoined: '2022-07-15', status: 'Active' },
      { id: 'us8', name: 'Antonio Lim', role: 'Usher', contact: '0918-555-6666', dateJoined: '2023-03-01', status: 'Inactive' },
      { id: 'us9', name: 'Elena Garcia', role: 'Usher', contact: '0919-666-7777', dateJoined: '2023-09-10', status: 'Active' },
      { id: 'us10', name: 'Gabriel Santos', role: 'Usher', contact: '0917-777-8888', dateJoined: '2024-01-05', status: 'Active' },
    ],
    scheduleAssignments: [
      { id: 'ush1', day: 'Sun', massTime: '6:00 AM', memberName: 'Roberto Tan' },
      { id: 'ush2', day: 'Sun', massTime: '8:00 AM', memberName: 'Jose Garcia' },
      { id: 'ush3', day: 'Sun', massTime: '10:00 AM', memberName: 'Pedro Mendoza' },
      { id: 'ush4', day: 'Sun', massTime: '6:00 PM', memberName: 'Ana Santos' },
    ],
    attendance: [
      { memberId: 'us1', memberName: 'Roberto Tan', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: false }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'us2', memberName: 'Jose Garcia', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: false },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'us3', memberName: 'Pedro Mendoza', dates: [
        { date: '2026-04-20', present: false }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: false },
      ]},
      { memberId: 'us4', memberName: 'Ana Santos', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'us5', memberName: 'Carlos Reyes', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: false },
        { date: '2026-05-04', present: true }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: false }, { date: '2026-05-25', present: true },
      ]},
      { memberId: 'us6', memberName: 'Maria Bautista', dates: [
        { date: '2026-04-20', present: true }, { date: '2026-04-27', present: true },
        { date: '2026-05-04', present: false }, { date: '2026-05-11', present: true },
        { date: '2026-05-18', present: true }, { date: '2026-05-25', present: true },
      ]},
    ],
  },
];
