import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  Users,
  BookOpen,
  DollarSign,
  Clock,
  Plus,
  Calendar,
  FileText,
  Droplets,
  Heart,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import BackToTop from '@/components/BackToTop';
import EmptyState from '@/components/EmptyState';
import { getLabel } from '@/lib/friendlyLabels';
import {
  baptismRecords,
  marriageRecords,
  confirmationRecords,
  deathRecords,
} from '@/lib/registryData';
import { families } from '@/lib/directoryData';
import { collectionsData, approvalItems } from '@/lib/financeData';
import { SAMPLE_EVENTS } from '@/lib/calendarData';
import { getParishConfig } from '@/lib/parishConfig';

/* ─────────────────────── sample data ─────────────────────── */

const incomeExpenseData = [
  { name: 'Income', value: 128450, color: '#2D6A4F' },
  { name: 'Expenses', value: 98200, color: '#6B2737' },
];

interface MassAttendanceRow {
  date: string;
  time: string;
  attendance: number;
  officiant: string;
  notes: string;
}

const massAttendanceData: MassAttendanceRow[] = [
  { date: 'May 18, 2026', time: '6:00 AM', attendance: 340, officiant: 'Fr. Reyes', notes: 'Regular Sunday' },
  { date: 'May 18, 2026', time: '8:00 AM', attendance: 520, officiant: 'Fr. Santos', notes: 'Main Mass' },
  { date: 'May 18, 2026', time: '10:00 AM', attendance: 410, officiant: 'Fr. Reyes', notes: '' },
  { date: 'May 11, 2026', time: '6:00 AM', attendance: 310, officiant: 'Fr. Reyes', notes: '' },
  { date: 'May 11, 2026', time: '8:00 AM', attendance: 495, officiant: 'Fr. Santos', notes: 'Feast of the Ascension' },
  { date: 'May 11, 2026', time: '10:00 AM', attendance: 380, officiant: 'Fr. Reyes', notes: '' },
  { date: 'May 4, 2026', time: '6:00 AM', attendance: 325, officiant: 'Fr. Reyes', notes: '' },
  { date: 'May 4, 2026', time: '8:00 AM', attendance: 510, officiant: 'Fr. Santos', notes: '' },
  { date: 'May 4, 2026', time: '10:00 AM', attendance: 395, officiant: 'Fr. Reyes', notes: 'Youth choir present' },
  { date: 'Apr 27, 2026', time: '8:00 AM', attendance: 480, officiant: 'Fr. Reyes', notes: '' },
];

const upcomingEvents = [
  { date: 'May 21', time: '6:00 AM', title: 'Sunday Mass', type: 'Mass', color: '#3B6BC9', bgColor: 'rgba(59,107,201,0.12)' },
  { date: 'May 21', time: '9:00 AM', title: 'Baptism: Santos Family', type: 'Baptism', color: '#2D6A4F', bgColor: 'rgba(45,106,79,0.12)' },
  { date: 'May 22', time: '2:00 PM', title: 'Finance Council Meeting', type: 'General', color: '#8C8374', bgColor: 'rgba(140,131,116,0.12)' },
  { date: 'May 22', time: '3:00 PM', title: 'Wedding: Garcia-Lim', type: 'Wedding', color: '#6B2737', bgColor: 'rgba(107,39,55,0.12)' },
  { date: 'May 23', time: '4:00 PM', title: 'SSD Scholarship Review', type: 'SSDM', color: '#5B3A73', bgColor: 'rgba(91,58,115,0.12)' },
];

/* ─────────────────────── mini calendar data ─────────────────────── */

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth();
const currentDate = today.getDate();
const daysInMonth = getDaysInMonth(currentYear, currentMonth);
const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
const eventDates = [5, 12, 18, 21, 22, 23, 28];

/* ─────────────────────── easing ─────────────────────── */

const enterEase = [0, 0, 0.2, 1] as [number, number, number, number];

/* ─────────────────────── component ─────────────────────── */

export default function Dashboard() {
  const navigate = useNavigate();

  const config = useMemo(() => getParishConfig(), []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const priestName = config.parishPriest;
    if (hour >= 5 && hour < 12) return `Good morning, ${priestName}`;
    if (hour >= 12 && hour < 18) return `Good afternoon, ${priestName}`;
    return `Good evening, ${priestName}`;
  }, [config]);

  const formattedDate = format(new Date(), 'MMMM d, yyyy');

  /* ─── KPI computations ─── */
  const totalParishioners = useMemo(
    () => families.reduce((sum, f) => sum + f.members.length, 0),
    []
  );

  const sacramentsThisMonth = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return [
      ...baptismRecords,
      ...marriageRecords,
      ...confirmationRecords,
      ...deathRecords,
    ].filter((r) => {
      const dateStr =
        'dateOfBaptism' in r && r.dateOfBaptism
          ? r.dateOfBaptism
          : 'dateOfMarriage' in r && r.dateOfMarriage
            ? r.dateOfMarriage
            : 'dateOfConfirmation' in r && r.dateOfConfirmation
              ? r.dateOfConfirmation
              : 'dateOfDeath' in r && r.dateOfDeath
                ? r.dateOfDeath
                : 'dateOfBurial' in r && r.dateOfBurial
                  ? r.dateOfBurial
                  : undefined;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;
  }, []);

  const sundayCollection = useMemo(() => {
    const latest = collectionsData[collectionsData.length - 1];
    return latest ? latest.total : 0;
  }, []);

  const pendingApprovals = useMemo(
    () => approvalItems.filter((a) => a.status === 'Pending').length,
    []
  );

  /* ─── Baptism trend (12 months) ─── */
  const baptismTrend = useMemo(() => {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return months.map((month, i) => ({
      month,
      baptisms: baptismRecords.filter((r) => {
        const d = new Date(r.dateOfBaptism);
        return d.getMonth() === i;
      }).length,
    }));
  }, []);

  const totalBaptisms = useMemo(() => baptismRecords.length, []);

  /* ─── Dynamic Activity Feed ─── */
  const activityData = useMemo(() => {
    const items: Array<{
      icon: typeof Users;
      iconColor: string;
      bgColor: string;
      text: string;
      detail: string;
      time: string;
      path: string;
    }> = [];

    // Latest baptism
    const latestBaptism = [...baptismRecords].sort(
      (a, b) => new Date(b.dateOfBaptism).getTime() - new Date(a.dateOfBaptism).getTime()
    )[0];
    if (latestBaptism) {
      items.push({
        icon: Droplets,
        iconColor: '#2D6A4F',
        bgColor: 'rgba(45,106,79,0.12)',
        text: `Baptism recorded for ${latestBaptism.childFirstName} ${latestBaptism.childLastName}`,
        detail: `Registry #${latestBaptism.registryNumber}`,
        time: format(new Date(latestBaptism.dateOfBaptism), 'MMM d'),
        path: '/registry',
      });
    }

    // Latest collection
    const latestCollection = collectionsData[collectionsData.length - 1];
    if (latestCollection) {
      items.push({
        icon: DollarSign,
        iconColor: '#C9963B',
        bgColor: 'rgba(201,150,59,0.15)',
        text: `Sunday collection posted: \u20b1${latestCollection.total.toLocaleString()}`,
        detail: `${latestCollection.massTime} mass`,
        time: format(new Date(latestCollection.date), 'MMM d'),
        path: '/finance',
      });
    }

    // Latest pending approval
    const pendingApproval = approvalItems.filter((a) => a.status === 'Pending')[0];
    if (pendingApproval) {
      items.push({
        icon: FileText,
        iconColor: '#1B2A4A',
        bgColor: 'rgba(27,42,74,0.12)',
        text: `${pendingApproval.title} pending approval`,
        detail: pendingApproval.category,
        time: format(new Date(pendingApproval.date), 'MMM d'),
        path: '/finance',
      });
    }

    // Latest family
    const latestFamily = [...families].sort(
      (a, b) => parseInt(b.id.slice(1)) - parseInt(a.id.slice(1))
    )[0];
    if (latestFamily) {
      items.push({
        icon: Users,
        iconColor: '#3B6BC9',
        bgColor: 'rgba(59,107,201,0.12)',
        text: `New parishioner: ${latestFamily.familyName} Family`,
        detail: `${latestFamily.members.length} members — ${latestFamily.barangay}`,
        time: 'Recently',
        path: '/directory',
      });
    }

    // Latest event
    const latestEvent = [...SAMPLE_EVENTS].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];
    if (latestEvent) {
      items.push({
        icon: Calendar,
        iconColor: '#6B2737',
        bgColor: 'rgba(107,39,55,0.12)',
        text: `${latestEvent.title} scheduled`,
        detail: `${format(new Date(latestEvent.date), 'MMM d')} at ${latestEvent.startTime}`,
        time: format(new Date(latestEvent.date), 'MMM d'),
        path: '/calendar',
      });
    }

    return items;
  }, []);

  const massColumns = [
    { key: 'date', header: 'Date' },
    { key: 'time', header: 'Time' },
    { key: 'attendance', header: 'Attendance' },
    { key: 'officiant', header: 'Officiant' },
    { key: 'notes', header: 'Notes' },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* ─── Page Header ─── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: enterEase }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="display-lg font-playfair text-charcoal dark:text-dm-text">Dashboard</h1>
          <p className="body-md text-warm-gray dark:text-dm-text-muted mt-1">
            {greeting}
          </p>
          <p className="body-sm text-warm-gray/70 dark:text-dm-text-muted/70">
            Here&apos;s what&apos;s happening in your parish today
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="cos-badge border border-gold/30 bg-gold-glow text-gold px-4 py-2"
        >
          <span className="mono-md">{formattedDate}</span>
        </motion.div>
      </motion.div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" data-tour="dashboard-kpi">
        <StatCard
          title="Total Parishioners"
          value={totalParishioners.toLocaleString()}
          icon={Users}
          trend={{ value: '+3.2%', direction: 'up' }}
          delay={0}
          onClick={() => navigate('/directory')}
        />
        <StatCard
          title="Sacraments This Month"
          value={sacramentsThisMonth}
          icon={BookOpen}
          trend={{ value: '+12.5%', direction: 'up' }}
          delay={0.06}
          onClick={() => navigate('/registry')}
        />
        <StatCard
          title="Sunday Collection"
          value={`\u20b1${sundayCollection.toLocaleString()}`}
          icon={DollarSign}
          trend={{ value: '+8.1%', direction: 'up' }}
          delay={0.12}
          onClick={() => navigate('/finance')}
        />
        <StatCard
          title="Pending Approvals"
          value={pendingApprovals}
          icon={Clock}
          trend={{ value: 'Needs attention', direction: 'neutral', isAlert: true }}
          delay={0.18}
          onClick={() => navigate('/finance')}
        />
      </div>

      {/* ─── Quick Actions ─── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.24, duration: 0.3 }}
        className="flex flex-wrap gap-3"
        data-tour="dashboard-quick-actions"
      >
        {[
          { label: 'Add Record', icon: BookOpen, path: '/registry' },
          { label: 'Add Collection', icon: DollarSign, path: '/finance' },
          { label: 'Schedule Event', icon: Calendar, path: '/calendar' },
          { label: 'Generate Report', icon: FileText, path: '/reports' },
        ].map((action, i) => (
          <motion.button
            key={action.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.28 + i * 0.04, duration: 0.25 }}
            onClick={() => navigate(action.path)}
            className="cos-btn cos-btn-primary rounded-full px-5 py-2.5 text-sm"
          >
            <action.icon className="w-4 h-4" />
            {action.label}
          </motion.button>
        ))}
      </motion.div>

      {/* ─── Charts Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Baptism Trend (3/5) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.4, ease: enterEase }}
          className="cos-card lg:col-span-3"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="heading-lg text-charcoal dark:text-dm-text">Baptisms &mdash; 12 Month Trend</h3>
            <select className="h-8 px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text">
              <option>This year</option>
              <option>Last 6 months</option>
              <option>Last 12 months</option>
            </select>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={baptismTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="baptismFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C9963B" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#C9963B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(234,229,217,0.6)" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#8C8374', fontSize: 12 }}
                  axisLine={{ stroke: '#EAE5D9' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#8C8374', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #EAE5D9',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(27,42,74,0.12)',
                    fontSize: 13,
                  }}
                  formatter={(value: number) => [`${value} baptisms`, 'Count']}
                />
                <Area
                  type="monotone"
                  dataKey="baptisms"
                  stroke="#C9963B"
                  strokeWidth={2}
                  fill="url(#baptismFill)"
                  dot={{ fill: '#C9963B', r: 4, strokeWidth: 0 }}
                  activeDot={{ fill: '#DDB86B', r: 6, strokeWidth: 2, stroke: '#C9963B' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="body-sm text-warm-gray mt-4">Total: {totalBaptisms} baptisms</p>
        </motion.div>

        {/* Right: Income vs Expenses (2/5) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4, ease: enterEase }}
          className="cos-card lg:col-span-2 flex flex-col"
        >
          <h3 className="heading-lg text-charcoal dark:text-dm-text mb-4">Income vs Expenses</h3>
          <div className="flex-1 flex items-center justify-center" style={{ minHeight: 220 }}>
            <div className="relative">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={incomeExpenseData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {incomeExpenseData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="heading-lg text-charcoal dark:text-dm-text">
                  {'\u20b1'}128,450
                </span>
                <span className="label text-warm-gray dark:text-dm-text-muted">Net</span>
              </div>
            </div>
          </div>
          <div className="space-y-2 mt-4">
            {incomeExpenseData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="body-sm text-charcoal dark:text-dm-text">{item.name}</span>
                </div>
                <span className="mono-md text-charcoal dark:text-dm-text">
                  {'\u20b1'}{item.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ─── Activity Feed + Mini Calendar Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.48, duration: 0.4, ease: enterEase }}
          className="cos-card lg:col-span-2"
          data-tour="dashboard-activity"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="heading-lg text-charcoal dark:text-dm-text">Recent Activity</h3>
            <button
              onClick={() => navigate('/registry')}
              className="body-sm text-gold hover:text-gold-light flex items-center gap-1 transition-colors"
            >
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-0">
            {activityData.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No recent activity"
                description="As you add records, collections, and events, they will appear here."
                tip="Try adding a baptism record or a Sunday collection to get started."
              />
            ) : (
            activityData.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.52 + i * 0.05, duration: 0.3 }}
                onClick={() => navigate(item.path)}
                className="flex items-start gap-3 py-3 border-b border-parchment/40 last:border-b-0 cursor-pointer hover:bg-cream-dark/50 rounded-lg px-2 -mx-2 transition-colors dark:hover:bg-dm-surface-raised/50"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: item.bgColor }}
                >
                  <item.icon className="w-4 h-4" style={{ color: item.iconColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="body-sm font-medium text-charcoal dark:text-dm-text">{item.text}</p>
                  <p className="body-sm text-warm-gray dark:text-dm-text-muted">{item.detail}</p>
                </div>
                <span className="body-sm text-warm-gray/60 dark:text-dm-text-muted/60 shrink-0">{item.time}</span>
              </motion.div>
            )))}
          </div>
        </motion.div>

        {/* Mini Calendar + Upcoming Events */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.56, duration: 0.4, ease: enterEase }}
          className="space-y-6"
        >
          {/* Mini Calendar */}
          <div className="cos-card">
            <h3 className="heading-lg text-charcoal dark:text-dm-text mb-4">
              {format(today, 'MMMM yyyy')}
            </h3>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="label text-warm-gray text-center py-1">{d}</div>
              ))}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="h-9" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isToday = day === currentDate;
                const hasEvent = eventDates.includes(day);
                return (
                  <motion.div
                    key={day}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 + i * 0.015, duration: 0.2 }}
                    className={
                      'h-9 flex flex-col items-center justify-center rounded-lg text-sm font-medium relative ' +
                      (isToday
                        ? 'bg-gold text-white'
                        : 'text-charcoal dark:text-dm-text hover:bg-cream-dark dark:hover:bg-dm-surface-raised')
                    }
                  >
                    {day}
                    {hasEvent && !isToday && (
                      <span className="absolute bottom-1 w-1 h-1 rounded-full bg-gold" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="cos-card">
            <h3 className="heading-lg text-charcoal dark:text-dm-text mb-4">Upcoming Events</h3>
            <div className="space-y-3">
              {upcomingEvents.map((event, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.64 + i * 0.05, duration: 0.3 }}
                  className="flex items-start gap-3 cursor-pointer hover:bg-cream-dark/50 rounded-lg p-2 -mx-2 transition-colors dark:hover:bg-dm-surface-raised/50"
                >
                  <div
                    className="w-1 self-stretch rounded-full"
                    style={{ backgroundColor: event.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="cos-badge"
                        style={{ backgroundColor: event.bgColor, color: event.color }}
                      >
                        {event.type}
                      </span>
                    </div>
                    <p className="body-sm font-medium text-charcoal dark:text-dm-text truncate">{event.title}</p>
                    <p className="body-sm text-warm-gray dark:text-dm-text-muted">
                      {event.date} at {event.time}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ─── Mass Attendance Table ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.72, duration: 0.4, ease: enterEase }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="heading-lg text-charcoal dark:text-dm-text">Recent Mass Attendance</h3>
          <button
            onClick={() => navigate('/ministries')}
            className="body-sm text-gold hover:text-gold-light flex items-center gap-1 transition-colors"
          >
            View Full Records <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <DataTable
          columns={massColumns}
          data={massAttendanceData}
          sortable
          filterable={false}
          paginated
          pageSize={5}
        />
      </motion.div>

      <BackToTop />
    </div>
  );
}
