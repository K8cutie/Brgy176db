// Achievement system — celebrates first actions to build user confidence
// Think of it like a video game: first baptism = achievement unlocked!

export interface Achievement {
  id: string;
  title: string;
  message: string; // Friendly celebration message
  icon: string; // lucide icon name
  color: string; // gold, success, info, etc.
}

export const ACHIEVEMENTS: Record<string, Achievement> = {
  first_baptism: {
    id: 'first_baptism',
    title: 'First Baptism Recorded!',
    message: "Great job! The family will receive their certificate. Keep up the good work!",
    icon: 'Baby',
    color: 'gold',
  },
  first_marriage: {
    id: 'first_marriage',
    title: 'First Wedding Recorded!',
    message: "What a beautiful union! The couple's certificate is ready to print.",
    icon: 'Heart',
    color: 'maroon',
  },
  first_confirmation: {
    id: 'first_confirmation',
    title: 'First Confirmation Recorded!',
    message: 'Another soul strengthened in faith. Well done!',
    icon: 'Flame',
    color: 'purple',
  },
  first_burial: {
    id: 'first_burial',
    title: 'First Burial Recorded',
    message: 'May the departed rest in peace. The record is complete.',
    icon: 'Cross',
    color: 'charcoal',
  },
  first_family: {
    id: 'first_family',
    title: 'First Family Added!',
    message: 'Your parishioner directory is growing. Welcome them to the parish!',
    icon: 'Users',
    color: 'success',
  },
  first_collection: {
    id: 'first_collection',
    title: 'First Collection Posted!',
    message: 'Sunday offering recorded. Your financial report has been updated.',
    icon: 'DollarSign',
    color: 'success',
  },
  first_certificate: {
    id: 'first_certificate',
    title: 'First Certificate Printed!',
    message: 'The certificate looks beautiful with the parish seal. Ready to give to the family!',
    icon: 'FileCheck',
    color: 'gold',
  },
  first_calendar_event: {
    id: 'first_calendar_event',
    title: 'First Event Scheduled!',
    message: "The calendar is coming to life. Everyone can see what's happening!",
    icon: 'CalendarCheck',
    color: 'info',
  },
  first_approval: {
    id: 'first_approval',
    title: 'First Approval Given!',
    message: 'Your oversight keeps the parish finances in good order.',
    icon: 'CheckCircle',
    color: 'success',
  },
  ten_records: {
    id: 'ten_records',
    title: '10 Records Milestone!',
    message: "You're getting the hang of this! Ten sacraments recorded — the parish history is being preserved.",
    icon: 'Award',
    color: 'gold',
  },
  first_week: {
    id: 'first_week',
    title: 'One Week with ChurchOS!',
    message: "You've been using ChurchOS for a week. How does it feel? Remember, help is always available in Settings.",
    icon: 'PartyPopper',
    color: 'gold',
  },
};

// ── Achievement tracking ──
const ACHIEVEMENT_KEY = 'churchos_achievements';

export function getUnlockedAchievements(): string[] {
  try {
    const raw = localStorage.getItem(ACHIEVEMENT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function unlockAchievement(id: string): Achievement | null {
  const unlocked = getUnlockedAchievements();
  if (unlocked.includes(id)) return null; // Already unlocked

  unlocked.push(id);
  localStorage.setItem(ACHIEVEMENT_KEY, JSON.stringify(unlocked));
  return ACHIEVEMENTS[id] || null;
}

export function hasAchievement(id: string): boolean {
  return getUnlockedAchievements().includes(id);
}

export function resetAchievements() {
  localStorage.removeItem(ACHIEVEMENT_KEY);
}

// ── Helper to check and trigger achievements ──
export function checkFirstAction(type: 'baptism' | 'marriage' | 'confirmation' | 'burial' | 'family' | 'collection' | 'certificate' | 'calendar_event' | 'approval'): Achievement | null {
  const map: Record<string, string> = {
    baptism: 'first_baptism',
    marriage: 'first_marriage',
    confirmation: 'first_confirmation',
    burial: 'first_burial',
    family: 'first_family',
    collection: 'first_collection',
    certificate: 'first_certificate',
    calendar_event: 'first_calendar_event',
    approval: 'first_approval',
  };
  return unlockAchievement(map[type]);
}

export function checkMilestone(recordCount: number): Achievement | null {
  if (recordCount >= 10 && !hasAchievement('ten_records')) {
    return unlockAchievement('ten_records');
  }
  return null;
}

// ── Friendly error messages ──
export function getFriendlyErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // Common error patterns → friendly messages
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch')) {
    return "We couldn't connect to the server. Please check your internet connection and try again. If the problem persists, contact your system administrator.";
  }
  if (msg.includes('permission') || msg.includes('unauthorized') || msg.includes('403')) {
    return "It looks like you don't have permission to do that. If you think this is a mistake, ask your parish priest or administrator to check your account settings.";
  }
  if (msg.includes('not found') || msg.includes('404')) {
    return "We couldn't find what you were looking for. It may have been moved or deleted. Try refreshing the page.";
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return "The server is taking longer than expected to respond. Please try again in a moment.";
  }
  if (msg.includes('required') || msg.includes('missing')) {
    return "Some required information is missing. Please fill in all the fields marked with * and try again.";
  }
  if (msg.includes('duplicate') || msg.includes('already exists')) {
    return "It looks like that record already exists. Try searching for it instead of creating a new one.";
  }
  if (msg.includes('invalid') || msg.includes('validation')) {
    return "Some of the information doesn't look quite right. Please double-check the form and try again.";
  }

  // Default friendly message
  return "Something unexpected happened. Don't worry — your data is safe. Try refreshing the page or come back later. If this keeps happening, contact support.";
}

// ── Practice mode helpers ──
const PRACTICE_MODE_KEY = 'churchos_practice_mode';

export function isPracticeMode(): boolean {
  return localStorage.getItem(PRACTICE_MODE_KEY) === 'true';
}

export function setPracticeMode(enabled: boolean): void {
  if (enabled) {
    localStorage.setItem(PRACTICE_MODE_KEY, 'true');
  } else {
    localStorage.removeItem(PRACTICE_MODE_KEY);
  }
}

/** Wraps a save function to skip it during practice mode */
export function practiceGuard<T extends (...args: unknown[]) => unknown>(
  fn: T,
  label?: string
): T {
  return ((...args: unknown[]) => {
    if (isPracticeMode()) {
      // eslint-disable-next-line no-console
      console.log(`[Practice Mode] Skipped: ${label || fn.name}`);
      return undefined;
    }
    return fn(...args);
  }) as T;
}
