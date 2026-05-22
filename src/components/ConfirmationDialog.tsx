import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const variantStyles = {
    danger: 'bg-error hover:bg-[#991B1B]',
    warning: 'bg-warning hover:bg-[#9A7B3D]',
    info: 'bg-info hover:bg-[#2D5AA0]',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
            className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-error/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-error" />
                </div>
                <h2 className="heading-md text-charcoal dark:text-dm-text">{title}</h2>
              </div>
              <button
                onClick={onCancel}
                className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text dark:hover:bg-dm-surface-raised"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="body-md text-warm-gray dark:text-dm-text-muted">{message}</p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
              <button
                onClick={onCancel}
                className="cos-btn cos-btn-secondary text-sm"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={'cos-btn text-sm text-white ' + variantStyles[variant]}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
