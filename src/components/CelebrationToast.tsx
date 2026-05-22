// CelebrationToast — "You Did It!" achievement celebrations
// Part of the "Gentle Hand" UX system for ChurchOS
// Shows a beautiful, celebratory toast when a user unlocks an achievement

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, PartyPopper, Award, Baby, Heart, Flame, Users,
  DollarSign, FileCheck, CalendarCheck, CheckCircle, Cross,
} from 'lucide-react';
import type { Achievement } from '@/lib/achievements';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Baby,
  Heart,
  Flame,
  Users,
  DollarSign,
  FileCheck,
  CalendarCheck,
  CheckCircle,
  Cross,
  Award,
  PartyPopper,
};

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  gold: { bg: 'bg-gold/10', text: 'text-gold', border: 'border-gold/30' },
  success: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  info: { bg: 'bg-info/10', text: 'text-info', border: 'border-info/30' },
  maroon: { bg: 'bg-maroon/10', text: 'text-maroon', border: 'border-maroon/30' },
  purple: { bg: 'bg-purple/10', text: 'text-purple', border: 'border-purple/30' },
  charcoal: { bg: 'bg-charcoal/10', text: 'text-charcoal', border: 'border-charcoal/30' },
};

interface CelebrationToastProps {
  achievement: Achievement | null;
  onClose: () => void;
}

export default function CelebrationToast({ achievement, onClose }: CelebrationToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (achievement) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onClose, 300);
      }, 6000); // Show for 6 seconds
      return () => clearTimeout(timer);
    }
  }, [achievement, onClose]);

  if (!achievement) return null;

  const Icon = iconMap[achievement.icon] || Award;
  const colors = colorMap[achievement.color] || colorMap.gold;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.95 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md"
        >
          <div className={`bg-white dark:bg-dm-surface rounded-xl shadow-xl border-2 ${colors.border} p-4 flex items-start gap-3 mx-4`}>
            {/* Icon */}
            <motion.div
              initial={{ rotate: -10, scale: 0.5 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
              className={`w-12 h-12 rounded-full ${colors.bg} flex items-center justify-center flex-shrink-0`}
            >
              <Icon className={`w-6 h-6 ${colors.text}`} />
            </motion.div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-charcoal dark:text-dm-text flex items-center gap-2">
                {achievement.title}
                <motion.span
                  initial={{ rotate: -20, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                >
                  <PartyPopper className="w-4 h-4 text-gold" />
                </motion.span>
              </h4>
              <p className="text-sm text-warm-gray dark:text-dm-text-muted mt-1 leading-relaxed">
                {achievement.message}
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={() => {
                setVisible(false);
                setTimeout(onClose, 300);
              }}
              className="text-warm-gray/50 hover:text-charcoal dark:hover:text-dm-text transition-colors mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
