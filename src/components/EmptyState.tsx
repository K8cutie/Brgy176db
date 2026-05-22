import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Lightbulb } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EmptyStateProps {
  /** Lucide icon to display in the circle */
  icon: LucideIcon;
  /** Friendly title (e.g., "No baptism records yet") */
  title: string;
  /** Warm description explaining what this area is for */
  description: string;
  /** Label for the primary action button (optional) */
  actionLabel?: string;
  /** Icon for the action button (optional) */
  actionIcon?: LucideIcon;
  /** Callback when action button is clicked */
  onAction?: () => void;
  /** A helpful tip for new users (shown in gold tip box) */
  tip?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
  tip,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      {/* Icon Circle */}
      <div className="w-20 h-20 rounded-full bg-parchment/60 flex items-center justify-center mb-5">
        <Icon className="w-10 h-10 text-warm-gray/40" />
      </div>

      {/* Title */}
      <h3 className="heading-md text-charcoal dark:text-dm-text mb-2 max-w-md">
        {title}
      </h3>

      {/* Description */}
      <p className="body-sm text-warm-gray dark:text-dm-text-muted max-w-md mb-4 leading-relaxed">
        {description}
      </p>

      {/* Helpful Tip */}
      {tip && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="bg-gold/5 border border-gold/20 rounded-lg px-4 py-3 mb-5 max-w-md"
        >
          <p className="text-xs text-gold flex items-start gap-2.5 text-left leading-relaxed">
            <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {tip}
          </p>
        </motion.div>
      )}

      {/* Action Button */}
      {actionLabel && onAction && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          onClick={onAction}
          className="cos-btn cos-btn-primary flex items-center gap-2"
        >
          {ActionIcon && <ActionIcon className="w-4 h-4" />}
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  );
}
