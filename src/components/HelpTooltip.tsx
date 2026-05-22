import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Position styles                                                    */
/* ------------------------------------------------------------------ */

const positionClasses: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const arrowClasses: Record<string, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 -mt-[1px] border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#FAF8F3]',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-[1px] border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-[#FAF8F3]',
  left: 'left-full top-1/2 -translate-y-1/2 -ml-[1px] border-t-[6px] border-b-[6px] border-l-[6px] border-t-transparent border-b-transparent border-l-[#FAF8F3]',
  right: 'right-full top-1/2 -translate-y-1/2 -mr-[1px] border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent border-r-[#FAF8F3]',
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HelpTooltipProps {
  /** Short explanation (1-2 sentences) */
  text: string;
  /** Longer explanation (optional) */
  detail?: string;
  /** Canon law reference (optional, for sacramental fields) */
  canonLaw?: string;
  /** Tooltip position relative to the icon */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function HelpTooltip({
  text,
  detail,
  canonLaw,
  position = 'top',
}: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <span className="relative inline-flex items-center ml-1" ref={tooltipRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-warm-gray/50 hover:text-gold transition-colors focus:outline-none focus:ring-2 focus:ring-gold/30 rounded-full"
        aria-label="Help"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open && (
        <div
          className={`absolute z-50 w-72 p-3.5 rounded-xl shadow-xl border text-sm animate-in fade-in zoom-in-95 duration-150 ${positionClasses[position]}`}
          style={{
            backgroundColor: '#FAF8F3',
            borderColor: '#EAE5D9',
          }}
          role="tooltip"
        >
          {/* Arrow */}
          <div
            className={`absolute w-0 h-0 ${arrowClasses[position]}`}
            style={{
              borderColor:
                position === 'top'
                  ? 'transparent transparent #FAF8F3 transparent'
                  : position === 'bottom'
                    ? '#FAF8F3 transparent transparent transparent'
                    : position === 'left'
                      ? 'transparent #FAF8F3 transparent transparent'
                      : 'transparent transparent transparent #FAF8F3',
            }}
          />

          {/* Close button */}
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 text-warm-gray/50 hover:text-charcoal transition-colors p-0.5 rounded-full hover:bg-cream-dark"
            aria-label="Close help"
          >
            <X className="w-3 h-3" />
          </button>

          {/* Content */}
          <div className="pr-4">
            <p className="text-charcoal font-medium mb-1 leading-snug">{text}</p>
            {detail && (
              <p className="text-warm-gray text-xs mb-1.5 leading-relaxed">{detail}</p>
            )}
            {canonLaw && (
              <p className="text-gold text-xs italic leading-relaxed">{canonLaw}</p>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
