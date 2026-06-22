import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  CalendarDays, 
  Users, 
  Music, 
  BookOpen, 
  HandHelping,
  Cross,
  Mic,
  Baby,
  Heart,
  Church,
  FileText,
  TrendingUp,
  DollarSign,
  AlertCircle,
  ChevronRight,
  Clock,
  MapPin,
  User,
  Plus,
  BarChart3,
  Settings,
  Sparkles
} from 'lucide-react';
import * as ns from '@/lib/storageNamespaced';
import { KEYS } from '@/lib/storageKeys';
import { format, parseISO, isToday, isTomorrow, isThisWeek, getDay, addDays } from 'date-fns';

// --- Types ---
interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string;
  location: string;
  officiant?: string;
  type: 'Mass' | 'Baptism' | 'Wedding' | 'Confirmation' | 'Funeral' | 'Meeting' | 'SSDM' | 'General';
  sacramentRecordId?: string;
  notes?: string;
}

interface Ministry {
  id: string;
  name: string;
  members: string[];
  scheduleAssignments: {
    day: string;
    massTime: string;
    memberName: string;
  }[];
}

// --- Helpers ---
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getEventDayName(dateStr: string): string {
  const d = parseISO(dateStr);
  return DAY_NAMES[getDay(d)];
}

function normalizeTime(timeStr: string): string {
  return timeStr.trim().toUpperCase().replace(/\s+/g, ' ');
}

function getMinistryAssignmentsForEvent(event: CalendarEvent, ministries: Ministry[]): Record<string, string[]> {
  if (event.type !== 'Mass') return {};
  const eventDay = getEventDayName(event.date);
  const eventTime = normalizeTime(event.startTime);
  const assignments: Record<string, string[]> = {};
  ministries.forEach(ministry => {
    const matched = ministry.scheduleAssignments.filter(
      sa => sa.day === eventDay && normalizeTime(sa.massTime) === eventTime
    );
    if (matched.length > 0) {
      assignments[ministry.name] = matched.map(m => m.memberName);
    }
  });
  return assignments;
}

function getEventIcon(type: CalendarEvent['type']) {
  switch (type) {
    case 'Mass': return <Church className="h-4 w-4" />;
    case 'Baptism': return <Baby className="h-4 w-4" />;
    case 'Wedding': return <Heart className="h-4 w-4" />;
    case 'Funeral': return <Cross className="h-4 w-4" />;
    case 'SSDM': return <HandHelping className="h-4 w-4" />;
    default: return <CalendarDays className="h-4 w-4" />;
  }
}

function getEventBadgeColor(type: CalendarEvent['type']) {
  switch (type) {
    case 'Mass': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Baptism': return 'bg-green-100 text-green-800 border-green-200';
    case 'Wedding': return 'bg-pink-100 text-pink-800 border-pink-200';
    case 'Funeral': return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'SSDM': return 'bg-purple-100 text-purple-800 border-purple-200';
    default: return 'bg-amber-100 text-amber-800 border-amber-200';
  }
}

function formatEventDate(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  if (isThisWeek(d)) return format(d, 'EEEE');
  return format(d, 'MMM d');
}

const MINISTRY_ICONS: Record<string, React.ReactNode> = {
  'Choir': <Music className="h-5 w-5" />,
  'Music Ministry': <Music className="h-5 w-5" />,
  'Ushers': <Users className="h-5 w-5" />,
  'Lectors': <BookOpen className="h-5 w-5" />,
  'Commentators': <Mic className="h-5 w-5" />,
  'Sacristans': <Cross className="h-5 w-5" />,
  'Altar Servers': <Cross className="h-5 w-5" />,
  'Servers': <Cross className="h-5 w-5" />,
};

function getMinistryIcon(name: string): React.ReactNode {
  for (const [key, icon] of Object.entries(MINISTRY_ICONS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return <Users className="h-5 w-5" />;
}

// Generate default Mass schedule for today if no events exist
function getDefaultTodayEvents(): CalendarEvent[] {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const dayName = DAY_NAMES[getDay(today)];

  // Common Philippine parish Mass schedules
  const defaultMasses: CalendarEvent[] = [
    {
      id: `default-mass-1-${todayStr}`,
      title: `Sunday Mass (${dayName})`,
      date: todayStr,
      startTime: '6:00 AM',
      endTime: '7:00 AM',
      location: 'Main Church',
      officiant: 'Parish Priest',
      type: 'Mass',
      notes: 'Regular schedule'
    },
    {
      id: `default-mass-2-${todayStr}`,
      title: `Sunday Mass (${dayName})`,
      date: todayStr,
      startTime: '8:00 AM',
      endTime: '9:00 AM',
      location: 'Main Church',
      officiant: 'Parish Priest',
      type: 'Mass',
      notes: 'Regular schedule'
    },
    {
      id: `default-mass-3-${todayStr}`,
      title: `Sunday Mass (${dayName})`,
      date: todayStr,
      startTime: '10:00 AM',
      endTime: '11:00 AM',
      location: 'Main Church',
      officiant: 'Parish Priest',
      type: 'Mass',
      notes: 'Regular schedule'
    },
    {
      id: `default-mass-4-${todayStr}`,
      title: `Sunday Mass (${dayName})`,
      date: todayStr,
      startTime: '5:00 PM',
      endTime: '6:00 PM',
      location: 'Main Church',
      officiant: 'Parish Priest',
      type: 'Mass',
      notes: 'Regular schedule'
    }
  ];

  // Filter based on day of week - weekday masses are fewer
  if (dayName === 'Sunday') {
    return defaultMasses;
  } else if (dayName === 'Saturday') {
    return [defaultMasses[3]]; // Only evening Mass
  } else {
    // Weekday - morning and evening
    return [defaultMasses[0], defaultMasses[3]];
  }
}

// Quick Action Card Component
function QuickActionCard({ 
  icon, 
  title, 
  description, 
  onClick, 
  color 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 text-left
        transition-all duration-200 hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5
        focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2
        w-full
      `}
    >
      <div className={`
        mb-4 inline-flex items-center justify-center rounded-xl p-3
        ${color}
      `}>
        {icon}
      </div>
      <h3 className="font-semibold text-slate-900 group-hover:text-amber-700 transition-colors">
        {title}
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        {description}
      </p>
      <div className="mt-4 flex items-center text-sm font-medium text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
        Get started <ChevronRight className="ml-1 h-4 w-4" />
      </div>
    </button>
  );
}

// Ministry Schedule Box Component
function MinistryScheduleBox({ ministry, todayDay }: { ministry: Ministry; todayDay: string }) {
  const todayAssignments = ministry.scheduleAssignments.filter(sa => sa.day === todayDay);

  return (
    <Card className="border-slate-200 hover:border-amber-300 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="text-amber-600">{getMinistryIcon(ministry.name)}</div>
          <CardTitle className="text-base font-semibold">{ministry.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {todayAssignments.length > 0 ? (
          <div className="space-y-2">
            {todayAssignments.map((assignment, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {assignment.massTime}
                </span>
                <span className="font-medium text-slate-900">{assignment.memberName}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-400 py-2">
            No assignments scheduled for {todayDay}.
          </div>
        )}
        <div className="mt-3 text-xs text-slate-400">
          {ministry.members.length} members total
        </div>
      </CardContent>
    </Card>
  );
}

// --- Main Component ---
export default function Dashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [hasRealEvents, setHasRealEvents] = useState(false);

  const today = new Date();
  const todayDayName = DAY_NAMES[getDay(today)];
  const currentMonth = format(today, 'MMMM yyyy');
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getDay();

  useEffect(() => {
    const persistedEvents = ns.getJSON<CalendarEvent[]>(KEYS.calendarEvents, []);
    const persistedMinistries = ns.getJSON<Ministry[]>(KEYS.ministries, []);

    const now = new Date();
    const upcoming = persistedEvents
      .filter(e => parseISO(e.date) >= new Date(now.getTime() - 24 * 60 * 60 * 1000))
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
      .slice(0, 10);

    if (upcoming.length > 0) {
      setEvents(upcoming);
      setHasRealEvents(true);
    } else {
      // Show default Mass schedule for today
      setEvents(getDefaultTodayEvents());
      setHasRealEvents(false);
    }

    setMinistries(persistedMinistries);
  }, []);

  const eventDates = new Set(events.map(e => e.date));

  // Quick action items
  const quickActions = [
    {
      icon: <CalendarDays className="h-6 w-6" />,
      title: 'Schedule Event',
      description: 'Plan Masses, weddings, baptisms, and parish meetings.',
      onClick: () => navigate('/calendar?action=schedule'),
      color: 'bg-amber-100 text-amber-700'
    },
    {
      icon: <FileText className="h-6 w-6" />,
      title: 'Add Record',
      description: 'Register baptisms, confirmations, marriages, and deaths.',
      onClick: () => navigate('/registry?action=add'),
      color: 'bg-blue-100 text-blue-700'
    },
    {
      icon: <TrendingUp className="h-6 w-6" />,
      title: 'Generate Report',
      description: 'Create financial, sacramental, and attendance reports.',
      onClick: () => navigate('/reports'),
      color: 'bg-green-100 text-green-700'
    },
    {
      icon: <DollarSign className="h-6 w-6" />,
      title: 'Add Collection',
      description: 'Record Sunday collections, donations, and special offerings.',
      onClick: () => navigate('/finance?tab=collections'),
      color: 'bg-purple-100 text-purple-700'
    }
  ];

  return (
    <div className="space-y-6 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Good {format(today, 'EEEE')}. Here is what is happening in your parish.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">{format(today, 'EEEE, MMMM d, yyyy')}</p>
          <p className="text-xs text-slate-500">{format(today, 'h:mm a')}</p>
        </div>
      </div>

      {/* Quick Actions — Icon Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((action, idx) => (
          <QuickActionCard key={idx} {...action} />
        ))}
      </div>

      {/* MAIN GRID: Events + Calendar + Ministry Schedules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT/CENTER: Upcoming Events (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">
                    {hasRealEvents ? 'Upcoming Events & Ministry Assignments' : "Today's Mass Schedule"}
                  </CardTitle>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate('/calendar')}
                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                >
                  View Calendar <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {events.map(event => {
                    const assignments = getMinistryAssignmentsForEvent(event, ministries);
                    const hasAssignments = Object.keys(assignments).length > 0;
                    const isDefault = !hasRealEvents;

                    return (
                      <div 
                        key={event.id} 
                        className={`rounded-lg border p-4 transition-all ${
                          isDefault 
                            ? 'border-dashed border-slate-300 bg-slate-50/50 hover:border-amber-300' 
                            : 'border-slate-200 hover:border-amber-300 hover:shadow-sm'
                        }`}
                      >
                        {/* Event Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${getEventBadgeColor(event.type)}`}>
                              {getEventIcon(event.type)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-slate-900">{event.title}</h3>
                                <Badge variant="outline" className={getEventBadgeColor(event.type)}>
                                  {event.type}
                                </Badge>
                                {isDefault && (
                                  <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 text-xs">
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    Default Schedule
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {formatEventDate(event.date)} at {event.startTime}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {event.location}
                                </span>
                                {event.officiant && (
                                  <span className="flex items-center gap-1">
                                    <User className="h-3.5 w-3.5" />
                                    Fr. {event.officiant}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {!isDefault && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => navigate(`/calendar?event=${event.id}`)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              Edit
                            </Button>
                          )}
                        </div>

                        {/* Ministry Assignments */}
                        {event.type === 'Mass' && (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                              Serving Today
                            </p>
                            {hasAssignments ? (
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(assignments).map(([ministryName, members]) => (
                                  <div 
                                    key={ministryName}
                                    className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 text-sm"
                                  >
                                    <span className="text-amber-600">{getMinistryIcon(ministryName)}</span>
                                    <span className="font-medium text-slate-700">{ministryName}:</span>
                                    <span className="text-slate-600">{members.join(', ')}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-md px-3 py-2">
                                <AlertCircle className="h-4 w-4" />
                                {isDefault 
                                  ? 'Assign ministries to see who is serving today.' 
                                  : 'No ministry assignments scheduled for this Mass.'}
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  onClick={() => navigate('/ministries')}
                                  className="text-amber-700 p-0 h-auto"
                                >
                                  Assign ministries
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {event.sacramentRecordId && (
                          <div className="mt-2 text-sm">
                            <Button 
                              variant="link" 
                              size="sm"
                              onClick={() => navigate(`/registry?id=${event.sacramentRecordId}`)}
                              className="text-blue-600 p-0 h-auto"
                            >
                              View sacrament record →
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Ministry Schedule Boxes */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-amber-600" />
                Ministry Schedules — {todayDayName}
              </h2>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/ministries')}
                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              >
                Manage Ministries <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            {ministries.length === 0 ? (
              <Card className="border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
                <Users className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No ministries set up yet.</p>
                <p className="text-sm text-slate-400 mt-1">Create ministries like Choir, Ushers, Lectors to see schedules here.</p>
                <Button 
                  onClick={() => navigate('/ministries')}
                  className="mt-4 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Ministry
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ministries.map(ministry => (
                  <MinistryScheduleBox 
                    key={ministry.id} 
                    ministry={ministry} 
                    todayDay={todayDayName}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR: Calendar + Quick Stats (1/3 width) */}
        <div className="space-y-6">

          {/* Mini Calendar */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-center">{currentMonth}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500 mb-2">
                {['S','M','T','W','T','F','S'].map(d => (
                  <div key={d} className="py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-8" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = format(new Date(today.getFullYear(), today.getMonth(), dayNum), 'yyyy-MM-dd');
                  const hasEvent = eventDates.has(dateStr);
                  const isTodayDate = dayNum === today.getDate();

                  return (
                    <div 
                      key={dayNum}
                      className={`
                        h-8 flex items-center justify-center rounded-md text-sm relative
                        ${isTodayDate ? 'bg-amber-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-50'}
                        ${hasEvent && !isTodayDate ? 'font-semibold text-amber-700' : ''}
                      `}
                    >
                      {dayNum}
                      {hasEvent && !isTodayDate && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500" />
                      )}
                    </div>
                  );
                })}
              </div>
              <Button 
                variant="ghost" 
                className="w-full mt-3 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                onClick={() => navigate('/calendar')}
              >
                Open Full Calendar <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-slate-200 p-3 text-center hover:border-amber-300 transition-colors">
              <div className="text-2xl font-bold text-slate-900">{events.filter(e => e.type === 'Baptism').length}</div>
              <div className="text-xs text-slate-500">Baptisms</div>
            </Card>
            <Card className="border-slate-200 p-3 text-center hover:border-amber-300 transition-colors">
              <div className="text-2xl font-bold text-slate-900">{events.filter(e => e.type === 'Wedding').length}</div>
              <div className="text-xs text-slate-500">Weddings</div>
            </Card>
            <Card className="border-slate-200 p-3 text-center hover:border-amber-300 transition-colors">
              <div className="text-2xl font-bold text-slate-900">{ministries.length}</div>
              <div className="text-xs text-slate-500">Ministries</div>
            </Card>
            <Card className="border-slate-200 p-3 text-center hover:border-amber-300 transition-colors">
              <div className="text-2xl font-bold text-slate-900">{events.filter(e => e.type === 'Mass').length}</div>
              <div className="text-xs text-slate-500">Masses</div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
