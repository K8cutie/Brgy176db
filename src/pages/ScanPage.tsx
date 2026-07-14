import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, Upload, Check, X, Loader2, AlertTriangle, FileWarning, Link2, FilePlus2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabaseClient';
import {
  DOC_TYPE_FIELDS,
  DOC_TYPE_LABELS,
  type ScanDocType,
  type ScannedExtraction,
} from '@/lib/scanTypes';
import { commitScannedRecord } from '@/lib/scanIngest';
import {
  matchScannedForm, attachToRegistryRecord, registryTypeOfDoc,
  type MatchResult,
} from '@/lib/registryMatch';
import { uploadFormScan, formScansAvailable } from '@/lib/formScans';
import { getCurrentUserName } from '@/lib/session';
import type { RegistryRecord, RecordAttachment } from '@/lib/registryData';

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

// A document waiting in the client-side review queue. The image stays here in
// memory (object URL + the File) until the human confirms; only then is the
// original uploaded to the private form-scans bucket and linked to a record.
interface QueueItem {
  id: string;
  fileName: string;
  file: File;
  objectUrl: string;
  status: 'extracting' | 'ready' | 'error';
  errorMsg?: string;
  // Editable extraction (seeded from the AI, then the human corrects it).
  docType: ScanDocType;
  confidence: number;
  fields: Record<string, string>;
  note?: string;
  // ── Registry match decision (only for sacramental doc types) ──
  match?: MatchResult;        // candidate existing records this form may belong to
  chosenRecordId?: string;    // attach the scan to this existing record
  createNew?: boolean;        // ignore matches — create a fresh record
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

function genId(prefix = 'scan'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function confidenceTone(c: number): string {
  if (c >= 0.75) return 'bg-success/15 text-success';
  if (c >= 0.45) return 'bg-warning/15 text-warning';
  return 'bg-error/15 text-error';
}

// A readable name for a matched registry record (whichever sacrament it is).
function recordName(rec: RegistryRecord): string {
  const r = rec as unknown as Record<string, string>;
  const g = (f: string, m: string, l: string) => [r[f], r[m], r[l]].filter(Boolean).join(' ').trim();
  if (r.childLastName || r.childFirstName) return g('childFirstName', 'childMiddleName', 'childLastName');
  if (r.groomLastName || r.groomFirstName) {
    const bride = [r.brideFirstName, r.brideLastName].filter(Boolean).join(' ').trim();
    return [g('groomFirstName', 'groomMiddleName', 'groomLastName'), bride].filter(Boolean).join(' & ');
  }
  if (r.confirmandLastName || r.confirmandFirstName) return g('confirmandFirstName', 'confirmandMiddleName', 'confirmandLastName');
  if (r.deceasedLastName || r.deceasedFirstName) return g('deceasedFirstName', 'deceasedMiddleName', 'deceasedLastName');
  return r.registryNumber || 'record';
}
function recordSub(rec: RegistryRecord): string {
  const r = rec as unknown as Record<string, string>;
  const date = r.dateOfBaptism || r.dateOfMarriage || r.dateOfConfirmation || r.dateOfDeath || '';
  return [r.registryNumber && `Reg ${r.registryNumber}`, date].filter(Boolean).join(' · ');
}

// From the current (possibly edited) fields + docType, compute the match and a
// sensible default decision: a confident match pre-selects "attach"; no match
// pre-selects "create"; an ambiguous set leaves the human to pick.
function computeDecision(
  fields: Record<string, string>,
  docType: ScanDocType,
): Pick<QueueItem, 'match' | 'chosenRecordId' | 'createNew'> {
  if (!registryTypeOfDoc(docType)) return { match: undefined, chosenRecordId: undefined, createNew: undefined };
  const m = matchScannedForm({ docType, confidence: 1, fields });
  if (!m) return { match: undefined, chosenRecordId: undefined, createNew: undefined };
  if (m.action === 'auto' && m.best) return { match: m, chosenRecordId: m.best.record.id, createNew: false };
  if (m.action === 'create') return { match: m, chosenRecordId: undefined, createNew: true };
  return { match: m, chosenRecordId: undefined, createNew: false }; // 'pick' — undecided
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
      { id, fileName: file.name, file, objectUrl, status: 'extracting', docType: 'unknown', confidence: 0, fields: {} },
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
        const fields = ex.fields ?? {};
        patchItem(id, {
          status: 'ready',
          docType: ex.docType,
          confidence: typeof ex.confidence === 'number' ? ex.confidence : 0,
          fields,
          note: ex.note,
          ...computeDecision(fields, ex.docType),
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
    const isRegistry = !!registryTypeOfDoc(item.docType);
    const attaching = isRegistry && !!item.chosenRecordId && !item.createNew;

    const makeAttachment = (storagePath: string): RecordAttachment => ({
      id: genId('att'),
      storagePath,
      fileName: item.fileName,
      mimeType: item.file.type || undefined,
      provenance: 'scan-read',
      uploadedAt: new Date().toISOString(),
      uploadedBy: getCurrentUserName(),
    });

    // ── Branch A: attach the scanned original to an EXISTING matched record ──
    if (attaching && item.match) {
      const path = await uploadFormScan(item.chosenRecordId!, item.file);
      if (!path) {
        toast.error("Couldn't save the scanned image — storage is unavailable. The record was not changed.");
        return;
      }
      const ok = attachToRegistryRecord(item.match.store, item.chosenRecordId!, makeAttachment(path));
      if (ok) {
        toast.success('Original form attached to the matching record.');
        removeItem(item.id);
      } else {
        toast.error('That record could not be found — try creating a new one instead.');
      }
      return;
    }

    // ── Branch B: create a new record from the form, then attach the image ──
    const extraction: ScannedExtraction = {
      docType: item.docType,
      confidence: item.confidence,
      fields: item.fields,
      note: item.note,
    };
    const res = await commitScannedRecord(extraction);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    // Registry records get the scanned original attached as provenance.
    if (res.recordId && res.store) {
      const path = await uploadFormScan(res.recordId, item.file);
      if (path) attachToRegistryRecord(res.store, res.recordId, makeAttachment(path));
      else if (isRegistry) toast.message('Record saved — the scanned image could not be stored this time.');
    }
    toast.success(res.message);
    removeItem(item.id);
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
          Photograph or upload your paper records — Cherub reads them, finds the matching entry, and files the
          original alongside it. You just confirm.
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
                  onDocType={(dt) => patchItem(item.id, { docType: dt, ...computeDecision(item.fields, dt) })}
                  onField={(k, v) => patchItem(item.id, { fields: { ...item.fields, [k]: v } })}
                  onRecheck={() => patchItem(item.id, computeDecision(item.fields, item.docType))}
                  onChooseRecord={(recId) => patchItem(item.id, { chosenRecordId: recId, createNew: false })}
                  onCreateNew={() => patchItem(item.id, { chosenRecordId: undefined, createNew: true })}
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
  onRecheck: () => void;
  onChooseRecord: (recordId: string) => void;
  onCreateNew: () => void;
  onApprove: () => void;
  onDiscard: () => void;
}

function ReviewCard({ item, onDocType, onField, onRecheck, onChooseRecord, onCreateNew, onApprove, onDiscard }: ReviewCardProps) {
  const fields = DOC_TYPE_FIELDS[item.docType];
  const isRegistry = !!registryTypeOfDoc(item.docType);
  const attaching = isRegistry && !!item.chosenRecordId && !item.createNew;
  // A registry doc needs a decision (attach to a record OR create new) before saving.
  const decided = item.docType !== 'unknown' && (!isRegistry || !!item.chosenRecordId || !!item.createNew);
  const approveLabel = !isRegistry ? 'Approve & save' : attaching ? 'Attach original & confirm' : 'Create record & save';

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

              {/* Registry match decision */}
              {isRegistry && item.match && (
                <MatchSection
                  match={item.match}
                  chosenRecordId={item.chosenRecordId}
                  createNew={item.createNew}
                  onChoose={onChooseRecord}
                  onCreateNew={onCreateNew}
                  onRecheck={onRecheck}
                />
              )}

              {item.note && (
                <p className="text-xs text-warm-gray dark:text-dm-text-muted italic mb-3">
                  Note: {item.note}
                </p>
              )}

              {/* Editable fields. When attaching to an existing record the data
                  comes from that record, not the scan — so these are just to
                  help verify the match. */}
              {fields.length > 0 ? (
                <>
                  {attaching && (
                    <p className="text-xs text-warm-gray dark:text-dm-text-muted mb-2">
                      Read from the form (for checking the match) — the record keeps its own details:
                    </p>
                  )}
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
                </>
              ) : (
                <p className="text-xs text-warm-gray dark:text-dm-text-muted mb-4">
                  Pick a document type above to fill in and save this record.
                </p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={onApprove}
                  disabled={!decided}
                  className="cos-btn cos-btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {attaching ? <Link2 className="w-4 h-4" /> : <Check className="w-4 h-4" />} {approveLabel}
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

// ── Registry match chooser ──────────────────────────────────
interface MatchSectionProps {
  match: MatchResult;
  chosenRecordId?: string;
  createNew?: boolean;
  onChoose: (recordId: string) => void;
  onCreateNew: () => void;
  onRecheck: () => void;
}

function MatchSection({ match, chosenRecordId, createNew, onChoose, onCreateNew, onRecheck }: MatchSectionProps) {
  const hasCandidates = match.candidates.length > 0;
  const storageWarn = !formScansAvailable();

  return (
    <div className="mb-4 rounded-lg border border-parchment dark:border-dm-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-cream-dark dark:bg-dm-surface-raised">
        <span className="text-xs font-semibold text-charcoal dark:text-dm-text">
          {hasCandidates ? 'Matching existing record' : 'No existing record matched'}
        </span>
        <button
          type="button"
          onClick={onRecheck}
          className="text-[11px] text-gold hover:underline inline-flex items-center gap-1"
          title="Re-check matches after editing the fields"
        >
          <RefreshCw className="w-3 h-3" /> Re-check
        </button>
      </div>

      <div className="p-2 space-y-1.5">
        {match.candidates.map((c) => {
          const selected = chosenRecordId === c.record.id && !createNew;
          const tone = c.confidence === 'high' ? 'bg-success/15 text-success'
            : c.confidence === 'medium' ? 'bg-warning/15 text-warning' : 'bg-parchment text-warm-gray';
          return (
            <button
              key={c.record.id}
              type="button"
              onClick={() => onChoose(c.record.id)}
              className={
                'w-full text-left px-3 py-2 rounded-lg border transition-colors ' +
                (selected
                  ? 'border-gold bg-gold-glow'
                  : 'border-parchment dark:border-dm-border hover:border-gold')
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-charcoal dark:text-dm-text truncate">{recordName(c.record)}</span>
                <span className={'cos-badge shrink-0 ' + tone}>{Math.round(c.score * 100)}%</span>
              </div>
              <div className="text-[11px] text-warm-gray dark:text-dm-text-muted truncate">
                {recordSub(c.record)}{c.reasons.length ? ` — ${c.reasons.join(', ')}` : ''}
              </div>
            </button>
          );
        })}

        {/* Create-new option */}
        <button
          type="button"
          onClick={onCreateNew}
          className={
            'w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ' +
            (createNew
              ? 'border-gold bg-gold-glow'
              : 'border-parchment dark:border-dm-border hover:border-gold')
          }
        >
          <FilePlus2 className="w-4 h-4 text-gold shrink-0" />
          <span className="text-sm text-charcoal dark:text-dm-text">
            {hasCandidates ? 'None of these — create a new record' : 'Create a new record from this form'}
          </span>
        </button>
      </div>

      {storageWarn && (
        <p className="px-3 py-2 text-[11px] text-warning border-t border-parchment dark:border-dm-border">
          Image storage isn't available in this session — the record will be saved without the scanned original.
        </p>
      )}
    </div>
  );
}
