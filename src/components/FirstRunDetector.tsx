// FirstRunDetector — auto-starts tours on first login and module navigation
// Part of the "Gentle Hand" UX system for ChurchOS
// Detects first-time users and gently guides them through the app

import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import TourGuide from '@/components/TourGuide';
import CelebrationToast from '@/components/CelebrationToast';
import {
  shouldRunFirstLogin,
  firstLoginTour,
  markTourCompleted,
  getAvailableTours,
  getTourStatus,
} from '@/lib/tours';
import type { Step as TourStep } from 'react-joyride';
import { checkFirstAction, checkMilestone } from '@/lib/achievements';
import type { Achievement } from '@/lib/achievements';

interface FirstRunDetectorProps {
  /** Optional callback when an achievement is unlocked */
  onAchievement?: (achievement: Achievement) => void;
}

export default function FirstRunDetector({ onAchievement }: FirstRunDetectorProps) {
  const location = useLocation();
  const [runFirstLogin, setRunFirstLogin] = useState(false);
  const [activeTour, setActiveTour] = useState<{ id: string; steps: TourStep[] } | null>(null);
  const [celebration, setCelebration] = useState<Achievement | null>(null);

  // Check first login on mount
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('churchos_user') || '{}');
    if (user.role && shouldRunFirstLogin()) {
      // Small delay so the page renders first
      const timer = setTimeout(() => setRunFirstLogin(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Check for per-module tours when navigating
  useEffect(() => {
    const path = location.pathname;
    const user = JSON.parse(localStorage.getItem('churchos_user') || '{}');
    if (!user.role) return;

    const available = getAvailableTours(user.role);
    const tourMap: Record<string, string> = {
      '/registry': 'registry',
      '/directory': 'directory',
      '/calendar': 'calendar',
      '/finance': 'finance',
      '/ministries': 'ministries',
      '/ssdm': 'ssdm',
      '/reports': 'reports',
      '/settings': 'settings',
    };

    const tourId = tourMap[path];
    if (tourId) {
      const tour = available.find((t) => t.id === tourId);
      if (tour) {
        const status = getTourStatus(tourId);
        if (!status.completed && !status.skipped) {
          // Auto-start module tour after a delay (let user see the page first)
          const timer = setTimeout(() => {
            setActiveTour({ id: tour.id, steps: tour.steps });
          }, 3000);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [location.pathname]);

  // ── Public API: trigger achievement celebrations ──
  useEffect(() => {
    // Expose a global handler so pages can trigger celebrations
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<Achievement>;
      if (customEvent.detail) {
        setCelebration(customEvent.detail);
        onAchievement?.(customEvent.detail);
      }
    };
    window.addEventListener('churchos:achievement', handler);
    return () => window.removeEventListener('churchos:achievement', handler);
  }, [onAchievement]);

  return (
    <>
      {/* First login tour */}
      <TourGuide
        tourId={firstLoginTour.id}
        steps={firstLoginTour.steps}
        run={runFirstLogin}
        onComplete={() => {
          markTourCompleted(firstLoginTour.id);
          setRunFirstLogin(false);
        }}
        onSkip={() => {
          markTourCompleted(firstLoginTour.id);
          setRunFirstLogin(false);
        }}
      />

      {/* Module-specific tour */}
      {activeTour && (
        <TourGuide
          tourId={activeTour.id}
          steps={activeTour.steps}
          run={true}
          onComplete={() => setActiveTour(null)}
          onSkip={() => setActiveTour(null)}
        />
      )}

      {/* Celebration toast */}
      <CelebrationToast
        achievement={celebration}
        onClose={() => setCelebration(null)}
      />
    </>
  );
}

// ── Helper to trigger achievements from any page ──
export function triggerAchievement(achievement: Achievement | null): void {
  if (achievement) {
    window.dispatchEvent(
      new CustomEvent('churchos:achievement', { detail: achievement })
    );
  }
}

// Re-export achievement checkers with celebration triggering
export function celebrateFirstAction(
  type: 'baptism' | 'marriage' | 'confirmation' | 'burial' | 'family' | 'collection' | 'certificate' | 'calendar_event' | 'approval'
): Achievement | null {
  const achievement = checkFirstAction(type);
  triggerAchievement(achievement);
  return achievement;
}

export function celebrateMilestone(recordCount: number): Achievement | null {
  const achievement = checkMilestone(recordCount);
  triggerAchievement(achievement);
  return achievement;
}
