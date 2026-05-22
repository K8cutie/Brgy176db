import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  User
} from 'lucide-react';
import { getPersisted } from '@/lib/store';
import { format, parseISO, isToday, isTomorrow, isThisWeek, getDay } from 'date-fns';

// --- Types (mirroring your data structures) ---
interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date
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
    day: string; // e.g., "Sunday", "Monday"
    massTime: string; // e.g., "6:00 AM", "8:00 AM"
    memberName: string;
  }[];
}

interface ActivityItem {
  id: string;
  type: 'registry' | 'collection' | 'approval' | 'directory' | 'ssdm' | 'event';
  description: string;
  detail?: string;
  date: string;
}

// --- Helpers ---
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getEventDayName(dateStr: string): string {
  const d = parseISO(dateStr);
  return DAY_NAMES[getDay(d)];
}

function normalizeTime(timeStr: string): string {
  // Normalize "6:00 AM" / "06:00" / "6am" for matching
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

// --- Ministry Icon Map ---
const MINISTRY_ICONS: Record<string, React.ReactNode> = {
  'Choir': <Music className="h-3.5 w-3.5" />,
  'Music Ministry': <Music className="h-3.5 w-3.5" />,
  'Ushers': <Users className="h-3.5 w-3.5" />,
  'Lectors': <BookOpen className="h-3.5 w-3.5" />,
  'Commentators': <Mic className="h-3.5 w-3.5" />,
  'Sacristans': <Cross className="h-3.5 w-3.5" />,
  'Altar Servers': <Cross className="h-3.5 w-3.5" />,
  'Servers': <Cross className="h-3.5 w-3.5" />,
};

function getMinistryIcon(name: string): React.ReactNode {
  for (const [key, icon] of Object.entries(MINISTRY_ICONS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return <Users className="h-3.5 w-3.5" />;
}

// --- Main Component ---
export default function Dashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [financeSummary, setFinanceSummary] = useState({
    sundayCollection: 0,
    pendingApprovals: 0,
    ytdIncome: 0,
    ytdExpenses: 0
  });

  useEffect(() => {
    // Load data from localStorage via store helpers
    const persistedEvents = getPersisted<CalendarEvent[]>('calendar_events', []);
    const persistedMinistries = getPersisted<Ministry[]>('ministries', []);
    const persistedActivities = getPersisted<ActivityItem[]>('recent_activity', []);
    const persistedFinance = getPersisted('finance_summary', {
      sundayCollection: 2250,
      pendingApprovals: 3,
      ytdIncome: 128450,
      ytdExpenses: 98200
    });

    // Sort events: upcoming first
    const now = new Date();
    const upcoming = persistedEvents
      .filter(e => parseISO(e.date) >= new Date(now.getTime() - 24 * 60 * 60 * 1000)) // Include today
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
      .slice(0, 10); // Next 10 events

    setEvents(upcoming);
    setMinistries(persistedMinistries);
    setActivities(persistedActivities.slice(0, 8));
    setFinanceSummary(persistedFinance);
  }, []);

  // Mini calendar data
  const today = new Date();
  const currentMonth = format(today, 'MMMM yyyy');
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getDay();

  const eventDates = new Set(events.map(e => e.date));

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

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button 
          onClick={() => navigate('/calendar?action=schedule')}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          Schedule Event
        </Button>
        <Button 
          onClick={() => navigate('/registry?action=add')}
          variant="outline"
          className="border-slate-300"
        >
          <FileText className="mr-2 h-4 w-4" />
          Add Record
        </Button>
        <Button 
          onClick={() => navigate('/reports')}
          variant="outline"
          className="border-slate-300"
        >
          <TrendingUp className="mr-2 h-4 w-4" />
          Generate Report
        </Button>
        <Button 
          onClick={() => navigate('/finance?tab=collections')}
          variant="outline"
          className="border-slate-300"
        >
          <DollarSign className="mr-2 h-4 w-4" />
          Add Collection
        </Button>
      </div>

      {/* MAIN GRID: Events + Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT/CENTER: Upcoming Events with Ministry Assignments (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Upcoming Events & Ministry Assignments</CardTitle>
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
                  {events.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <CalendarDays className="mx-auto h-12 w-12 mb-3 opacity-50" />
                      <p className="text-sm">No upcoming events scheduled.</p>
                      <Button 
                        variant="link" 
                        onClick={() => navigate('/calendar')}
                        className="text-amber-600 mt-2"
                      >
                        Schedule your first event
                      </Button>
                    </div>
                  ) : (
                    events.map(event => {
                      const assignments = getMinistryAssignmentsForEvent(event, ministries);
                      const hasAssignments = Object.keys(assignments).length > 0;

                      return (
                        <div 
                          key={event.id} 
                          className="rounded-lg border border-slate-200 p-4 hover:border-amber-300 hover:shadow-sm transition-all"
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
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => navigate(`/calendar?event=${event.id}`)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              Edit
                            </Button>
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
                                  No ministry assignments scheduled for this Mass.
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

                          {/* Sacrament Link */}
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
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Recent Activity</CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate('/reports')}
                  className="text-slate-500"
                >
                  View All <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="h-[250px]">
                <div className="space-y-3">
                  {activities.length === 0 ? (
                    <p className="text-center text-sm text-slate-400 py-8">No recent activity recorded.</p>
                  ) : (
                    activities.map(activity => (
                      <div key={activity.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50">
                        <div className="mt-0.5">
                          {activity.type === 'registry' && <Baby className="h-4 w-4 text-green-500" />}
                          {activity.type === 'collection' && <DollarSign className="h-4 w-4 text-blue-500" />}
                          {activity.type === 'approval' && <AlertCircle className="h-4 w-4 text-amber-500" />}
                          {activity.type === 'directory' && <Users className="h-4 w-4 text-purple-500" />}
                          {activity.type === 'ssdm' && <HandHelping className="h-4 w-4 text-pink-500" />}
                          {activity.type === 'event' && <CalendarDays className="h-4 w-4 text-slate-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900">{activity.description}</p>
                          {activity.detail && (
                            <p className="text-xs text-slate-500 mt-0.5">{activity.detail}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">{format(parseISO(activity.date), 'MMM d, h:mm a')}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT SIDEBAR: Calendar + Financial Summary (1/3 width) */}
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

          {/* Financial Summary — Compact */}
          <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-slate-50 to-white">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <CardTitle className="text-sm font-semibold">Financial Summary</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Sunday Collection</span>
                <span className="text-sm font-semibold text-slate-900">₱{financeSummary.sundayCollection.toLocaleString()}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Pending Approvals</span>
                <Badge variant={financeSummary.pendingApprovals > 0 ? 'destructive' : 'secondary'} className="text-xs">
                  {financeSummary.pendingApprovals}
                </Badge>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">YTD Net</span>
                <span className={`text-sm font-semibold ${financeSummary.ytdIncome - financeSummary.ytdExpenses >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₱{(financeSummary.ytdIncome - financeSummary.ytdExpenses).toLocaleString()}
                </span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-xs border-slate-300"
                onClick={() => navigate('/finance')}
              >
                View Finance Details
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-slate-200 p-3">
              <div className="text-2xl font-bold text-slate-900">{events.filter(e => e.type === 'Baptism').length}</div>
              <div className="text-xs text-slate-500">Baptisms This Month</div>
            </Card>
            <Card className="border-slate-200 p-3">
              <div className="text-2xl font-bold text-slate-900">{events.filter(e => e.type === 'Wedding').length}</div>
              <div className="text-xs text-slate-500">Weddings This Month</div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
