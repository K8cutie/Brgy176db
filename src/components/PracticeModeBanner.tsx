// PracticeModeBanner — shows when Practice Mode is enabled
// Part of the "Gentle Hand" UX system for ChurchOS
// A gentle reminder that nothing will be saved while learning

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, X } from 'lucide-react';
import { isPracticeMode } from '@/lib/achievements';

export default function PracticeModeBanner() {
  const [dismissed, setDismissed] = useState(false);
  const practiceMode = isPracticeMode();

  if (!practiceMode || dismissed) return null;

  return (
    <AnimatePresence>
      {practiceMode && !dismissed && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="bg-info/10 dark:bg-info/20 border-b border-info/20 dark:border-info/30 px-4 py-2.5 flex items-center justify-center gap-2 text-sm"
        >
          <motion.div
            initial={{ rotate: -15, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 10, stiffness: 200 }}
          >
            <GraduationCap className="w-4 h-4 text-info flex-shrink-0" />
          </motion.div>
          <span className="text-info dark:text-info font-medium">
            Practice Mode — You are learning! Nothing you do here will be saved.
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="text-info/60 hover:text-info dark:text-info/70 dark:hover:text-info transition-colors ml-2 p-0.5 rounded hover:bg-info/10"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
