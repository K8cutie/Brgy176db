// FirstRunDetector — achievement celebrations for ChurchOS.
// (Guided tours were sunset; this component now only surfaces milestone
// celebrations. The celebrate* helpers below are the public API pages use.)

import { useState, useEffect } from 'react';
import CelebrationToast from '@/components/CelebrationToast';
import { checkFirstAction, checkMilestone } from '@/lib/achievements';
import type { Achievement } from '@/lib/achievements';

interface FirstRunDetectorProps {
  /** Optional callback when an achievement is unlocked */
  onAchievement?: (achievement: Achievement) => void;
}

export default function FirstRunDetector({ onAchievement }: FirstRunDetectorProps) {
  const [celebration, setCelebration] = useState<Achievement | null>(null);

  // Pages fire achievements through a global event; surface them as a toast.
  useEffect(() => {
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
    <CelebrationToast
      achievement={celebration}
      onClose={() => setCelebration(null)}
    />
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
