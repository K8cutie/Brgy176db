import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Smartphone, MessageCircle, Calendar, Check, ChevronDown } from 'lucide-react';
import { generatePriestIcs, generateTextSummary, downloadIcs } from '@/lib/icsGenerator';
import { getPriestName, getParishName } from '@/lib/parishConfig';

// QRCode is loaded dynamically to avoid SSR issues
let QRCodeModule: typeof import('qrcode') | null = null;

interface PriestScheduleExportProps {
  onClose: () => void;
}

export default function PriestScheduleExport({ onClose }: PriestScheduleExportProps) {
  const priestName = getPriestName();
  const parishName = getParishName();

  /* ── Options ── */
  const [days, setDays] = useState(30);
  const [includeMass, setIncludeMass] = useState(true);
  const [includeSacraments, setIncludeSacraments] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);

  /* ── Generated content ── */
  const [icsContent, setIcsContent] = useState('');
  const [textSummary, setTextSummary] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [eventCount, setEventCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'qr' | 'download' | 'text'>('qr');

  /* ── Load QR library once ── */
  useEffect(() => {
    import('qrcode').then((mod) => {
      QRCodeModule = mod;
    });
  }, []);

  /* ── Regenerate on option change ── */
  const regenerate = useCallback(() => {
    const opts = { days, includeMass, includeSacraments, includeEvents };
    const ics = generatePriestIcs(opts);
    const text = generateTextSummary(opts);
    setIcsContent(ics);
    setTextSummary(text);

    // Count events
    const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
    setEventCount(count);

    // Generate QR code pointing to a data URL (for phone scan)
    // We encode the .ics content as base64 in a data URL the phone can download
    if (QRCodeModule) {
      const b64 = btoa(unescape(encodeURIComponent(ics)));
      const dataUrl = `data:text/calendar;base64,${b64}`;
      QRCodeModule.toDataURL(dataUrl, {
        width: 280,
        margin: 2,
        color: { dark: '#1A1A2E', light: '#FDFCF8' },
        errorCorrectionLevel: 'M',
      }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
    }
  }, [days, includeMass, includeSacraments, includeEvents]);

  useEffect(() => {
    // Small delay to let QR lib load on first mount
    const timer = setTimeout(regenerate, 100);
    return () => clearTimeout(timer);
  }, [regenerate]);

  /* ── Copy text summary ── */
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(textSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = textSummary;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  /* ── Handle .ics download ── */
  const handleDownload = () => {
    downloadIcs(icsContent);
  };

  /* ── Days options ── */
  const dayOptions = [
    { value: 7, label: 'This week' },
    { value: 14, label: 'Next 2 weeks' },
    { value: 30, label: 'This month' },
    { value: 60, label: 'Next 2 months' },
    { value: 90, label: 'Next 3 months' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-start justify-center p-4 pt-10 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[520px] overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-deep-navy flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="heading-lg text-charcoal dark:text-dm-text">Sync to Phone</h2>
              <p className="body-xs text-warm-gray dark:text-dm-text-muted">
                {priestName} — {eventCount} upcoming events
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="px-6 py-4 bg-cream-dark/40 dark:bg-dm-surface-raised/40 border-b border-parchment dark:border-dm-border">
          {/* Date range */}
          <div className="mb-3">
            <label className="label block text-warm-gray mb-1.5">Date range</label>
            <div className="relative">
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-9 w-full px-3 pr-8 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
              >
                {dayOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-warm-gray absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Event type toggles */}
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMass}
                onChange={(e) => setIncludeMass(e.target.checked)}
                className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold"
              />
              <span className="body-sm text-charcoal dark:text-dm-text">Mass schedule</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSacraments}
                onChange={(e) => setIncludeSacraments(e.target.checked)}
                className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold"
              />
              <span className="body-sm text-charcoal dark:text-dm-text">Sacraments</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeEvents}
                onChange={(e) => setIncludeEvents(e.target.checked)}
                className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold"
              />
              <span className="body-sm text-charcoal dark:text-dm-text">Parish events</span>
            </label>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-parchment dark:border-dm-border">
          {[
            { key: 'qr' as const, icon: Smartphone, label: 'Scan QR Code' },
            { key: 'download' as const, icon: Download, label: 'Download File' },
            { key: 'text' as const, icon: MessageCircle, label: 'Copy Text' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 body-sm font-medium transition-colors relative ${
                activeTab === tab.key
                  ? 'text-deep-navy dark:text-gold'
                  : 'text-warm-gray hover:text-charcoal dark:text-dm-text-muted dark:hover:text-dm-text'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="exportTab"
                  className="absolute bottom-0 left-4 right-4 h-0.5 bg-gold rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-6 py-5 min-h-[340px]">
          <AnimatePresence mode="wait">
            {/* QR CODE TAB */}
            {activeTab === 'qr' && (
              <motion.div
                key="qr"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex flex-col items-center"
              >
                {qrDataUrl ? (
                  <>
                    <div className="p-3 bg-white rounded-xl shadow-sm border border-parchment dark:border-dm-border">
                      <img
                        src={qrDataUrl}
                        alt="Scan to download calendar"
                        className="w-[260px] h-[260px]"
                      />
                    </div>
                    <p className="body-sm text-charcoal dark:text-dm-text font-medium mt-4 text-center">
                      Scan with your phone camera
                    </p>
                    <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1 text-center max-w-[340px]">
                      iPhone: Open Camera app and point at the code. Tap the notification to add to Calendar.
                      <br />
                      Android: Open Camera or Google Lens. Tap the link to download and import.
                    </p>
                  </>
                ) : (
                  <div className="w-[260px] h-[260px] bg-cream-dark/50 dark:bg-dm-surface-raised/50 rounded-xl flex items-center justify-center">
                    <p className="body-sm text-warm-gray">Generating QR code...</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* DOWNLOAD TAB */}
            {activeTab === 'download' && (
              <motion.div
                key="download"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-forest-green/10 flex items-center justify-center mb-4">
                  <Calendar className="w-8 h-8 text-forest-green" />
                </div>
                <h3 className="heading-md text-charcoal dark:text-dm-text">Download Calendar File</h3>
                <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-2 max-w-[360px]">
                  Downloads a <strong>.ics</strong> file that opens in Apple Calendar, Google Calendar, Outlook, or any calendar app on your phone or computer.
                </p>

                <div className="mt-4 p-3 bg-cream-dark/40 dark:bg-dm-surface-raised/40 rounded-lg text-left w-full max-w-[360px]">
                  <p className="body-xs text-warm-gray dark:text-dm-text-muted font-medium mb-1">File includes:</p>
                  <ul className="body-xs text-charcoal dark:text-dm-text space-y-0.5">
                    {includeMass && <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-forest-green" /> Regular Mass schedule</li>}
                    {includeSacraments && <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-forest-green" /> Sacrament ceremonies</li>}
                    {includeEvents && <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-forest-green" /> Parish events</li>}
                    <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-forest-green" /> {eventCount} total events</li>
                  </ul>
                </div>

                <button
                  onClick={handleDownload}
                  className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-deep-navy text-white rounded-lg hover:bg-deep-navy/90 transition-colors body-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download .ics File
                </button>

                <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-3">
                  After downloading, open the file to automatically import into your calendar app.
                </p>
              </motion.div>
            )}

            {/* TEXT TAB */}
            {activeTab === 'text' && (
              <motion.div
                key="text"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex flex-col"
              >
                <p className="body-sm text-warm-gray dark:text-dm-text-muted mb-3 text-center">
                  Copy and paste this into WhatsApp, Messenger, or SMS to share your schedule.
                </p>

                <div className="bg-cream-dark/50 dark:bg-dm-surface-raised/50 rounded-lg p-4 max-h-[240px] overflow-y-auto">
                  <pre className="body-xs text-charcoal dark:text-dm-text whitespace-pre-wrap font-mono leading-relaxed">
                    {textSummary}
                  </pre>
                </div>

                <button
                  onClick={handleCopyText}
                  className={`mt-4 self-center inline-flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors body-sm font-medium ${
                    copied
                      ? 'bg-forest-green text-white'
                      : 'bg-gold text-charcoal hover:bg-gold/90'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <MessageCircle className="w-4 h-4" />
                      Copy for WhatsApp
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 bg-cream-dark/30 dark:bg-dm-surface-raised/30 border-t border-parchment dark:border-dm-border">
          <p className="body-xs text-warm-gray dark:text-dm-text-muted text-center">
            This schedule is generated from {parishName} records and includes all events assigned to {priestName}.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
