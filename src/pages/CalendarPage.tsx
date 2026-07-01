import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
type SacramentTab = 'baptism' | 'marriage' | 'confirmation' | 'death';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
  MapPin,
  User,
  FileText,
  X,
  Trash2,
  Save,
  Check,
  Link2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Info,
  Ban,
  ArrowRight,
  Smartphone,
} from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, getDay, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays as addDaysFn } from 'date-fns';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventDropArg, DateSelectArg, EventClickArg } from '@fullcalendar/core';
import { Toaster, toast } from 'sonner';
import {
  SAMPLE_EVENTS, EVENT_COLORS, LOCATIONS, PRIESTS, findConflicts,
  getPublicTitle, checkEventConflicts, validateSchedulingRules, getRegistryLabel,
  eventTypeToRuleKey, isSacramentEventType, getNextAvailableDay, SCHEDULING_RULES,
} from '@/lib/calendarData';
import type { CalendarEvent, EventType } from '@/lib/calendarData';
import { baptismRecords, marriageRecords, confirmationRecords, deathRecords } from '@/lib/registryData';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { usePersistedState } from '@/hooks/usePersistedState';
import { KEYS } from '@/lib/storageKeys';
import EmptyState from '@/components/EmptyState';
import HelpTooltip from '@/components/HelpTooltip';
import { getLabel } from '@/lib/friendlyLabels';
import PriestScheduleExport from '@/components/PriestScheduleExport';

type CalendarView = 'month' | 'week' | 'day' | 'list';

// Direct calendar event types (scheduling-only, no registry required)
const CALENDAR_EVENT_TYPES: EventType[] = ['Mass', 'Ministry', 'SSDM', 'General'];
// Sacrament event types — MUST link to existing registry record
const SACRAMENT_EVENT_TYPES: Array<{ type: EventType; recordType: 'baptism' | 'marriage' | 'confirmation' | 'death'; label: string }> = [
  { type: 'Baptism', recordType: 'baptism', label: 'Baptism' },
  { type: 'Wedding', recordType: 'marriage', label: 'Wedding' },
  { type: 'Confirmation', recordType: 'confirmation', label: 'Confirmation' },
  { type: 'Death', recordType: 'death', label: 'Burial' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

/* ═══════════════════════════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════════════════════════ */

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 4, 1)); // May 2026
  const [view, setView] = useState<CalendarView>('month');
  const [publicView, setPublicView] = useState(false);
  const [showPriestExport, setShowPriestExport] = useState(false);
  const ALL_EVENT_TYPES: EventType[] = [...CALENDAR_EVENT_TYPES, ...SACRAMENT_EVENT_TYPES.map(s => s.type)];
  const [visibleTypes, setVisibleTypes] = useState<Set<EventType>>(new Set(ALL_EVENT_TYPES));
  const [events, setEvents] = usePersistedState<CalendarEvent[]>(KEYS.calendarEvents, SAMPLE_EVENTS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDateForNew, setSelectedDateForNew] = useState<string>('');
  const [dragWarning, setDragWarning] = useState<{
    event: CalendarEvent; proposedDate: string; proposedTime: string;
    errors: string[]; warnings: string[]; nextAvailable: string;
  } | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter(e => visibleTypes.has(e.type));
  }, [events, visibleTypes]);

  // Toggle event type filter
  const toggleType = useCallback((type: EventType) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // Navigation
  const goToday = useCallback(() => setCurrentDate(new Date(2026, 4, 1)), []);
  const goPrev = useCallback(() => {
    if (view === 'month') setCurrentDate(d => subMonths(d, 1));
    else if (view === 'week') setCurrentDate(d => subWeeks(d, 1));
    else if (view === 'day') setCurrentDate(d => addDaysFn(d, -1));
  }, [view]);
  const goNext = useCallback(() => {
    if (view === 'month') setCurrentDate(d => addMonths(d, 1));
    else if (view === 'week') setCurrentDate(d => addWeeks(d, 1));
    else if (view === 'day') setCurrentDate(d => addDaysFn(d, 1));
  }, [view]);

  // Modal helpers
  const openNewEvent = useCallback((dateStr?: string) => {
    setEditingEvent(null);
    setSelectedDateForNew(dateStr || format(currentDate, 'yyyy-MM-dd'));
    setModalOpen(true);
  }, [currentDate]);

  const openEditEvent = useCallback((evt: CalendarEvent) => {
    setEditingEvent(evt);
    setSelectedDateForNew(evt.date);
    setModalOpen(true);
    setDetailEvent(null);
  }, []);

  const handleSaveEvent = useCallback((evt: CalendarEvent) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === evt.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = evt;
        return next;
      }
      return [...prev, evt];
    });
    setModalOpen(false);
    toast.success(editingEvent ? 'Event updated' : 'Event created');
  }, [editingEvent]);

  const handleDeleteEvent = useCallback(() => {
    if (editingEvent) {
      setEvents(prev => prev.filter(e => e.id !== editingEvent.id));
      setModalOpen(false);
      setDeleteDialogOpen(false);
      setEditingEvent(null);
      toast.success('Event deleted');
    }
  }, [editingEvent]);

  // Enhanced drag-and-drop with rule validation
  const handleEventDrop = useCallback((arg: EventDropArg) => {
    const eventId = arg.event.id;
    const newDate = format(arg.event.start || new Date(), 'yyyy-MM-dd');
    const newStartTime = format(arg.event.start || new Date(), 'HH:mm');
    const oldEvent = events.find(e => e.id === eventId);
    if (!oldEvent) return;

    // Duration preservation
    const oldDuration = (parseInt(oldEvent.endTime.split(':')[0]) * 60 + parseInt(oldEvent.endTime.split(':')[1])) -
                        (parseInt(oldEvent.startTime.split(':')[0]) * 60 + parseInt(oldEvent.startTime.split(':')[1]));
    const newStartMins = parseInt(newStartTime.split(':')[0]) * 60 + parseInt(newStartTime.split(':')[1]);
    const newEndMins = newStartMins + oldDuration;
    const newEndTime = `${String(Math.floor(newEndMins / 60)).padStart(2, '0')}:${String(newEndMins % 60).padStart(2, '0')}`;

    const updated: CalendarEvent = {
      ...oldEvent,
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
    };

    // Check time/location conflicts -- HARD STOP: do not allow drop on conflicting slot
    const dropConflicts = findConflicts(updated, events);
    if (dropConflicts.length > 0) {
      toast.error(`Cannot move: ${dropConflicts[0].title} at ${dropConflicts[0].startTime}`);
      arg.revert();
      return;
    }

    // Check sacrament scheduling rules
    const ruleKey = eventTypeToRuleKey(oldEvent.type);
    if (ruleKey) {
      const result = validateSchedulingRules(ruleKey, newDate, newStartTime, oldEvent.location);
      if (!result.valid) {
        // Show warning modal — let user decide
        arg.revert();
        setDragWarning({
          event: oldEvent,
          proposedDate: newDate,
          proposedTime: newStartTime,
          errors: result.errors,
          warnings: result.warnings,
          nextAvailable: getNextAvailableDay(ruleKey, newDate),
        });
        return;
      }
      if (result.warnings.length > 0) {
        toast.warning(`Moved to ${format(new Date(newDate), 'MMM d, yyyy')}. Note: ${result.warnings[0]}`, { duration: 5000 });
      } else {
        toast.success(`${oldEvent.type} moved to ${format(new Date(newDate), 'EEEE, MMMM d, yyyy')}. Rules validated.`);
      }
    } else {
      toast.success(`Event rescheduled to ${format(new Date(newDate), 'MMM d, yyyy')}`);
    }

    setEvents(prev => prev.map(e => e.id === eventId ? updated : e));
  }, [events]);

  const handleDragWarningAction = useCallback((action: 'move-anyway' | 'cancel' | 'next-available') => {
    if (!dragWarning) return;
    const { event, proposedDate, proposedTime, nextAvailable } = dragWarning;

    // Duration preservation
    const oldDuration = (parseInt(event.endTime.split(':')[0]) * 60 + parseInt(event.endTime.split(':')[1])) -
                        (parseInt(event.startTime.split(':')[0]) * 60 + parseInt(event.startTime.split(':')[1]));
    const newStartMins = parseInt(proposedTime.split(':')[0]) * 60 + parseInt(proposedTime.split(':')[1]);
    const newEndMins = newStartMins + oldDuration;
    const newEndTime = `${String(Math.floor(newEndMins / 60)).padStart(2, '0')}:${String(newEndMins % 60).padStart(2, '0')}`;

    if (action === 'cancel') {
      setDragWarning(null);
      return;
    }

    if (action === 'move-anyway') {
      setDragWarning(null);
      return; // Hard stop -- not allowed
    }

    const finalDate = action === 'next-available' ? nextAvailable : proposedDate;
    const updated: CalendarEvent = {
      ...event,
      date: finalDate,
      startTime: proposedTime,
      endTime: newEndTime,
      ruleNotes: event.ruleNotes,
    };
    setEvents(prev => prev.map(e => e.id === event.id ? updated : e));
    setDragWarning(null);
    toast.success(`${event.type} moved to ${format(new Date(finalDate), 'EEEE, MMMM d, yyyy')}.`);
  }, [dragWarning]);

  const handleDateClick = useCallback((arg: { date: Date }) => {
    openNewEvent(format(arg.date, 'yyyy-MM-dd'));
  }, [openNewEvent]);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const evt = events.find(e => e.id === arg.event.id);
    if (evt) setDetailEvent(evt);
  }, [events]);

  const handleSelect = useCallback((arg: DateSelectArg) => {
    openNewEvent(format(arg.start, 'yyyy-MM-dd'));
  }, [openNewEvent]);

  // Upcoming events (next 8)
  const upcomingEvents = useMemo(() => {
    const sorted = [...filteredEvents].sort((a, b) => {
      const da = new Date(`${a.date}T${a.startTime}`);
      const db = new Date(`${b.date}T${b.startTime}`);
      return da.getTime() - db.getTime();
    });
    return sorted.slice(0, 8);
  }, [filteredEvents]);

  // FullCalendar events with custom rendering for sacrament-linked
  const fcEvents = useMemo(() => {
    return filteredEvents.map(e => {
      const start = `${e.date}T${e.startTime}`;
      const end = `${e.date}T${e.endTime}`;
      const displayTitle = publicView ? getPublicTitle(e) : e.title;
      return {
        id: e.id,
        title: displayTitle,
        start,
        end,
        backgroundColor: EVENT_COLORS[e.type].bgOpacity,
        borderColor: EVENT_COLORS[e.type].border,
        textColor: EVENT_COLORS[e.type].border,
        extendedProps: { ...e },
      };
    });
  }, [filteredEvents, publicView]);

  // List view grouped events
  const listEvents = useMemo(() => {
    const sorted = [...filteredEvents].sort((a, b) => {
      const da = new Date(`${a.date}T${a.startTime}`);
      const db = new Date(`${b.date}T${b.startTime}`);
      return da.getTime() - db.getTime();
    });
    const grouped: Record<string, CalendarEvent[]> = {};
    sorted.forEach(e => {
      if (!grouped[e.date]) grouped[e.date] = [];
      grouped[e.date].push(e);
    });
    return grouped;
  }, [filteredEvents]);

  return (
    <div className="space-y-6">
      <Toaster position="top-right" richColors />

      {/* Module Title */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
            <CalendarIcon className="w-5 h-5 text-gold" />
          </div>
          <h1 className="display-md font-playfair text-charcoal dark:text-dm-text">Calendar &amp; Scheduling</h1>
        </div>
        <p className="body-md text-warm-gray dark:text-dm-text-muted ml-[52px]">
          Schedule Masses, sacraments, ministry activities, and SSDM events. Detect conflicts and manage parish calendar.
        </p>
      </div>

      {/* Main Layout: Calendar + Right Sidebar */}
      <div className="flex gap-6">
        {/* Main Calendar Area */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="cos-card p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            {/* Left: Navigation + View Switcher */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <button onClick={goPrev} className="cos-btn cos-btn-secondary p-2">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="heading-lg text-charcoal dark:text-dm-text min-w-[160px] text-center]">
                  {view === 'month' && format(currentDate, 'MMMM yyyy')}
                  {view === 'week' && `Week of ${format(startOfWeek(currentDate), 'MMM d')} \u2013 ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`}
                  {view === 'day' && format(currentDate, 'MMMM d, yyyy')}
                  {view === 'list' && format(currentDate, 'MMMM yyyy')}
                </span>
                <button onClick={goNext} className="cos-btn cos-btn-secondary p-2">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={goToday} className="cos-btn cos-btn-secondary text-sm px-3 py-1.5">
                Today
              </button>

              {/* View Switcher */}
              <div className="flex items-center bg-cream-dark dark:bg-dm-surface-raised rounded-lg p-0.5">
                {(['month', 'week', 'day', 'list'] as CalendarView[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-all ${
                      view === v
                        ? 'bg-deep-navy text-white shadow-sm'
                        : 'text-warm-gray dark:text-dm-text-muted hover:text-charcoal dark:hover:text-dm-text'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Sync to Phone + New Event + Public Toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowPriestExport(true)}
                className="cos-btn cos-btn-secondary text-sm flex items-center gap-1.5"
                title="Export priest schedule to phone calendar"
              >
                <Smartphone className="w-4 h-4" />
                <span className="hidden sm:inline">Sync to Phone</span>
              </button>
              <button onClick={() => openNewEvent()} className="cos-btn cos-btn-primary text-sm">
                <Plus className="w-4 h-4" />
                New Event
              </button>
              <div className="flex items-center gap-2">
                {publicView ? (
                  <Eye className="w-4 h-4 text-gold" />
                ) : (
                  <EyeOff className="w-4 h-4 text-warm-gray" />
                )}
                <span className="text-sm text-charcoal dark:text-dm-text">Public View</span>
                <button
                  onClick={() => setPublicView(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    publicView ? 'bg-gold' : 'bg-parchment dark:bg-dm-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      publicView ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Legend Bar with click-to-filter and sacrament link icons */}
          <div className="flex flex-wrap items-center gap-4 mb-4 px-1">
            {ALL_EVENT_TYPES.map(type => {
              const active = visibleTypes.has(type);
              const isSacrament = isSacramentEventType(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`flex items-center gap-1.5 text-sm transition-all ${
                    active ? 'opacity-100' : 'opacity-40 line-through'
                  }`}
                  title={isSacrament ? `${type} — Click to filter (sacrament events can be linked to registry)` : `${type} — Click to filter`}
                >
                  <span className="relative">
                    <span
                      className="w-2.5 h-2.5 rounded-full block"
                      style={{ backgroundColor: EVENT_COLORS[type].bg }}
                    />
                    {isSacrament && (
                      <Link2 className="absolute -top-1 -right-1.5 w-2.5 h-2.5 text-deep-navy" style={{ transform: 'scale(0.7)' }} />
                    )}
                  </span>
                  <span className="text-warm-gray dark:text-dm-text-muted">{type}</span>
                </button>
              );
            })}
          </div>

          {/* Calendar Views */}
          <div className="cos-card p-0 overflow-hidden">
            <AnimatePresence mode="wait">
              {view === 'month' && (
                <motion.div
                  key="month"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    initialDate={currentDate}
                    events={fcEvents}
                    editable={true}
                    droppable={true}
                    eventDrop={handleEventDrop}
                    dateClick={handleDateClick}
                    eventClick={handleEventClick}
                    selectable={true}
                    select={handleSelect}
                    headerToolbar={false}
                    height="auto"
                    dayMaxEvents={3}
                    eventDisplay="block"
                    eventClassNames="rounded-md text-xs border-0"
                    dayCellClassNames="hover:bg-gold-glow/50 cursor-pointer"
                    dayHeaderClassNames="text-warm-gray text-xs uppercase tracking-wider"
                    eventContent={(arg) => {
                      const evt = arg.event.extendedProps as CalendarEvent;
                      const isLinked = !!evt.sacramentRecordId;
                      return (
                        <div className="flex items-center gap-1 w-full overflow-hidden px-1 py-0.5">
                          {isLinked && !publicView && (
                            <Link2 className="w-2.5 h-2.5 flex-shrink-0 opacity-60" />
                          )}
                          <span className="truncate">{arg.event.title}</span>
                        </div>
                      );
                    }}
                  />
                </motion.div>
              )}

              {view === 'week' && (
                <motion.div
                  key="week"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <FullCalendar
                    ref={calendarRef}
                    plugins={[timeGridPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    initialDate={currentDate}
                    events={fcEvents}
                    editable={true}
                    droppable={true}
                    eventDrop={handleEventDrop}
                    dateClick={handleDateClick}
                    eventClick={handleEventClick}
                    selectable={true}
                    select={handleSelect}
                    headerToolbar={false}
                    slotMinTime="05:00:00"
                    slotMaxTime="21:00:00"
                    slotDuration="00:30:00"
                    snapDuration="00:30:00"
                    allDaySlot={true}
                    height="720px"
                    nowIndicator={true}
                    eventClassNames="rounded-md text-xs border-l-4 border-l-current"
                    eventContent={(arg) => {
                      const evt = arg.event.extendedProps as CalendarEvent;
                      const isLinked = !!evt.sacramentRecordId;
                      return (
                        <div className="flex items-start gap-1 w-full overflow-hidden px-1 py-0.5">
                          {isLinked && !publicView && (
                            <Link2 className="w-2.5 h-2.5 flex-shrink-0 mt-0.5 opacity-70" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">{arg.event.title}</div>
                            {arg.event.start && <div className="opacity-70 text-[10px]">{format(arg.event.start, 'h:mm a')}</div>}
                          </div>
                        </div>
                      );
                    }}
                  />
                </motion.div>
              )}

              {view === 'day' && (
                <motion.div
                  key="day"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <FullCalendar
                    ref={calendarRef}
                    plugins={[timeGridPlugin, interactionPlugin]}
                    initialView="timeGridDay"
                    initialDate={currentDate}
                    events={fcEvents}
                    editable={true}
                    droppable={true}
                    eventDrop={handleEventDrop}
                    dateClick={handleDateClick}
                    eventClick={handleEventClick}
                    selectable={true}
                    select={handleSelect}
                    headerToolbar={false}
                    slotMinTime="05:00:00"
                    slotMaxTime="21:00:00"
                    slotDuration="00:30:00"
                    snapDuration="00:30:00"
                    allDaySlot={true}
                    height="720px"
                    nowIndicator={true}
                    eventClassNames="rounded-md text-xs border-l-4 border-l-current"
                    eventContent={(arg) => {
                      const evt = arg.event.extendedProps as CalendarEvent;
                      const isLinked = !!evt.sacramentRecordId;
                      return (
                        <div className="flex items-start gap-1 w-full overflow-hidden px-1 py-0.5">
                          {isLinked && !publicView && (
                            <Link2 className="w-2.5 h-2.5 flex-shrink-0 mt-0.5 opacity-70" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">{arg.event.title}</div>
                            {arg.event.start && <div className="opacity-70 text-[10px]">{format(arg.event.start, 'h:mm a')}</div>}
                            {evt.location && <div className="opacity-60 text-[10px] truncate">{evt.location}</div>}
                          </div>
                        </div>
                      );
                    }}
                  />
                </motion.div>
              )}

              {view === 'list' && (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="p-6 max-h-[720px] overflow-y-auto"
                >
                  {Object.keys(listEvents).length === 0 ? (
                    <EmptyState
                      icon={CalendarIcon}
                      title={getLabel('calendar.empty.title', 'The calendar is quiet')}
                      description={getLabel('calendar.empty.description', 'Schedule Masses, baptisms, weddings, and meetings here. Everything appears on the calendar for everyone to see.')}
                      tip={getLabel('calendar.empty.tip', 'Click "New Event" to schedule your first activity.')}
                      actionLabel="New Event"
                      actionIcon={Plus}
                      onAction={() => openNewEvent()}
                    />
                  ) : (
                    Object.entries(listEvents).map(([date, evts]) => (
                      <div key={date} className="mb-6">
                        <h3 className="heading-sm text-charcoal dark:text-dm-text mb-2 sticky top-0 bg-white dark:bg-dm-surface py-2 z-10">
                          {format(new Date(date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
                        </h3>
                        <div className="space-y-2">
                          {evts.map(evt => (
                            <button
                              key={evt.id}
                              onClick={() => setDetailEvent(evt)}
                              className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-all text-left"
                            >
                              <span className="mono-md text-warm-gray dark:text-dm-text-muted min-w-[70px]">
                                {evt.startTime}
                              </span>
                              <span className="relative">
                                <span
                                  className="w-3 h-3 rounded-full flex-shrink-0 block"
                                  style={{ backgroundColor: EVENT_COLORS[evt.type].bg }}
                                />
                                {evt.sacramentRecordId && !publicView && (
                                  <Link2 className="absolute -top-1 -right-1.5 w-2.5 h-2.5 text-deep-navy" />
                                )}
                              </span>
                              <span className="flex-1 body-md text-charcoal dark:text-dm-text">
                                {publicView ? getPublicTitle(evt) : evt.title}
                              </span>
                              <span className="text-sm text-warm-gray dark:text-dm-text-muted flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {evt.location}
                              </span>
                              <span
                                className="cos-badge text-xs"
                                style={{
                                  backgroundColor: EVENT_COLORS[evt.type].bgOpacity,
                                  color: EVENT_COLORS[evt.type].border,
                                }}
                              >
                                {evt.type}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="hidden lg:block w-[280px] flex-shrink-0 space-y-4">
          {/* Mini Calendar */}
          <div className="cos-card p-4">
            <MiniCalendar
              currentDate={currentDate}
              events={filteredEvents}
              onDateClick={(date) => {
                setCurrentDate(date);
                setView('day');
              }}
            />
          </div>

          {/* Upcoming Events */}
          <div className="cos-card p-4">
            <h3 className="heading-sm text-charcoal dark:text-dm-text mb-3">Upcoming</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {upcomingEvents.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No upcoming events"
                  description="Events scheduled for the future will appear here."
                  tip={'Click "New Event" above to schedule something.'}
                />
              ) : (
                upcomingEvents.map(evt => (
                  <button
                    key={evt.id}
                    onClick={() => setDetailEvent(evt)}
                    className="w-full flex items-center gap-2 text-left p-2 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-all"
                  >
                    <span className="mono-sm px-2 py-1 bg-cream-dark dark:bg-dm-surface-raised rounded text-warm-gray dark:text-dm-text-muted">
                      {format(new Date(evt.date + 'T00:00:00'), 'MMM d')}
                    </span>
                    <span className="relative flex-shrink-0">
                      <span
                        className="w-2 h-2 rounded-full block"
                        style={{ backgroundColor: EVENT_COLORS[evt.type].bg }}
                      />
                      {evt.sacramentRecordId && !publicView && (
                        <Link2 className="absolute -top-0.5 -right-1 w-2 h-2 text-deep-navy" style={{ transform: 'scale(0.6)' }} />
                      )}
                    </span>
                    <span className="text-sm text-charcoal dark:text-dm-text truncate flex-1">
                      {publicView ? getPublicTitle(evt) : evt.title}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Sacrament Schedule Quick View */}
          <SchedulingRulesSidebar />

          {/* Event Type Filters */}
          <div className="cos-card p-4">
            <h3 className="heading-sm text-charcoal dark:text-dm-text mb-3">Filters</h3>
            <div className="space-y-2">
              {ALL_EVENT_TYPES.map(type => (
                <label
                  key={type}
                  className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-all"
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                      visibleTypes.has(type)
                        ? 'bg-gold border-gold'
                        : 'border-parchment dark:border-dm-border'
                    }`}
                  >
                    {visibleTypes.has(type) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: EVENT_COLORS[type].bg }}
                  />
                  <span className="text-sm text-charcoal dark:text-dm-text">{type}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Event Modal */}
      <AnimatePresence>
        {modalOpen && (
          <EventModal
            onClose={() => { setModalOpen(false); setEditingEvent(null); }}
            onSave={handleSaveEvent}
            onDelete={() => setDeleteDialogOpen(true)}
            event={editingEvent}
            defaultDate={selectedDateForNew}
            allEvents={events}
          />
        )}
      </AnimatePresence>

      {/* Event Detail Popover */}
      <AnimatePresence>
        {detailEvent && (
          <EventDetailPopover
            event={detailEvent}
            publicView={publicView}
            onClose={() => setDetailEvent(null)}
            onEdit={() => openEditEvent(detailEvent)}
          />
        )}
      </AnimatePresence>

      {/* Drag Warning Modal */}
      <AnimatePresence>
        {dragWarning && (
          <DragWarningModal
            warning={dragWarning}
            onAction={handleDragWarningAction}
            onClose={() => setDragWarning(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        title="Delete Event"
        message={`Are you sure you want to delete "${editingEvent?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteEvent}
        onCancel={() => setDeleteDialogOpen(false)}
      />

      {/* Priest Schedule to Phone Export */}
      <AnimatePresence>
        {showPriestExport && (
          <PriestScheduleExport onClose={() => setShowPriestExport(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Mini Calendar Component
   ═══════════════════════════════════════════════════════════════════ */

function MiniCalendar({ currentDate, events, onDateClick }: {
  currentDate: Date;
  events: CalendarEvent[];
  onDateClick: (date: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = getDay(monthStart);

  const hasEvent = useCallback((date: Date) => {
    return events.some(e => e.date === format(date, 'yyyy-MM-dd'));
  }, [events]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="heading-sm text-charcoal dark:text-dm-text">
          {format(currentDate, 'MMMM yyyy')}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] uppercase text-warm-gray font-medium py-1">
            {d}
          </div>
        ))}
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {days.map(day => {
          const isSelected = isSameDay(day, currentDate);
          const today = isToday(day);
          const eventDay = hasEvent(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onDateClick(day)}
              className={`relative w-8 h-8 mx-auto flex items-center justify-center rounded-full text-sm transition-all ${
                isSelected
                  ? 'bg-gold text-white'
                  : today
                  ? 'border-2 border-gold text-gold'
                  : 'hover:bg-cream-dark dark:hover:bg-dm-surface-raised text-charcoal dark:text-dm-text'
              }`}
            >
              {format(day, 'd')}
              {eventDay && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Sacrament Schedule Quick View — Sidebar
   ═══════════════════════════════════════════════════════════════════ */

function SchedulingRulesSidebar() {
  const [open, setOpen] = useState(true);
  return (
    <div className="cos-card p-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full mb-1"
      >
        <h3 className="heading-sm text-charcoal dark:text-dm-text flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-gold" />
          Scheduling Rules
        </h3>
        {open ? <ChevronUp className="w-4 h-4 text-warm-gray" /> : <ChevronDown className="w-4 h-4 text-warm-gray" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-2 text-xs text-warm-gray dark:text-dm-text-muted">
              <div className="flex items-start gap-2">
                <span className="font-medium text-forest-green w-[82px] flex-shrink-0">Baptism</span>
                <span>Mon–Sat, 9AM–3PM</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-medium text-maroon w-[82px] flex-shrink-0">Wedding</span>
                <span>Any day (Sat preferred), not Lent</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-medium" style={{ color: '#0D9488' }}>Confirmation</span>
                <span>Mon–Sat, 9AM–3PM</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-medium text-gray-500 w-[82px] flex-shrink-0">Burial</span>
                <span>Any day including Sun</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Event Detail Popover (Enhanced with sacrament linkage)
   ═══════════════════════════════════════════════════════════════════ */

function EventDetailPopover({ event, publicView, onClose, onEdit }: {
  event: CalendarEvent;
  publicView: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const color = EVENT_COLORS[event.type];
  const displayTitle = publicView ? getPublicTitle(event) : event.title;
  const registryLabel = getRegistryLabel(event);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[380px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-1.5" style={{ backgroundColor: color.bg }} />
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 pr-4">
              {event.sacramentRecordId && !publicView && (
                <span title="Linked to sacramental registry"><Link2 className="w-4 h-4 text-gold flex-shrink-0" /></span>
              )}
              <h3 className="heading-sm text-charcoal dark:text-dm-text">{displayTitle}</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-all">
              <X className="w-4 h-4 text-warm-gray" />
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm text-warm-gray dark:text-dm-text-muted">
              <CalendarIcon className="w-4 h-4" />
              {format(new Date(event.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
            </div>
            <div className="flex items-center gap-2 text-sm text-warm-gray dark:text-dm-text-muted">
              <Clock className="w-4 h-4" />
              {event.startTime} \u2013 {event.endTime}
            </div>
            <div className="flex items-center gap-2 text-sm text-warm-gray dark:text-dm-text-muted">
              <MapPin className="w-4 h-4" />
              {event.location}
            </div>
            {event.officiant && (
              <div className="flex items-center gap-2 text-sm text-warm-gray dark:text-dm-text-muted">
                <User className="w-4 h-4" />
                {event.officiant}
              </div>
            )}

            {/* Registry Record Section */}
            {event.sacramentRecordId && !publicView && (
              <div className="p-3 rounded-lg bg-gold-glow border border-gold/20 mt-2">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-gold" />
                  <span className="text-sm font-medium text-charcoal dark:text-dm-text">Registry Record</span>
                </div>
                <p className="text-xs text-warm-gray dark:text-dm-text-muted mb-2">
                  {registryLabel}
                  {event.sacramentSummary && ` \u2014 ${event.sacramentSummary}`}
                </p>
                <button
                  onClick={() => { window.location.hash = '/registry'; }}
                  className="text-xs font-medium text-gold hover:text-gold-light flex items-center gap-1 transition-colors"
                >
                  View Full Record
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Rule notes */}
            {event.ruleNotes && !publicView && (
              <div className="flex items-start gap-2 text-sm text-warm-gray dark:text-dm-text-muted pt-1">
                <Info className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
                <span className="italic">{event.ruleNotes}</span>
              </div>
            )}

            {event.description && !publicView && (
              <p className="text-sm text-warm-gray dark:text-dm-text-muted mt-2 pt-2 border-t border-parchment dark:border-dm-border">
                {event.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-parchment dark:border-dm-border">
            <span
              className="cos-badge"
              style={{ backgroundColor: color.bgOpacity, color: color.border }}
            >
              {event.type}
            </span>
            {event.sacramentRecordId && (
              <span
                className="cos-badge flex items-center gap-1"
                style={{ backgroundColor: 'rgba(201,150,59,0.1)', color: '#9A7B3D' }}
              >
                <Link2 className="w-3 h-3" />
                Linked
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="cos-btn cos-btn-secondary text-sm py-1.5 px-3"
            >
              Close
            </button>
            <button
              onClick={onEdit}
              className="cos-btn cos-btn-primary text-sm py-1.5 px-3"
            >
              Edit
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Drag Warning Modal
   ═══════════════════════════════════════════════════════════════════ */

function DragWarningModal({ warning, onAction, onClose }: {
  warning: { event: CalendarEvent; proposedDate: string; proposedTime: string; errors: string[]; warnings: string[]; nextAvailable: string };
  onAction: (action: 'move-anyway' | 'cancel' | 'next-available') => void;
  onClose: () => void;
}) {
  const { event, proposedDate, errors, warnings, nextAvailable } = warning;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-modal modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[440px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="heading-md text-charcoal dark:text-dm-text">Scheduling Rule Violation</h3>
              <p className="text-xs text-warm-gray dark:text-dm-text-muted">
                {event.type}: {event.sacramentSummary || event.title}
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <p className="text-sm text-warm-gray dark:text-dm-text-muted">
              Moving to <strong>{format(new Date(proposedDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}</strong> would violate scheduling rules:
            </p>
            {errors.map((err, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-error">
                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {err}
              </div>
            ))}
            {warnings.map((warn, i) => (
              <div key={i} className="flex items-start gap-2 text-sm" style={{ color: '#9A7B3D' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {warn}
              </div>
            ))}
          </div>

          {nextAvailable !== proposedDate && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/20 mb-4">
              <p className="text-sm text-success flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Next available valid day: <strong>{format(new Date(nextAvailable + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}</strong>
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => onAction('cancel')} className="cos-btn cos-btn-secondary text-sm px-4 py-2">
              Cancel
            </button>
            {nextAvailable !== proposedDate && (
              <button onClick={() => onAction('next-available')} className="cos-btn text-sm px-4 py-2 bg-success hover:bg-[#225C44] text-white">
                Move to Next Valid Day
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Event Modal (Add/Edit) — Enhanced with sacrament link & rules
   ═══════════════════════════════════════════════════════════════════ */

function EventModal({ onClose, onSave, onDelete, event, defaultDate, allEvents }: {
  onClose: () => void;
  onSave: (evt: CalendarEvent) => void;
  onDelete: () => void;
  event: CalendarEvent | null;
  defaultDate: string;
  allEvents: CalendarEvent[];
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(event?.title || '');
  const [type, setType] = useState<EventType>(event?.type || 'General');
  const [date, setDate] = useState(event?.date || defaultDate);
  const [startTime, setStartTime] = useState(event?.startTime || '09:00');
  const [endTime, setEndTime] = useState(event?.endTime || '10:00');
  const [location, setLocation] = useState(event?.location || LOCATIONS[0]);
  const [officiant, setOfficiant] = useState(event?.officiant || '');
  const [description, setDescription] = useState(event?.description || '');
  const [isPublic, setIsPublic] = useState(event?.isPublic ?? true);

  // Sacrament link state
  const [linkSacrament, setLinkSacrament] = useState(!!event?.sacramentRecordId);
  const [sacramentRecordType, setSacramentRecordType] = useState<'baptism' | 'marriage' | 'confirmation' | 'death'>(
    event?.sacramentRecordType || 'baptism'
  );
  const [selectedRecordId, setSelectedRecordId] = useState(event?.sacramentRecordId || '');
  const [showRecordSelector, setShowRecordSelector] = useState(false);
  const [recordSearch, setRecordSearch] = useState('');

  // Rules display
  const [showRules, setShowRules] = useState(true);

  const isEditing = !!event;

  // Conflict checking
  const conflicts = useMemo(() => {
    if (!title) return [];
    const temp: Omit<CalendarEvent, 'id'> = {
      title, type, date, startTime, endTime, location, officiant: officiant || undefined,
      description: description || undefined, isPublic,
      sacramentRecordId: linkSacrament ? selectedRecordId : undefined,
      sacramentRecordType: linkSacrament ? sacramentRecordType : undefined,
    };
    return checkEventConflicts(allEvents, temp);
  }, [title, type, date, startTime, endTime, location, officiant, allEvents, linkSacrament, selectedRecordId, sacramentRecordType, isPublic]);

  // Split: hard-block conflicts (overlaps) prevent saving; transition warnings allow it.
  const blockConflicts = useMemo(() => conflicts.filter(c => c.severity === 'block'), [conflicts]);
  const warnConflicts = useMemo(() => conflicts.filter(c => c.severity === 'warn'), [conflicts]);

  // The end time must come after the start time (no backwards or zero-length events).
  const timeInvalid = useMemo(() => {
    const toMin = (t: string) => { const [h, m] = (t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    return !!startTime && !!endTime && toMin(endTime) <= toMin(startTime);
  }, [startTime, endTime]);

  // Scheduling rules validation
  const ruleKey = eventTypeToRuleKey(type);
  const ruleValidation = useMemo(() => {
    if (!ruleKey) return null;
    return validateSchedulingRules(ruleKey, date, startTime, location);
  }, [ruleKey, date, startTime, location]);

  // Get available records for dropdown
  const availableRecords = useMemo(() => {
    const s = recordSearch.toLowerCase();
    switch (sacramentRecordType) {
      case 'baptism':
        return baptismRecords.filter(r =>
          !s || `${r.childLastName}, ${r.childFirstName}`.toLowerCase().includes(s) ||
          r.registryNumber.toLowerCase().includes(s)
        ).map(r => ({ id: `bap-${r.id}`, label: `${r.childLastName}, ${r.childFirstName} ${r.childMiddleName} — Baptism #${r.registryNumber}` }));
      case 'marriage':
        return marriageRecords.filter(r =>
          !s || `${r.groomLastName}, ${r.groomFirstName}`.toLowerCase().includes(s) || `${r.brideLastName}, ${r.brideFirstName}`.toLowerCase().includes(s) ||
          r.registryNumber.toLowerCase().includes(s)
        ).map(r => ({ id: `wed-${r.id}`, label: `${r.groomLastName}, ${r.groomFirstName} & ${r.brideLastName}, ${r.brideFirstName} — Marriage #${r.registryNumber}` }));
      case 'confirmation':
        return confirmationRecords.filter(r =>
          !s || `${r.confirmandLastName}, ${r.confirmandFirstName}`.toLowerCase().includes(s) || r.registryNumber.toLowerCase().includes(s)
        ).map(r => ({ id: `cnf-${r.id}`, label: `${r.confirmandLastName}, ${r.confirmandFirstName} — Confirmation #${r.registryNumber}` }));
      case 'death':
        return deathRecords.filter(r =>
          !s || `${r.deceasedLastName}, ${r.deceasedFirstName}`.toLowerCase().includes(s) || r.registryNumber.toLowerCase().includes(s)
        ).map(r => ({ id: `dth-${r.id}`, label: `${r.deceasedLastName}, ${r.deceasedFirstName} — Burial #${r.registryNumber}` }));
      default: return [];
    }
  }, [sacramentRecordType, recordSearch]);

  // Selected record summary
  const selectedRecordSummary = useMemo(() => {
    if (!selectedRecordId) return null;
    return availableRecords.find(r => r.id === selectedRecordId)?.label || selectedRecordId;
  }, [selectedRecordId, availableRecords]);

  // Auto-fill title from record
  const handleSelectRecord = useCallback((recordId: string) => {
    setSelectedRecordId(recordId);
    setShowRecordSelector(false);
    const rec = availableRecords.find(r => r.id === recordId);
    if (rec && !title) {
      const namePart = rec.label.split(' — ')[0];
      const typeLabel = type === 'Baptism' ? 'Baptism' : type === 'Wedding' ? 'Wedding' : type === 'Confirmation' ? 'Confirmation' : 'Burial';
      setTitle(`${typeLabel}: ${namePart}`);
    }
  }, [availableRecords, title, type]);

  // Auto-fill from record officiant
  useEffect(() => {
    if (linkSacrament && selectedRecordId) {
      const allRecords = [
        ...baptismRecords.map(r => ({ id: `bap-${r.id}`, officiant: r.officiant })),
        ...marriageRecords.map(r => ({ id: `wed-${r.id}`, officiant: r.officiant })),
        ...confirmationRecords.map(r => ({ id: `cnf-${r.id}`, officiant: r.officiant })),
        ...deathRecords.map(r => ({ id: `dth-${r.id}`, officiant: r.officiant })),
      ];
      const rec = allRecords.find(r => r.id === selectedRecordId);
      if (rec && rec.officiant && !officiant) {
        setOfficiant(rec.officiant);
      }
    }
  }, [linkSacrament, selectedRecordId, officiant]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Belt-and-suspenders: never save a blocked or backwards event, even via Enter.
    if (blockConflicts.length > 0 || timeInvalid) return;
    const evt: CalendarEvent = {
      id: event?.id || `evt-${Date.now()}`,
      title: title || `${type} Event`,
      type,
      date,
      startTime,
      endTime,
      location,
      officiant: officiant || undefined,
      description: description || undefined,
      isPublic,
      recurring: event?.recurring,
      sacramentRecordId: linkSacrament ? selectedRecordId : undefined,
      sacramentRecordType: linkSacrament ? sacramentRecordType : undefined,
      sacramentSummary: linkSacrament && selectedRecordSummary ? selectedRecordSummary.split(' — ')[0] : undefined,
      ruleEnforced: !!ruleKey && ruleValidation ? ruleValidation.valid : undefined,
      ruleNotes: ruleValidation ? [...ruleValidation.errors, ...ruleValidation.warnings].join('; ') || undefined : undefined,
    };
    onSave(evt);
  };

  // Scheduling rules display content
  const renderRulesPanel = () => {
    if (!ruleKey || !ruleValidation) return null;
    const rules = SCHEDULING_RULES[ruleKey];
    const jsDate = new Date(date + 'T00:00:00');
    const dayName = jsDate.toLocaleDateString('en-US', { weekday: 'long' });
    const hasBlockedDays = 'blockedDays' in rules;
    const hasPreferredDays = 'preferredDays' in rules;
    const blockedDays = hasBlockedDays ? rules.blockedDays as readonly string[] : null;
    const preferredDays = hasPreferredDays ? rules.preferredDays as readonly string[] : null;
    const allowedDays = 'allowedDays' in rules ? rules.allowedDays as readonly string[] : null;
    const allowedTimes = 'allowedTimes' in rules ? rules.allowedTimes as readonly string[] : null;
    const locations = 'locations' in rules ? rules.locations as readonly string[] : null;
    const dayIsBlocked = blockedDays ? blockedDays.includes(dayName) : false;
    const dayIsPreferred = preferredDays ? preferredDays.includes(dayName) : true;
    const timeIsValid = allowedTimes ? allowedTimes.includes(startTime) : true;
    const locIsValid = locations ? locations.includes(location) : true;

    return (
      <div className="p-3 rounded-lg border" style={{ borderColor: ruleValidation.errors.length > 0 ? 'rgba(184,50,47,0.2)' : 'rgba(45,106,79,0.2)', backgroundColor: ruleValidation.errors.length > 0 ? 'rgba(184,50,47,0.04)' : 'rgba(45,106,79,0.04)' }}>
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-4 h-4" style={{ color: ruleValidation.errors.length > 0 ? '#B8322F' : '#2D6A4F' }} />
          <span className="text-sm font-medium text-charcoal dark:text-dm-text">
            Scheduling Rules for {type}
          </span>
        </div>
        <div className="space-y-1 text-xs">
          {allowedDays && (
            <div className="flex items-center gap-1.5">
              {dayIsBlocked ? (
                <XCircle className="w-3.5 h-3.5 text-error flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
              )}
              <span className={dayIsBlocked ? 'text-error' : 'text-success'}>
                {allowedDays.join(', ')} {blockedDays && blockedDays.length > 0 ? `(Not ${blockedDays.join('/')})` : ''}
              </span>
            </div>
          )}
          {preferredDays && !dayIsPreferred && (
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#9A7B3D' }} />
              <span style={{ color: '#9A7B3D' }}>{preferredDays.join(' / ')} preferred</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {timeIsValid ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#9A7B3D' }} />
            )}
            <span className={timeIsValid ? 'text-success' : ''} style={{ color: timeIsValid ? undefined : '#9A7B3D' }}>
              {allowedTimes ? `${allowedTimes[0]} \u2013 ${allowedTimes[allowedTimes.length - 1]}` : 'Any time'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {locIsValid ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#9A7B3D' }} />
            )}
            <span className={locIsValid ? 'text-success' : ''} style={{ color: locIsValid ? undefined : '#9A7B3D' }}>
              {locations ? locations.join(' or ') : 'Any location'}
            </span>
          </div>
          {ruleKey === 'wedding' && 'blockedPeriods' in rules && (
            <div className="flex items-start gap-1.5 mt-1">
              <XCircle className="w-3.5 h-3.5 text-error flex-shrink-0" />
              <span className="text-error">
                No weddings during Lent
              </span>
            </div>
          )}
        </div>
        {ruleValidation.errors.length > 0 && (
          <div className="mt-2 pt-2 border-t border-error/10 space-y-1">
            {ruleValidation.errors.map((err, i) => (
              <p key={i} className="text-xs text-error flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                {err}
              </p>
            ))}
          </div>
        )}
        {ruleValidation.warnings.length > 0 && (
          <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(201,150,59,0.15)' }}>
            {ruleValidation.warnings.map((warn, i) => (
              <p key={i} className="text-xs flex items-center gap-1" style={{ color: '#9A7B3D' }}>
                <AlertCircle className="w-3 h-3" />
                {warn}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-modal modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[640px] overflow-hidden max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <h2 className="heading-md text-charcoal dark:text-dm-text">
            {isEditing ? 'Edit Event' : 'New Event'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-all">
            <X className="w-5 h-5 text-warm-gray" />
          </button>
        </div>

        {/* End-before-start guard (blocks saving) */}
        {timeInvalid && (
          <div className="mx-6 mt-4 p-3 rounded-lg border border-error/20 bg-error/5">
            <p className="text-xs text-error flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5 flex-shrink-0" />
              The end time must be after the start time.
            </p>
          </div>
        )}

        {/* Transition-time caution (does NOT block saving) */}
        <AnimatePresence>
          {warnConflicts.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mx-6 mt-4 p-3 rounded-lg border border-warning/30 bg-warning/5">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                  <span className="text-sm font-semibold text-warning">Tight schedule — please double-check</span>
                </div>
                <div className="space-y-1">
                  {warnConflicts.map((c, i) => (
                    <p key={i} className="text-xs text-warning flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {c.message}
                    </p>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Conflict Hard Stop Banner */}
        <AnimatePresence>
          {blockConflicts.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mx-6 mt-4 p-3 rounded-lg border border-error/20 bg-error/5">
                <div className="flex items-center gap-2 mb-1">
                  <Ban className="w-4 h-4 text-error flex-shrink-0" />
                  <span className="text-sm font-semibold text-error">Cannot Save -- Conflicts Detected</span>
                </div>
                <p className="text-xs text-error/80 mb-2">
                  You must resolve the conflicts below before this event can be saved.
                </p>
                <div className="space-y-1">
                  {blockConflicts.map((c, i) => (
                    <p key={i} className="text-xs text-error flex items-start gap-1.5">
                      <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {c.message}
                    </p>
                  ))}
                </div>
                {isSacramentEventType(type) && (
                  <div className="mt-2 pt-2 border-t border-error/10">
                    <button
                      type="button"
                      onClick={() => {
                        // Save record only: close modal, toast guidance
                        toast.info('Go to Registry to save the sacrament record without a calendar event.');
                      }}
                      className="text-xs text-warm-gray hover:text-gold underline transition-colors"
                    >
                      Save sacrament record without calendar event &rarr;
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Calendar Event Types (direct creation) */}
          <div>
            <label className="label text-warm-gray dark:text-dm-text-muted mb-2 block">Event Type</label>
            <div className="flex flex-wrap gap-2">
              {CALENDAR_EVENT_TYPES.map(et => (
                <button
                  key={et}
                  type="button"
                  onClick={() => { setType(et); setLinkSacrament(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                    type === et && !linkSacrament
                      ? 'border-current'
                      : 'border-parchment dark:border-dm-border text-warm-gray dark:text-dm-text-muted'
                  }`}
                  style={
                    type === et && !linkSacrament
                      ? { borderColor: EVENT_COLORS[et].bg, color: EVENT_COLORS[et].bg, backgroundColor: EVENT_COLORS[et].bgOpacity }
                      : undefined
                  }
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: EVENT_COLORS[et].bg }}
                  />
                  {et}
                </button>
              ))}
            </div>
          </div>

          {/* Sacrament Ceremonies — redirect to Registry */}
          <div className="p-4 rounded-lg border border-gold/20 bg-gold/5">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="w-4 h-4 text-gold" />
              <span className="text-sm font-semibold text-charcoal dark:text-dm-text">Sacrament Ceremony</span>
              <HelpTooltip
                text="Sacrament ceremonies are recorded in the Registry, not here."
                detail="Baptisms, weddings, confirmations, and burials must be recorded in the Sacramental Registry first. The scheduling happens there too. This keeps the canonical record and calendar in sync with one source of truth."
              />
            </div>
            <p className="text-xs text-warm-gray mb-3">
              To schedule a sacrament ceremony, go to the Sacramental Registry and add a record there.
              The ceremony will be automatically scheduled on the calendar.
            </p>
            <div className="flex flex-wrap gap-2">
              {SACRAMENT_EVENT_TYPES.map(st => (
                <button
                  key={st.type}
                  type="button"
                  onClick={() => {
                    onClose();
                    setTimeout(() => navigate('/registry'), 100);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border border-parchment dark:border-dm-border text-warm-gray dark:text-dm-text-muted hover:border-gold hover:text-gold"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: EVENT_COLORS[st.type].bg }}
                  />
                  Add {st.label} in Registry
                  <ArrowRight className="w-3 h-3" />
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              required
            />
          </div>

          {/* Date + Times */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                required
              />
            </div>
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Start</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                required
              />
            </div>
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">End</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                required
              />
            </div>
          </div>

          {/* Location + Officiant */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Location</label>
              <select
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              >
                {LOCATIONS.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Officiant</label>
              <select
                value={officiant}
                onChange={e => setOfficiant(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              >
                <option value="">None</option>
                {PRIESTS.map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Public toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPublic(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isPublic ? 'bg-gold' : 'bg-parchment dark:bg-dm-border'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  isPublic ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-charcoal dark:text-dm-text">{isPublic ? 'Public event' : 'Private event'}</span>
          </div>

          {/* Description */}
          <div>
            <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Additional notes..."
              className="w-full px-3 py-2 rounded-lg border border-parchment bg-white text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text resize-none"
            />
          </div>

          {/* Scheduling Rules Panel */}
          {isSacramentEventType(type) && (
            <div>
              <button
                type="button"
                onClick={() => setShowRules(v => !v)}
                className="flex items-center gap-2 mb-2 text-sm font-medium text-charcoal dark:text-dm-text hover:text-gold transition-colors"
              >
                {showRules ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Scheduling Rules
              </button>
              <AnimatePresence>
                {showRules && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {renderRulesPanel()}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Sacrament Link Section */}
          {isSacramentEventType(type) && (
            <div className="border border-parchment dark:border-dm-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="label text-warm-gray dark:text-dm-text-muted flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-gold" />
                  Link to Sacrament Record
                </label>
                <button
                  type="button"
                  onClick={() => setLinkSacrament(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    linkSacrament ? 'bg-gold' : 'bg-parchment dark:bg-dm-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      linkSacrament ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <AnimatePresence>
                {linkSacrament && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden space-y-3"
                  >
                    {/* Record Type Selector */}
                    <div>
                      <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Record Type</label>
                      <div className="flex flex-wrap gap-2">
                        {(['baptism', 'marriage', 'confirmation', 'death'] as const).map(rt => (
                          <button
                            key={rt}
                            type="button"
                            onClick={() => { setSacramentRecordType(rt); setSelectedRecordId(''); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all border ${
                              sacramentRecordType === rt
                                ? 'bg-deep-navy text-white border-deep-navy'
                                : 'border-parchment dark:border-dm-border text-warm-gray dark:text-dm-text-muted hover:text-charcoal'
                            }`}
                          >
                            {rt === 'marriage' ? 'Wedding' : rt === 'death' ? 'Burial' : rt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Record Search / Selector */}
                    <div>
                      <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Select Record</label>
                      {selectedRecordSummary ? (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-gold-glow border border-gold/20">
                          <span className="text-sm text-charcoal dark:text-dm-text truncate pr-2">{selectedRecordSummary}</span>
                          <button
                            type="button"
                            onClick={() => setShowRecordSelector(v => !v)}
                            className="text-xs text-gold hover:text-gold-light font-medium flex-shrink-0"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowRecordSelector(true)}
                          className="w-full h-10 px-3 rounded-lg border border-dashed border-parchment dark:border-dm-border text-warm-gray dark:text-dm-text-muted text-sm hover:border-gold hover:text-gold transition-all text-left"
                        >
                          Search sacrament records...
                        </button>
                      )}

                      <AnimatePresence>
                        {showRecordSelector && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-2 border border-parchment dark:border-dm-border rounded-lg overflow-hidden">
                              <div className="p-2 border-b border-parchment dark:border-dm-border">
                                <input
                                  type="text"
                                  value={recordSearch}
                                  onChange={e => setRecordSearch(e.target.value)}
                                  placeholder="Search by name..."
                                  className="w-full h-8 px-2 rounded border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                                  autoFocus
                                />
                              </div>
                              <div className="max-h-[160px] overflow-y-auto">
                                {availableRecords.length === 0 ? (
                                  <p className="text-xs text-warm-gray p-3 text-center">No records found</p>
                                ) : (
                                  availableRecords.map(rec => (
                                    <button
                                      key={rec.id}
                                      type="button"
                                      onClick={() => handleSelectRecord(rec.id)}
                                      className={`w-full text-left px-3 py-2 text-xs hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-all ${
                                        selectedRecordId === rec.id ? 'bg-gold-glow' : ''
                                      }`}
                                    >
                                      <span className="text-charcoal dark:text-dm-text">{rec.label}</span>
                                    </button>
                                  ))
                                )}
                              </div>
                              <div className="p-2 border-t border-parchment dark:border-dm-border">
                                <button
                                  type="button"
                                  onClick={() => setShowRecordSelector(false)}
                                  className="text-xs text-warm-gray hover:text-charcoal transition-colors"
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-parchment dark:border-dm-border">
            {isEditing ? (
              <button
                type="button"
                onClick={onDelete}
                className="cos-btn text-sm bg-error hover:bg-[#991B1B] text-white px-4 py-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="cos-btn cos-btn-secondary text-sm px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={blockConflicts.length > 0 || timeInvalid}
                className={cn(
                  'cos-btn text-sm px-4 py-2 flex items-center gap-2',
                  blockConflicts.length > 0 || timeInvalid
                    ? 'bg-parchment-dim text-warm-gray cursor-not-allowed opacity-50'
                    : 'cos-btn-primary'
                )}
              >
                <Save className="w-4 h-4" />
                {blockConflicts.length > 0 ? 'Resolve Conflicts to Save' : timeInvalid ? 'Fix End Time to Save' : isEditing ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
