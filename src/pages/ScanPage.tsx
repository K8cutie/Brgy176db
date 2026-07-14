import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, Upload, Check, X, Loader2, AlertTriangle, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabaseClient';
import {
  DOC_TYPE_FIELDS,
  DOC_TYPE_LABELS,
  type ScanDocType,
  type ScannedExtraction,
} from '@/lib/scanTypes';
import { commitScannedRecord } from '@/lib/scanIngest';

// ── Edge-function response shape ─────────────────────────────
// Mirrors supabase/functions/scan-extract: { ok:true, extraction } on success,
// { ok:false, error, request_id? } otherwise. We narrow the cloud client's
// Edge-Function caller the same way AiAssistant.tsx does (the shared Supabase
// type doesn't declare `.functions`).
type ScanResult =
  | { ok: true; extraction: ScannedExtraction }
  | { ok: false; error: string; request_id?: string };

type SupabaseFunctions = {
  functions: {
    invoke: (
      name: string,
      opts: { body: unknown },
    ) => Promise<{ data: ScanResult | null; error: unknown }>;
  };
};

// A document waiting in the client-side review queue. The image stays here only
// (object URL / in-memory) — V1 never uploads it to storage; only the approved
// RECORD is persisted, via commitScannedRecord.
interface QueueItem {
  id: string;
  fileName: string;
  objectUrl: string;
  status: 'extracting' | 'ready' | 'error';
  errorMsg?: string;
  // Editable extraction (seeded from the AI, then the human corrects it).
  docType: ScanDocType;
  confidence: number;
  fields: Record<string, string>;
  note?: string;
}

const DOC_TYPE_OPTIONS: ScanDocType[] = ['collection', 'expense', 'baptism', 'unknown'];

// Prettify a camelCase field key into a human label: 'massTime' → 'Mass Time'.
function labelize(key: string): string {
  const s = key.replace(/([A-Z])/g, ' $1');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Read a File as base64 WITHOUT the `data:...;base64,` prefix (what the edge
// function expects for the `image` field).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

function genId(): string {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function confidenceTone(c: number): string {
  if (c >= 0.75) return 'bg-success/15 text-success';
  if (c >= 0.45) return 'bg-warning/15 text-warning';
  return 'bg-error/15 text-error';
}

export default function ScanPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  // Set once the edge function reports the AI key isn't configured. We stop
  // accepting uploads and show a calm not-configured panel instead of spamming
  // retries (mirrors AiAssistant's cloud no-key empty state).
  const [notConfigured, setNotConfigured] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke every outstanding object URL on unmount so photos don't leak memory.
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;
  useEffect(() => {
    return () => {
      queueRef.current.forEach((it) => URL.revokeObjectURL(it.objectUrl));
    };
  }, []);

  const patchItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setQueue((q) => {
      const gone = q.find((it) => it.id === id);
      if (gone) URL.revokeObjectURL(gone.objectUrl);
      return q.filter((it) => it.id !== id);
    });
  }, []);

  // Extract one file: add a placeholder card, call the edge function, then fill
  // it in (or flag the error). If the key isn't configured we flip to the
  // not-configured panel and stop.
  const extractFile = useCallback(async (file: File) => {
    const id = genId();
    const objectUrl = URL.createObjectURL(file);
    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

    setQueue((q) => [
      ...q,
      { id, fileName: file.name, objectUrl, status: 'extracting', docType: 'unknown', confidence: 0, fields: {} },
    ]);

    // Only PNG/JPEG are supported by the vision call; reject others up front so
    // the human isn't left wondering why a HEIC/WebP produced nothing.
    if (file.type && file.type !== 'image/png' && file.type !== 'image/jpeg') {
      patchItem(id, { status: 'error', errorMsg: 'Unsupported image type — please use a JPG or PNG photo.' });
      return;
    }

    try {
      const image = await fileToBase64(file);
      const supa = await getSupabase();
      const { data, error: invokeErr } = await (supa as unknown as SupabaseFunctions).functions.invoke(
        'scan-extract',
        { body: { image, mimeType } },
      );

      if (invokeErr || !data) {
        patchItem(id, { status: 'error', errorMsg: "Couldn't reach the document reader. Check your connection and try again." });
        return;
      }

      if (data.ok) {
        const ex = data.extraction;
        patchItem(id, {
          status: 'ready',
          docType: ex.docType,
          confidence: typeof ex.confidence === 'number' ? ex.confidence : 0,
          fields: ex.fields ?? {},
          note: ex.note,
        });
        return;
      }

      // Not switched on: stop everything and show the calm panel. Drop this
      // placeholder and any other still-extracting cards; don't retry.
      if (data.error === 'no_key') {
        setNotConfigured(true);
        setQueue((q) => {
          q.filter((it) => it.status === 'extracting').forEach((it) => URL.revokeObjectURL(it.objectUrl));
          return q.filter((it) => it.status !== 'extracting');
        });
        return;
      }

      const msg =
        data.error === 'rate_limited' ? 'Too many scans at once — wait a moment and try again.'
        : data.error === 'budget_exceeded' ? 'The parish AI budget for today has been reached.'
        : data.error === 'ai_disabled' ? 'The document reader has been switched off for this parish.'
        : data.error === 'no_parish' ? 'No parish is linked to your account, so the reader is unavailable.'
        : data.error === 'payload_too_large' ? 'That photo is too large — try a smaller or more compressed image.'
        : data.error === 'bad_request' ? "That file couldn't be read as a photo. Try a clear JPG or PNG."
        : 'The document reader had a problem with this file.';
      patchItem(id, { status: 'error', errorMsg: msg + (data.request_id ? ` (ref ${data.request_id})` : '') });
    } catch {
      patchItem(id, { status: 'error', errorMsg: "Couldn't read that file. Please try another photo." });
    }
  }, [patchItem]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || notConfigured) return;
    Array.from(files).forEach((f) => { void extractFile(f); });
  }, [extractFile, notConfigured]);

  const approve = useCallback(async (item: QueueItem) => {
    const extraction: ScannedExtraction = {
      docType: item.docType,
      confidence: item.confidence,
      fields: item.fields,
      note: item.note,
    };
    const res = await commitScannedRecord(extraction);
    if (res.ok) {
      toast.success(res.message);
      removeItem(item.id);
    } else {
      toast.error(res.message);
    }
  }, [removeItem]);

  return (
    <div>
      {/* ── Header ─────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <ScanLine className="w-7 h-7 text-gold" />
          <h1 className="display-md text-charcoal dark:text-dm-text font-playfair">Scan documents</h1>
        </div>
        <p className="body-md text-warm-gray dark:text-dm-text-muted max-w-2xl">
          Photograph or upload your paper records — Cherub reads them, you confirm, they land in ChurchOS.
        </p>
        <div className="mt-3 h-[3px] w-24 bg-gold rounded-full" />
      </div>

      {notConfigured ? (
        // ── Not-configured (no AI key) ─────────────
        <div className="cos-card p-8 text-center max-w-lg mx-auto">
          <div className="flex justify-center mb-3">
            <FileWarning className="w-9 h-9 text-gold" />
          </div>
          <p className="text-sm font-medium text-charcoal dark:text-dm-text mb-1">
            The document reader isn't switched on yet
          </p>
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">
            Your parish admin needs to add the AI key before Cherub can read your paper records. Once it's set, come back here and upload again.
          </p>
        </div>
      ) : (
        <>
          {/* ── Upload zone ───────────────────────── */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
            className={
              'cos-card cursor-pointer border-2 border-dashed transition-colors p-10 text-center ' +
              (dragOver
                ? 'border-gold bg-gold-glow'
                : 'border-parchment dark:border-dm-border hover:border-gold')
            }
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
            />
            <div className="flex justify-center mb-3">
              <Upload className="w-8 h-8 text-gold" />
            </div>
            <p className="text-sm font-medium text-charcoal dark:text-dm-text">
              Drag photos here, or click to choose
            </p>
            <p className="text-xs text-warm-gray dark:text-dm-text-muted mt-1">
              JPG or PNG — collection sheets, receipts &amp; vouchers, or baptismal records. You can pick several at once.
            </p>
          </div>

          {/* ── Review queue ──────────────────────── */}
          {queue.length > 0 && (
            <div className="mt-6 space-y-4">
              <h2 className="text-sm font-semibold text-charcoal dark:text-dm-text">
                Review &amp; confirm ({queue.length})
              </h2>
              {queue.map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  onDocType={(dt) => patchItem(item.id, { docType: dt })}
                  onField={(k, v) => patchItem(item.id, { fields: { ...item.fields, [k]: v } })}
                  onApprove={() => approve(item)}
                  onDiscard={() => removeItem(item.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── One review card ─────────────────────────────────────────
interface ReviewCardProps {
  item: QueueItem;
  onDocType: (dt: ScanDocType) => void;
  onField: (key: string, value: string) => void;
  onApprove: () => void;
  onDiscard: () => void;
}

function ReviewCard({ item, onDocType, onField, onApprove, onDiscard }: ReviewCardProps) {
  const fields = DOC_TYPE_FIELDS[item.docType];

  return (
    <div className="cos-card p-0 overflow-hidden">
      <div className="flex flex-col md:flex-row">
        {/* Thumbnail */}
        <div className="md:w-56 shrink-0 bg-cream-dark dark:bg-dm-surface-raised flex items-center justify-center p-3">
          <img
            src={item.objectUrl}
            alt={item.fileName}
            className="max-h-56 md:max-h-64 w-auto object-contain rounded-lg"
          />
        </div>

        {/* Body */}
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-warm-gray dark:text-dm-text-muted truncate max-w-[16rem]" title={item.fileName}>
              {item.fileName}
            </span>
            {item.status === 'ready' && (
              <span className={'cos-badge ' + confidenceTone(item.confidence)}>
                {Math.round(item.confidence * 100)}% confident
              </span>
            )}
          </div>

          {item.status === 'extracting' && (
            <div className="flex items-center gap-2 text-sm text-warm-gray dark:text-dm-text-muted py-6">
              <Loader2 className="w-4 h-4 animate-spin text-gold" />
              Reading the document…
            </div>
          )}

          {item.status === 'error' && (
            <div className="py-4">
              <div className="flex items-start gap-2 text-sm text-error mb-4">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{item.errorMsg}</span>
              </div>
              <button onClick={onDiscard} className="cos-btn cos-btn-secondary text-sm flex items-center gap-1.5">
                <X className="w-4 h-4" /> Remove
              </button>
            </div>
          )}

          {item.status === 'ready' && (
            <>
              {/* Document type */}
              <label className="block mb-3">
                <span className="text-xs font-medium text-charcoal dark:text-dm-text">Document type</span>
                <select
                  value={item.docType}
                  onChange={(e) => onDocType(e.target.value as ScanDocType)}
                  className="mt-1 w-full h-9 px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                >
                  {DOC_TYPE_OPTIONS.map((dt) => (
                    <option key={dt} value={dt}>{DOC_TYPE_LABELS[dt]}</option>
                  ))}
                </select>
              </label>

              {item.note && (
                <p className="text-xs text-warm-gray dark:text-dm-text-muted italic mb-3">
                  Note: {item.note}
                </p>
              )}

              {/* Editable fields */}
              {fields.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {fields.map((key) => (
                    <label key={key} className="block">
                      <span className="text-xs font-medium text-charcoal dark:text-dm-text">{labelize(key)}</span>
                      <input
                        type="text"
                        value={item.fields[key] ?? ''}
                        onChange={(e) => onField(key, e.target.value)}
                        className="mt-1 w-full h-9 px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-warm-gray dark:text-dm-text-muted mb-4">
                  Pick a document type above to fill in and save this record.
                </p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={onApprove}
                  disabled={item.docType === 'unknown'}
                  className="cos-btn cos-btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" /> Approve &amp; save
                </button>
                <button onClick={onDiscard} className="cos-btn cos-btn-secondary text-sm flex items-center gap-1.5">
                  <X className="w-4 h-4" /> Discard
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
