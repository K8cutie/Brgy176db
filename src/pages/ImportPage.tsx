// ============================================
// ChurchOS PIMS Legacy Data Import Wizard
// 5-step guided import: Upload -> Detect -> Map -> Preview -> Import
// Designed for non-technical church staff
// ============================================

import { useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, Database, ArrowRight, ArrowLeft, CheckCircle2,
  AlertCircle, XCircle, MapPin, Eye, Play, Download, RotateCcw,
  FileSpreadsheet, FileCode, Table, ChevronDown, ChevronUp,
  Ban, Info, HelpCircle, Check, X, Sparkles, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import EmptyState from '@/components/EmptyState';
import HelpTooltip from '@/components/HelpTooltip';
import {
  type ImportTarget, type ImportFileType, type ImportMapping,
  type ImportValidationError, type ImportValidationWarning,
  type ImportResult, type ImportHistoryEntry, type SampleLegacyFile,
  type DuplicateInfo,
  detectTargetModule, detectFileType, autoMapFields, validateImportRow,
  getImportHistory, addImportHistory, clearImportHistory,
  parseCSV, parseXLSX, detectParsedIssues, mapImportRow, detectDuplicates,
  buildImportedRecord, missingRequiredFields, type ImportedRecord,
  REGISTRY_FIELD_MAP, DIRECTORY_FIELD_MAP, FINANCE_FIELD_MAP,
  CHURCHOS_REGISTRY_FIELDS, CHURCHOS_DIRECTORY_FIELDS, CHURCHOS_FINANCE_FIELDS,
  SAMPLE_BAPTISM_DBF, SAMPLE_MARRIAGE_DBF, SAMPLE_FINANCE_CSV,
} from '@/lib/importEngine';
import { parseParArchiveToSamples, parseDbfToSample } from '@/lib/pimsPar';
import { usePersistedState } from '@/hooks/usePersistedState';
import { KEYS } from '@/lib/storageKeys';
import {
  type BaptismRecord, type MarriageRecord, type ConfirmationRecord, type DeathRecord,
  baptismRecords as seedBaptisms, marriageRecords as seedMarriages,
  confirmationRecords as seedConfirmations, deathRecords as seedDeaths,
} from '@/lib/registryData';
import { type Family, families as seedFamilies } from '@/lib/directoryData';
import { type JournalEntry, journalEntries as seedJournalEntries } from '@/lib/financeData';

// ── Step Types ──
type WizardStep = 'upload' | 'detect' | 'map' | 'preview' | 'import';

// ── Animation ──
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

// ── Target Module Labels ──
const MODULE_LABELS: Record<ImportTarget, string> = {
  registry: 'Sacramental Registry',
  directory: 'Parishioner Directory',
  calendar: 'Parish Calendar',
  finance: 'Financial Records',
};

const MODULE_ICONS: Record<ImportTarget, React.ComponentType<{ className?: string }>> = {
  registry: FileText,
  directory: Database,
  calendar: Table,
  finance: FileSpreadsheet,
};

// ── File Type Labels ──
const FILE_TYPE_LABELS: Record<ImportFileType, string> = {
  dbf: 'FoxPro / DBF',
  csv: 'CSV (Excel Export)',
  xlsx: 'Excel (.xlsx)',
  json: 'JSON',
};

// ── Local validation wrapper ──
// The shared validateImportRow treats any target field whose key contains
// "Number" as numeric (parseFloat). registryNumber values are alphanumeric
// (e.g. "B-2015-0042"), so parseFloat → NaN → a bogus "Invalid number" error.
// Registry numbers are free-form identifiers, not numeric — strip that
// false-positive here without touching the shared engine.
function validateRow(
  row: Record<string, string>,
  mappings: ImportMapping[]
): { errors: ImportValidationError[]; warnings: ImportValidationWarning[] } {
  const { errors, warnings } = validateImportRow(row, mappings);
  const filteredErrors = errors.filter(e => {
    if (e.code !== 'invalid_number') return true;
    const mapping = mappings.find(m => m.sourceField === e.field);
    // Keep the error unless it's the alphanumeric registryNumber field.
    return mapping?.targetField !== 'registryNumber';
  });
  return { errors: filteredErrors, warnings };
}

// ── Main Component ──

export default function ImportPage() {
  const [step, setStep] = useState<WizardStep>('upload');
  const [direction, setDirection] = useState(1);
  const [selectedSample, setSelectedSample] = useState<SampleLegacyFile | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; type: ImportFileType } | null>(null);
  const [detectedModule, setDetectedModule] = useState<ImportTarget>('registry');
  const [mappings, setMappings] = useState<ImportMapping[]>([]);
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  // rowIndex -> true means the user chose "import anyway" for a flagged duplicate.
  const [dupOverrides, setDupOverrides] = useState<Record<number, boolean>>({});
  // A .PAR backup holds several registers; when >1 has records the user picks
  // which one to import. null = no multi-register backup pending.
  const [parRegisters, setParRegisters] = useState<SampleLegacyFile[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Existing records per module (same keys + seeds the module pages use) —
  // read for duplicate detection AND written through on import, so imported
  // records land in the exact stores the Registry/Directory/Finance pages read.
  const [existingBaptisms, setExistingBaptisms] = usePersistedState<BaptismRecord[]>(KEYS.baptismRecords, seedBaptisms);
  const [existingMarriages, setExistingMarriages] = usePersistedState<MarriageRecord[]>(KEYS.marriageRecords, seedMarriages);
  const [existingConfirmations, setExistingConfirmations] = usePersistedState<ConfirmationRecord[]>(KEYS.confirmationRecords, seedConfirmations);
  const [existingDeaths, setExistingDeaths] = usePersistedState<DeathRecord[]>(KEYS.deathRecords, seedDeaths);
  const [existingFamilies, setExistingFamilies] = usePersistedState<Family[]>(KEYS.families, seedFamilies);
  const [existingJournalEntries, setExistingJournalEntries] = usePersistedState<JournalEntry[]>(KEYS.journalEntries, seedJournalEntries);

  // Load import history — recompute after an import (importResult) OR after the
  // history is mutated locally (historyVersion bump on Clear).
  const importHistory = useMemo(() => getImportHistory(), [importResult, historyVersion]);

  // ── Step Navigation ──
  const goToStep = useCallback((target: WizardStep, dir: number) => {
    setDirection(dir);
    setStep(target);
  }, []);

  // ── Step 1: Upload Handlers ──
  const handleSelectSample = (sample: SampleLegacyFile) => {
    setSelectedSample(sample);
    setUploadedFile({ name: sample.name, type: sample.type });
    setDetectedModule(sample.targetModule);
    setDupOverrides({});
    setParRegisters(null);
    goToStep('detect', 1);
    toast.success(`Loaded: ${sample.name}`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();

    // PIMS native backup (.PAR archive) or a lone FoxPro table (.DBF) — read
    // directly. This is the whole point: staff drop in the raw daily backup
    // instead of first prying a CSV out of the locked relic.
    if (lower.endsWith('.par') || lower.endsWith('.dbf')) {
      toast.info(`Reading PIMS backup ${file.name}...`);
      try {
        const ab = await file.arrayBuffer();
        const samples = lower.endsWith('.par')
          ? await parseParArchiveToSamples(ab, file.name)
          : [parseDbfToSample(new Uint8Array(ab), file.name)].filter((s) => s.rows.length > 0);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (samples.length === 0) {
          toast.error(`No registry records found in ${file.name}.`);
          return;
        }
        if (samples.length === 1) {
          handleSelectSample(samples[0]);
          return;
        }
        setParRegisters(samples);
        toast.success(`${file.name}: ${samples.length} registers with records — pick one to import.`);
      } catch {
        toast.error(`Could not read ${file.name}. Make sure it's a PIMS .PAR or .DBF backup.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    }

    const type = detectFileType(file.name);
    const module = detectTargetModule(file.name);
    if (type === 'json') {
      toast.error(`JSON files can't be parsed yet — export the data as CSV or XLSX and upload that instead.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    toast.info(`Reading ${file.name}...`);
    try {
      const parsed = type === 'xlsx'
        ? await parseXLSX(await file.arrayBuffer())
        : parseCSV(await file.text());
      if (parsed.rows.length === 0) {
        toast.error(`No data rows found in ${file.name}. The first row must contain column headers.`);
        return;
      }
      // Shape the parsed file like a sample so the rest of the wizard
      // (detect / map / preview) works identically for real uploads.
      setSelectedSample({
        name: file.name,
        type,
        targetModule: module,
        recordCount: parsed.rows.length,
        columns: parsed.columns,
        rows: parsed.rows,
        issues: detectParsedIssues(parsed),
      });
      setUploadedFile({ name: file.name, type });
      setDetectedModule(module);
      setDupOverrides({});
      goToStep('detect', 1);
      toast.success(`File parsed: ${file.name} (${parsed.rows.length} rows)`);
    } catch {
      toast.error(`Could not read ${file.name}. Make sure it's a valid ${type.toUpperCase()} file.`);
    }
  };

  // ── Step 2: Detect -> Auto Map ──
  const handleProceedToMap = () => {
    if (!selectedSample && !uploadedFile) {
      toast.error('Please select a file first');
      return;
    }
    const columns = selectedSample?.columns.map(c => c.name) || [];
    const detected = autoMapFields(columns, detectedModule);
    setMappings(detected);
    goToStep('map', 1);
  };

  // ── Step 3: Map -> Handle mapping changes ──
  const handleMappingChange = (sourceField: string, targetField: string) => {
    setManualOverrides(prev => ({ ...prev, [sourceField]: targetField }));
    setMappings(prev => prev.map(m =>
      m.sourceField === sourceField ? { ...m, targetField } : m
    ));
  };

  const handleRemoveMapping = (sourceField: string) => {
    setMappings(prev => prev.filter(m => m.sourceField !== sourceField));
  };

  const handleAddMapping = (sourceField: string, targetField: string) => {
    setMappings(prev => [...prev, { sourceField, targetField, targetModule: detectedModule }]);
  };

  // ── Step 4: Preview -> Validate ──
  const handleProceedToPreview = () => {
    if (mappings.length === 0) {
      toast.error('Please map at least one field');
      return;
    }
    goToStep('preview', 1);
  };

  // ── Duplicate detection (against existing records AND within the file) ──
  const mappedRows = useMemo(
    () => selectedSample ? selectedSample.rows.map(r => mapImportRow(r, mappings)) : [],
    [selectedSample, mappings],
  );

  const existingRecords = useMemo(() => {
    if (detectedModule === 'registry') return [...existingBaptisms, ...existingMarriages, ...existingConfirmations, ...existingDeaths];
    if (detectedModule === 'directory') return existingFamilies;
    if (detectedModule === 'finance') return existingJournalEntries;
    return [];
  }, [detectedModule, existingBaptisms, existingMarriages, existingConfirmations, existingDeaths, existingFamilies, existingJournalEntries]);

  const duplicates = useMemo(
    () => detectDuplicates(mappedRows, existingRecords, detectedModule),
    [mappedRows, existingRecords, detectedModule],
  );

  const dupByRow = useMemo(
    () => new Map(duplicates.map(d => [d.rowIndex, d])),
    [duplicates],
  );

  const handleToggleDupOverride = useCallback((rowIndex: number) => {
    setDupOverrides(prev => ({ ...prev, [rowIndex]: !prev[rowIndex] }));
  }, []);

  const getPreviewRows = useMemo(() => {
    if (!selectedSample) return [];
    return selectedSample.rows.slice(0, 5).map((row, i) => {
      const { errors, warnings } = validateRow(row, mappings);
      const dup = dupByRow.get(i);
      return {
        sourceData: row, errors, warnings,
        dup,
        dupSkipped: !!dup && !dupOverrides[i],
        status: errors.length > 0 ? 'error' as const : warnings.length > 0 ? 'warning' as const : 'valid' as const,
      };
    });
  }, [selectedSample, mappings, dupByRow, dupOverrides]);

  const allRowsValidated = useMemo(() => {
    if (!selectedSample) return { total: 0, valid: 0, errors: 0, warnings: 0, duplicates: 0, dupSkipped: 0, willImport: 0 };
    let valid = 0, errors = 0, warnings = 0, dupSkipped = 0;
    selectedSample.rows.forEach((row, i) => {
      const { errors: e, warnings: w } = validateRow(row, mappings);
      if (e.length > 0) { errors++; return; }
      if (dupByRow.has(i) && !dupOverrides[i]) { dupSkipped++; return; }
      if (w.length > 0) warnings++;
      else valid++;
    });
    return {
      total: selectedSample.rows.length,
      valid, errors, warnings,
      duplicates: duplicates.length,
      dupSkipped,
      willImport: valid + warnings,
    };
  }, [selectedSample, mappings, dupByRow, dupOverrides, duplicates]);

  // ── Step 5: Execute Import ──
  const handleImport = () => {
    if (!selectedSample) return;
    setIsImporting(true);
    toast.info('Importing data... Please wait.');

    // Build the REAL records up front (same skip rules the Preview showed:
    // error rows and non-overridden duplicates are excluded).
    const created: ImportedRecord[] = [];
    selectedSample.rows.forEach((row, i) => {
      const { errors } = validateRow(row, mappings);
      if (errors.length > 0) return;
      if (dupByRow.has(i) && !dupOverrides[i]) return;
      const rec = buildImportedRecord(mapImportRow(row, mappings), detectedModule, 'Admin');
      if (rec) created.push(rec);
    });

    // Short progress animation, then persist + report.
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      if (progress >= 100) {
        clearInterval(interval);

        // ── Persist through the SAME stores the module pages read ──
        const baptisms = created.flatMap((c) => (c.store === 'baptismRecords' ? [c.record] : []));
        const marriages = created.flatMap((c) => (c.store === 'marriageRecords' ? [c.record] : []));
        const confirmations = created.flatMap((c) => (c.store === 'confirmationRecords' ? [c.record] : []));
        const deaths = created.flatMap((c) => (c.store === 'deathRecords' ? [c.record] : []));
        const newFamilies = created.flatMap((c) => (c.store === 'families' ? [c.record] : []));
        const newEntries = created.flatMap((c) => (c.store === 'journalEntries' ? [c.record] : []));
        if (baptisms.length > 0) setExistingBaptisms((prev) => [...baptisms, ...prev]);
        if (marriages.length > 0) setExistingMarriages((prev) => [...marriages, ...prev]);
        if (confirmations.length > 0) setExistingConfirmations((prev) => [...confirmations, ...prev]);
        if (deaths.length > 0) setExistingDeaths((prev) => [...deaths, ...prev]);
        if (newFamilies.length > 0) setExistingFamilies((prev) => [...newFamilies, ...prev]);
        if (newEntries.length > 0) setExistingJournalEntries((prev) => [...newEntries, ...prev]);

        const importedRows = created.length;
        const result: ImportResult = {
          totalRows: selectedSample.rows.length,
          importedRows,
          skippedRows: selectedSample.rows.length - importedRows,
          duplicateRows: allRowsValidated.dupSkipped,
          errors: [],
          createdRecords: created.map((c) => c.record),
          importTime: new Date().toISOString(),
          fileName: uploadedFile?.name || 'unknown',
          targetModule: detectedModule,
        };
        setImportResult(result);
        setIsImporting(false);

        // Save to history
        const historyEntry: ImportHistoryEntry = {
          id: `imp-${Date.now()}`,
          date: new Date().toLocaleString(),
          fileName: uploadedFile?.name || 'unknown',
          fileType: uploadedFile?.type || 'csv',
          targetModule: detectedModule,
          totalRows: result.totalRows,
          importedRows,
          errors: allRowsValidated.errors,
          duplicatesSkipped: allRowsValidated.dupSkipped,
          importedBy: 'Admin',
          // Duplicates skipped on purpose don't make an import "partial" —
          // only genuine error rows do.
          status: allRowsValidated.errors === 0 && importedRows === allRowsValidated.willImport
            ? 'completed' : importedRows > 0 ? 'partial' : 'failed',
          mappings,
        };
        addImportHistory(historyEntry);

        goToStep('import', 1);
        toast.success(`Import complete! ${importedRows} records imported.`);
      }
    }, 400);
  };

  // ── Get target fields for dropdown ──
  const getTargetFields = () => {
    if (detectedModule === 'registry') return CHURCHOS_REGISTRY_FIELDS;
    if (detectedModule === 'directory') return CHURCHOS_DIRECTORY_FIELDS;
    return CHURCHOS_FINANCE_FIELDS;
  };

  // ── Get field map for suggestions ──
  const getFieldMap = () => {
    if (detectedModule === 'registry') return REGISTRY_FIELD_MAP;
    if (detectedModule === 'directory') return DIRECTORY_FIELD_MAP;
    return FINANCE_FIELD_MAP;
  };

  // ── Reset ──
  const handleReset = () => {
    setStep('upload');
    setSelectedSample(null);
    setUploadedFile(null);
    setMappings([]);
    setManualOverrides({});
    setImportResult(null);
    setIsImporting(false);
    setShowHistory(false);
    setDupOverrides({});
    setParRegisters(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Upload className="w-6 h-6 text-gold" />
          <h1 className="display-sm text-charcoal dark:text-dm-text">Import Legacy Data</h1>
        </div>
        <p className="body-sm text-warm-gray mt-1">
          Bring your existing parish records from PIMS or other systems into ChurchOS.
          Don't worry — we'll guide you through every step!
        </p>
        <div className="h-0.5 w-20 bg-gold mt-3" />
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* Main Content */}
      <AnimatePresence mode="popLayout" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {step === 'upload' && (
            <UploadStep
              onSelectSample={handleSelectSample}
              onFileUpload={handleFileUpload}
              fileInputRef={fileInputRef}
              parRegisters={parRegisters}
              onShowHistory={() => setShowHistory(v => !v)}
              showHistory={showHistory}
              importHistory={importHistory}
              onClearHistory={() => { clearImportHistory(); setHistoryVersion(v => v + 1); toast.success('Import history cleared'); }}
            />
          )}
          {step === 'detect' && (
            <DetectStep
              file={uploadedFile}
              sample={selectedSample}
              detectedModule={detectedModule}
              onBack={() => goToStep('upload', -1)}
              onProceed={handleProceedToMap}
            />
          )}
          {step === 'map' && (
            <MapStep
              sample={selectedSample}
              mappings={mappings}
              detectedModule={detectedModule}
              targetFields={getTargetFields()}
              fieldMap={getFieldMap()}
              onMappingChange={handleMappingChange}
              onRemoveMapping={handleRemoveMapping}
              onAddMapping={handleAddMapping}
              onBack={() => goToStep('detect', -1)}
              onProceed={handleProceedToPreview}
            />
          )}
          {step === 'preview' && (
            <PreviewStep
              sample={selectedSample}
              mappings={mappings}
              previewRows={getPreviewRows}
              validation={allRowsValidated}
              duplicates={duplicates}
              dupOverrides={dupOverrides}
              onToggleDupOverride={handleToggleDupOverride}
              detectedModule={detectedModule}
              onBack={() => goToStep('map', -1)}
              onImport={handleImport}
              isImporting={isImporting}
            />
          )}
          {step === 'import' && importResult && (
            <ImportResultStep
              result={importResult}
              mappings={mappings}
              onReset={handleReset}
              onNewImport={handleReset}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════
// STEP 1: UPLOAD
// ═══════════════════════════════════════════

function UploadStep({
  onSelectSample,
  onFileUpload,
  fileInputRef,
  parRegisters,
  onShowHistory,
  showHistory,
  importHistory,
  onClearHistory,
}: {
  onSelectSample: (s: SampleLegacyFile) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  parRegisters: SampleLegacyFile[] | null;
  onShowHistory: () => void;
  showHistory: boolean;
  importHistory: ImportHistoryEntry[];
  onClearHistory: () => void;
}) {
  return (
    <div className="space-y-8">
      {/* File Upload Area */}
      <div className="cos-card p-8">
        <h2 className="heading-md text-charcoal mb-2 flex items-center gap-2">
          <Upload className="w-5 h-5 text-gold" />
          Upload Your File
          <HelpTooltip
            text="Select a file from your old church software (PIMS, Excel, or CSV)."
            detail="ChurchOS supports .DBF (FoxPro), .CSV, and .XLSX files. If you don't have a file ready, try one of the sample files below."
          />
        </h2>
        <p className="body-sm text-warm-gray mb-6">
          Drop in your PIMS backup itself — a <span className="font-medium text-charcoal">.PAR</span> daily
          backup (MON.PAR … SUN.PAR) or a <span className="font-medium text-charcoal">.DBF</span> table —
          and ChurchOS reads it directly. Excel/CSV exports work too. Don't have a file yet? Try a sample below.
        </p>

        {/* Drag & Drop Zone */}
        <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-parchment-dark rounded-xl cursor-pointer hover:border-gold hover:bg-gold/5 transition-all group">
          <input
            ref={fileInputRef}
            type="file"
            accept=".par,.dbf,.csv,.xlsx,.xls,.json"
            onChange={onFileUpload}
            className="hidden"
          />
          <Upload className="w-12 h-12 text-parchment-dark group-hover:text-gold transition-colors mb-3" />
          <p className="text-sm font-medium text-charcoal">Click to browse or drag & drop</p>
          <p className="text-xs text-warm-gray mt-1">PIMS .PAR &amp; .DBF, plus .CSV / .XLSX supported</p>
        </label>

        {/* Supported Formats */}
        <div className="flex flex-wrap gap-3 mt-6">
          {(['dbf', 'csv', 'xlsx', 'json'] as ImportFileType[]).map(type => (
            <span key={type} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-parchment/60 text-xs font-medium text-charcoal">
              {type === 'dbf' ? <FileCode className="w-3.5 h-3.5" /> : type === 'csv' ? <FileSpreadsheet className="w-3.5 h-3.5" /> : <Table className="w-3.5 h-3.5" />}
              {FILE_TYPE_LABELS[type]}
            </span>
          ))}
        </div>
      </div>

      {/* Registers found inside an uploaded .PAR backup */}
      {parRegisters && parRegisters.length > 0 && (
        <div className="cos-card p-8 border-2 border-gold/50 bg-gold/5">
          <h2 className="heading-md text-charcoal mb-2 flex items-center gap-2">
            <Database className="w-5 h-5 text-gold" />
            Registers Found in Your Backup
          </h2>
          <p className="body-sm text-warm-gray mb-6">
            Your PIMS backup opened cleanly. These registers have records — pick one to import now;
            you can come back and import the others afterward.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {parRegisters.map((reg) => {
              const label = reg.name.split('·')[1]?.trim() || reg.name;
              return (
                <button
                  key={reg.name}
                  onClick={() => onSelectSample(reg)}
                  className="text-left p-5 rounded-xl border-2 border-gold/30 bg-white hover:border-gold hover:shadow-card-hover transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-gold" />
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gold/15 text-gold">
                      {reg.recordCount} record{reg.recordCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <h3 className="font-semibold text-charcoal text-sm group-hover:text-gold transition-colors">
                    {label}
                  </h3>
                  <p className="text-xs text-warm-gray mt-1">Sacramental Registry</p>
                  <span className="inline-flex items-center gap-1 text-xs text-gold mt-3 font-medium">
                    Import this register <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sample Files */}
      <div className="cos-card p-8">
        <h2 className="heading-md text-charcoal mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-gold" />
          Try a Sample File
          <HelpTooltip
            text="Practice importing with these realistic sample files."
            detail="These files simulate real PIMS exports so you can see how the import process works without using your actual parish data."
          />
        </h2>
        <p className="body-sm text-warm-gray mb-6">
          Not ready to import your real data? Try these sample PIMS exports to see how it works.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[SAMPLE_BAPTISM_DBF, SAMPLE_MARRIAGE_DBF, SAMPLE_FINANCE_CSV].map(sample => {
            const Icon = MODULE_ICONS[sample.targetModule];
            return (
              <button
                key={sample.name}
                onClick={() => onSelectSample(sample)}
                className="text-left p-5 rounded-xl border-2 border-parchment hover:border-gold hover:shadow-card-hover transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-gold" />
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-parchment/80 text-warm-gray">
                    {sample.type.toUpperCase()}
                  </span>
                </div>
                <h3 className="font-semibold text-charcoal text-sm group-hover:text-gold transition-colors">
                  {sample.name}
                </h3>
                <p className="text-xs text-warm-gray mt-1">{MODULE_LABELS[sample.targetModule]}</p>
                <p className="text-xs text-warm-gray/70 mt-0.5">{sample.recordCount} records</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {sample.issues.slice(0, 2).map((issue, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning-dark">
                      {issue.split('—')[0].trim()}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Import History */}
      {importHistory.length > 0 && (
        <div className="cos-card p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="heading-md text-charcoal flex items-center gap-2">
              <Database className="w-5 h-5 text-gold" />
              Import History
            </h2>
            <div className="flex gap-2">
              <button onClick={onShowHistory} className="text-xs text-gold hover:underline">
                {showHistory ? 'Hide' : 'Show'} Details
              </button>
              <button onClick={onClearHistory} className="text-xs text-error hover:underline flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {importHistory.slice(0, showHistory ? undefined : 3).map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg bg-parchment/30 text-sm">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${entry.status === 'completed' ? 'bg-success' : entry.status === 'partial' ? 'bg-warning' : 'bg-error'}`} />
                  <span className="font-medium text-charcoal">{entry.fileName}</span>
                  <span className="text-warm-gray text-xs">{entry.date}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-warm-gray">
                  <span>{MODULE_LABELS[entry.targetModule]}</span>
                  <span>{entry.importedRows}/{entry.totalRows} imported</span>
                  {(entry.duplicatesSkipped ?? 0) > 0 && <span className="text-gold">{entry.duplicatesSkipped} duplicates skipped</span>}
                  {entry.errors > 0 && <span className="text-error">{entry.errors} errors</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// STEP 2: DETECT
// ═══════════════════════════════════════════

function DetectStep({
  file,
  sample,
  detectedModule,
  onBack,
  onProceed,
}: {
  file: { name: string; type: ImportFileType } | null;
  sample: SampleLegacyFile | null;
  detectedModule: ImportTarget;
  onBack: () => void;
  onProceed: () => void;
}) {
  const Icon = MODULE_ICONS[detectedModule];

  return (
    <div className="space-y-6">
      <div className="cos-card p-8">
        <h2 className="heading-md text-charcoal mb-6 flex items-center gap-2">
          <Eye className="w-5 h-5 text-gold" />
          File Analysis
          <HelpTooltip
            text="ChurchOS has analyzed your file and detected its structure."
            detail="Review the detected columns, data types, and any issues found. ChurchOS will suggest the best way to import this data."
          />
        </h2>

        {/* File Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-parchment/40">
            <p className="text-xs text-warm-gray mb-1">File Name</p>
            <p className="font-semibold text-charcoal text-sm">{file?.name}</p>
          </div>
          <div className="p-4 rounded-xl bg-parchment/40">
            <p className="text-xs text-warm-gray mb-1">File Type</p>
            <p className="font-semibold text-charcoal text-sm">{file?.type ? FILE_TYPE_LABELS[file.type] : 'Unknown'}</p>
          </div>
          <div className="p-4 rounded-xl bg-parchment/40">
            <p className="text-xs text-warm-gray mb-1">Target Module</p>
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-gold" />
              <p className="font-semibold text-charcoal text-sm">{MODULE_LABELS[detectedModule]}</p>
            </div>
          </div>
        </div>

        {/* Detected Columns */}
        <h3 className="font-semibold text-charcoal mb-3 flex items-center gap-2">
          <Table className="w-4 h-4 text-gold" />
          Detected Columns ({sample?.columns.length || 0})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-parchment">
                <th className="text-left py-2 px-3 font-semibold text-charcoal">Column Name</th>
                <th className="text-left py-2 px-3 font-semibold text-charcoal">Sample Value</th>
                <th className="text-left py-2 px-3 font-semibold text-charcoal">Auto-Mapped To</th>
                <th className="text-left py-2 px-3 font-semibold text-charcoal">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {sample?.columns.map((col, i) => {
                const map = REGISTRY_FIELD_MAP[col.name] || DIRECTORY_FIELD_MAP[col.name] || FINANCE_FIELD_MAP[col.name];
                return (
                  <tr key={i} className="border-b border-parchment/50 hover:bg-parchment/20">
                    <td className="py-2 px-3 font-mono text-xs text-charcoal">{col.name}</td>
                    <td className="py-2 px-3 text-warm-gray">{col.sample}</td>
                    <td className="py-2 px-3">
                      {map ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          {map.label}
                        </span>
                      ) : (
                        <span className="text-warm-gray/50 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {map && (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-parchment rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${map.confidence > 0.9 ? 'bg-success' : map.confidence > 0.7 ? 'bg-warning' : 'bg-error'}`}
                              style={{ width: `${map.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-warm-gray">{Math.round(map.confidence * 100)}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Issues Found */}
        {sample && sample.issues.length > 0 && (
          <div className="mt-6 p-4 rounded-xl bg-warning/5 border border-warning/20">
            <h3 className="font-semibold text-charcoal mb-2 flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-warning" />
              Issues Detected ({sample.issues.length})
            </h3>
            <ul className="space-y-1.5">
              {sample.issues.map((issue, i) => (
                <li key={i} className="text-xs text-warm-gray flex items-start gap-2">
                  <Info className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />
                  {issue}
                </li>
              ))}
            </ul>
            <p className="text-xs text-warm-gray/70 mt-2 italic">
              Don't worry — ChurchOS will fix most of these automatically during import.
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={onProceed} className="flex items-center gap-2 bg-gold hover:bg-gold-light text-white">
          Review Field Mappings <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// STEP 3: MAP
// ═══════════════════════════════════════════

function MapStep({
  sample,
  mappings,
  detectedModule,
  targetFields,
  fieldMap,
  onMappingChange,
  onRemoveMapping,
  onAddMapping,
  onBack,
  onProceed,
}: {
  sample: SampleLegacyFile | null;
  mappings: ImportMapping[];
  detectedModule: ImportTarget;
  targetFields: { key: string; label: string; required: boolean; module: ImportTarget }[];
  fieldMap: Record<string, { target: string; label: string; confidence: number }>;
  onMappingChange: (source: string, target: string) => void;
  onRemoveMapping: (source: string) => void;
  onAddMapping: (source: string, target: string) => void;
  onBack: () => void;
  onProceed: () => void;
}) {
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  const unmappedColumns = sample?.columns.filter(
    c => !mappings.some(m => m.sourceField === c.name)
  ) || [];

  const mappedCount = mappings.length;
  // Denominator = number of source columns. Uploaded files carry no column
  // metadata (sample is null), so fall back to the mapped count instead of
  // rendering "0/undefined".
  const totalColumns = sample?.columns.length ?? mappedCount;
  const mappedPct = totalColumns > 0 ? (mappedCount / totalColumns) * 100 : 0;
  const requiredFields = targetFields.filter(f => f.required);
  const mappedRequired = requiredFields.filter(r => mappings.some(m => m.targetField === r.key));

  return (
    <div className="space-y-6">
      <div className="cos-card p-8">
        <h2 className="heading-md text-charcoal mb-2 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-gold" />
          Field Mapping
          <HelpTooltip
            text="Match columns from your old file to ChurchOS fields."
            detail="ChurchOS has guessed the best matches. Review them and fix any that look wrong. Required fields are marked with a star."
          />
        </h2>
        <p className="body-sm text-warm-gray mb-4">
          Review how ChurchOS matched your columns. Drag the dropdown to change any mapping.
          <span className="text-error ml-1">*</span> = required field.
        </p>

        {/* Progress */}
        <div className="flex items-center gap-4 mb-6 p-3 rounded-lg bg-parchment/40">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-warm-gray">Fields mapped: {mappedCount}/{totalColumns}</span>
              <span className={`font-medium ${mappedRequired.length === requiredFields.length ? 'text-success' : 'text-warning'}`}>
                Required: {mappedRequired.length}/{requiredFields.length}
              </span>
            </div>
            <div className="w-full h-2 bg-parchment rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gold rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${mappedPct}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>

        {/* Mapping Table */}
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-warm-gray uppercase tracking-wide px-3">
            <div className="col-span-3">Your Column</div>
            <div className="col-span-4">ChurchOS Field</div>
            <div className="col-span-2">Sample Value</div>
            <div className="col-span-2">Transform</div>
            <div className="col-span-1" />
          </div>

          <AnimatePresence>
            {mappings.map((mapping, i) => {
              const sourceCol = sample?.columns.find(c => c.name === mapping.sourceField);
              const isRequired = targetFields.some(f => f.key === mapping.targetField && f.required);
              const isAuto = !expandedSource || expandedSource !== mapping.sourceField;
              return (
                <motion.div
                  key={mapping.sourceField}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="grid grid-cols-12 gap-2 items-center p-3 rounded-lg bg-parchment/20 hover:bg-parchment/40 transition-colors"
                >
                  <div className="col-span-3">
                    <span className="font-mono text-xs text-charcoal">{mapping.sourceField}</span>
                  </div>
                  <div className="col-span-4">
                    <select
                      value={mapping.targetField}
                      onChange={(e) => {
                        if (e.target.value === '') {
                          // "Skip this column" — drop the mapping entirely so it
                          // doesn't leave a blank-header zombie column in Preview.
                          onRemoveMapping(mapping.sourceField);
                          toast.info(`Skipped ${mapping.sourceField}`);
                        } else {
                          onMappingChange(mapping.sourceField, e.target.value);
                        }
                      }}
                      className="w-full text-sm rounded-lg border border-parchment bg-white px-2 py-1.5 text-charcoal focus:border-gold focus:ring-1 focus:ring-gold"
                    >
                      <option value="">— Skip this column —</option>
                      {targetFields.map(f => (
                        <option key={f.key} value={f.key}>
                          {f.label}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-warm-gray truncate block">{sourceCol?.sample}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/10 text-info">
                      {mapping.transform === 'none' ? 'Direct' : mapping.transform === 'date_fix' ? 'Date Fix' : mapping.transform === 'name_split' ? 'Name Split' : 'Encoding'}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => onRemoveMapping(mapping.sourceField)}
                      className="text-warm-gray/40 hover:text-error transition-colors"
                      title="Remove mapping"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Unmapped Columns */}
          {unmappedColumns.length > 0 && (
            <div className="mt-4 pt-4 border-t border-parchment">
              <h4 className="text-xs font-semibold text-warm-gray mb-2">Unmapped Columns</h4>
              <div className="flex flex-wrap gap-2">
                {unmappedColumns.map(col => (
                  <span
                    key={col.name}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-parchment/60 text-xs font-mono text-warm-gray"
                  >
                    {col.name}
                    <select
                      className="ml-1 text-xs bg-transparent border-none text-gold cursor-pointer focus:outline-none"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          onAddMapping(col.name, e.target.value);
                          toast.success(`Mapped ${col.name}`);
                        }
                      }}
                    >
                      <option value="">+ Map to...</option>
                      {targetFields.filter(f => !mappings.some(m => m.targetField === f.key)).map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={onProceed} className="flex items-center gap-2 bg-gold hover:bg-gold-light text-white">
          Preview Data <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// STEP 4: PREVIEW
// ═══════════════════════════════════════════

function PreviewStep({
  sample,
  mappings,
  previewRows,
  validation,
  duplicates,
  dupOverrides,
  onToggleDupOverride,
  detectedModule,
  onBack,
  onImport,
  isImporting,
}: {
  sample: SampleLegacyFile | null;
  mappings: ImportMapping[];
  previewRows: { sourceData: Record<string, string>; errors: ImportValidationError[]; warnings: ImportValidationWarning[]; dup?: DuplicateInfo; dupSkipped: boolean; status: 'valid' | 'error' | 'warning' }[];
  validation: { total: number; valid: number; errors: number; warnings: number; duplicates: number; dupSkipped: number; willImport: number };
  duplicates: DuplicateInfo[];
  dupOverrides: Record<number, boolean>;
  onToggleDupOverride: (rowIndex: number) => void;
  detectedModule: ImportTarget;
  onBack: () => void;
  onImport: () => void;
  isImporting: boolean;
}) {
  const [showAllErrors, setShowAllErrors] = useState(false);

  // ── Required-mapping guard ──
  // validateImportRow only errors on required fields that are MAPPED but empty;
  // it never catches a required field that was never mapped (e.g. Finance
  // debit/credit/description/accountName left as "Skip this column"). Compute
  // those here so we can block Import and show a visible reason. The engine's
  // check is record-type aware (a marriage file needs groom/bride/date, not
  // the baptism-only child fields) and treats a mapped full-name column as
  // satisfying the corresponding LastName field.
  const missingRequired = missingRequiredFields(mappings, detectedModule);
  const hasMissingRequired = missingRequired.length > 0;
  const blockImport = hasMissingRequired || validation.willImport === 0;

  return (
    <div className="space-y-6">
      <div className="cos-card p-8">
        <h2 className="heading-md text-charcoal mb-2 flex items-center gap-2">
          <Eye className="w-5 h-5 text-gold" />
          Preview Import
          <HelpTooltip
            text="Review how your data will look in ChurchOS before importing."
            detail="Check for errors and warnings. You can go back to fix mappings if something looks wrong."
          />
        </h2>
        <p className="body-sm text-warm-gray mb-6">
          Here's how your data will look after import. Review carefully — any rows with errors will be skipped.
        </p>

        {/* Validation Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-success/5 border border-success/20 text-center">
            <p className="text-2xl font-bold text-success">{validation.valid}</p>
            <p className="text-xs text-success/80 mt-1">Ready to Import</p>
          </div>
          <div className="p-4 rounded-xl bg-warning/5 border border-warning/20 text-center">
            <p className="text-2xl font-bold text-warning">{validation.warnings}</p>
            <p className="text-xs text-warning-dark mt-1">Warnings (Will Import)</p>
          </div>
          <div className="p-4 rounded-xl bg-gold/5 border border-gold/20 text-center">
            <p className="text-2xl font-bold text-gold">{validation.dupSkipped}</p>
            <p className="text-xs text-gold/80 mt-1">Duplicates (Will Skip)</p>
          </div>
          <div className="p-4 rounded-xl bg-error/5 border border-error/20 text-center">
            <p className="text-2xl font-bold text-error">{validation.errors}</p>
            <p className="text-xs text-error/80 mt-1">Errors (Will Skip)</p>
          </div>
          <div className="p-4 rounded-xl bg-parchment/60 text-center">
            <p className="text-2xl font-bold text-charcoal">{validation.total}</p>
            <p className="text-xs text-warm-gray mt-1">Total Rows</p>
          </div>
        </div>

        {/* Preview Table */}
        <h3 className="font-semibold text-charcoal mb-3 text-sm">Preview (First 5 Rows)</h3>
        <div className="overflow-x-auto rounded-xl border border-parchment">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-parchment/50">
                <th className="text-left py-2 px-3 font-semibold text-charcoal w-8">#</th>
                {mappings.map(m => (
                  <th key={m.targetField} className="text-left py-2 px-3 font-semibold text-charcoal">
                    {m.targetField}
                    {previewRows.some(r => r.errors.some(e => e.field === m.sourceField)) && (
                      <XCircle className="w-3 h-3 text-error inline ml-1" />
                    )}
                  </th>
                ))}
                <th className="text-left py-2 px-3 font-semibold text-charcoal w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr
                  key={i}
                  className={`border-t border-parchment/50 ${
                    row.status === 'error' ? 'bg-error/5' : row.status === 'warning' ? 'bg-warning/5' : ''
                  }`}
                >
                  <td className="py-2 px-3 text-warm-gray">{i + 1}</td>
                  {mappings.map(m => (
                    <td key={m.targetField} className="py-2 px-3 text-charcoal">
                      <span className="truncate block max-w-[150px]">
                        {row.sourceData[m.sourceField] || '—'}
                      </span>
                    </td>
                  ))}
                  <td className="py-2 px-3">
                    {row.status === 'error' ? (
                      <span className="inline-flex items-center gap-1 text-error">
                        <XCircle className="w-3 h-3" /> {row.errors.length}
                      </span>
                    ) : row.dupSkipped ? (
                      <span className="inline-flex items-center gap-1 text-gold" title={row.dup?.reason}>
                        <Ban className="w-3 h-3" /> Duplicate
                      </span>
                    ) : row.status === 'warning' ? (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <AlertCircle className="w-3 h-3" /> {row.warnings.length}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckCircle2 className="w-3 h-3" /> OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Duplicates */}
        {duplicates.length > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-gold/5 border border-gold/20">
            <h3 className="font-semibold text-charcoal mb-1 flex items-center gap-2 text-sm">
              <Ban className="w-4 h-4 text-gold" />
              Duplicates Detected ({duplicates.length})
            </h3>
            <p className="text-xs text-warm-gray mb-3">
              {validation.dupSkipped} duplicate{validation.dupSkipped === 1 ? '' : 's'} will be skipped.
              Use "Import anyway" if a flagged row is actually a different record.
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {duplicates.map(d => (
                <div key={d.rowIndex} className="flex items-center justify-between gap-3 p-2 rounded bg-white/60 text-xs">
                  <span className="text-charcoal">
                    <span className="font-medium">Row {d.rowIndex + 1}:</span>
                    <span className="text-warm-gray ml-1">{d.reason}</span>
                  </span>
                  <button
                    onClick={() => onToggleDupOverride(d.rowIndex)}
                    className={`flex-shrink-0 px-2 py-1 rounded-md font-medium transition-colors ${
                      dupOverrides[d.rowIndex]
                        ? 'bg-success/10 text-success hover:bg-success/20'
                        : 'bg-parchment/80 text-charcoal hover:bg-gold/20'
                    }`}
                  >
                    {dupOverrides[d.rowIndex] ? 'Will import — undo' : 'Import anyway'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors Detail */}
        {(validation.errors > 0 || validation.warnings > 0) && (
          <div className="mt-4">
            <button
              onClick={() => setShowAllErrors(!showAllErrors)}
              className="text-xs text-gold hover:underline flex items-center gap-1"
            >
              {showAllErrors ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showAllErrors ? 'Hide' : 'Show'} all errors & warnings
            </button>

            <AnimatePresence>
              {showAllErrors && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {sample?.rows.map((row, i) => {
                      const { errors, warnings } = validateRow(row, mappings);
                      if (errors.length === 0 && warnings.length === 0) return null;
                      return (
                        <div key={i} className="p-2 rounded bg-parchment/30 text-xs">
                          <span className="font-medium text-charcoal">Row {i + 1}:</span>
                          {errors.map((e, j) => (
                            <span key={j} className="ml-2 text-error flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> {e.message}
                            </span>
                          ))}
                          {warnings.map((w, j) => (
                            <span key={j} className="ml-2 text-warning flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> {w.message}
                            </span>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {hasMissingRequired && (
          <div className="mt-4 p-4 rounded-xl bg-error/5 border border-error/20">
            <p className="text-sm text-error flex items-center gap-2 font-medium">
              <Ban className="w-4 h-4 flex-shrink-0" />
              {missingRequired.length} required field{missingRequired.length > 1 ? 's are' : ' is'} not mapped. Go back and map {missingRequired.length > 1 ? 'them' : 'it'} before importing.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2 ml-6">
              {missingRequired.map(f => (
                <span key={f.key} className="text-xs px-2 py-0.5 rounded-full bg-error/10 text-error font-medium">
                  {f.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {!hasMissingRequired && validation.willImport === 0 && (
          <div className="mt-4 p-4 rounded-xl bg-error/5 border border-error/20">
            <p className="text-sm text-error flex items-center gap-2">
              <Ban className="w-4 h-4" />
              No rows left to import — every row has errors or is a skipped duplicate.
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Fix Mappings
        </Button>
        <Button
          onClick={onImport}
          disabled={isImporting || blockImport}
          className="flex items-center gap-2 bg-gold hover:bg-gold-light text-white disabled:opacity-50"
        >
          {isImporting ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              >
                <RotateCcw className="w-4 h-4" />
              </motion.div>
              Importing...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Import {validation.willImport} Records
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// STEP 5: IMPORT RESULT
// ═══════════════════════════════════════════

function ImportResultStep({
  result,
  mappings,
  onReset,
  onNewImport,
}: {
  result: ImportResult;
  mappings: ImportMapping[];
  onReset: () => void;
  onNewImport: () => void;
}) {
  const successRate = result.totalRows > 0 ? Math.round((result.importedRows / result.totalRows) * 100) : 0;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="cos-card p-8 text-center"
      >
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
          className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4"
        >
          <CheckCircle2 className="w-10 h-10 text-success" />
        </motion.div>

        <h2 className="display-xs text-charcoal mb-2">
          Import {result.skippedRows === 0 ? 'Complete!' : 'Finished'}
        </h2>
        <p className="body-sm text-warm-gray mb-6">
          {result.skippedRows === 0
            ? 'All records were imported successfully. Your parish data is now in ChurchOS!'
            : `${result.importedRows} records imported. ${result.skippedRows} rows were skipped${result.duplicateRows ? ` (${result.duplicateRows} duplicate${result.duplicateRows === 1 ? '' : 's'})` : ''}.`}
        </p>

        {/* Results Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-lg mx-auto mb-6">
          <div className="p-4 rounded-xl bg-parchment/40">
            <p className="text-2xl font-bold text-charcoal">{result.totalRows}</p>
            <p className="text-xs text-warm-gray">Total Rows</p>
          </div>
          <div className="p-4 rounded-xl bg-success/5 border border-success/20">
            <p className="text-2xl font-bold text-success">{result.importedRows}</p>
            <p className="text-xs text-success/80">Imported</p>
          </div>
          <div className="p-4 rounded-xl bg-error/5 border border-error/20">
            <p className="text-2xl font-bold text-error">{result.skippedRows}</p>
            <p className="text-xs text-error/80">Skipped</p>
          </div>
          <div className="p-4 rounded-xl bg-gold/5 border border-gold/20">
            <p className="text-2xl font-bold text-gold">{successRate}%</p>
            <p className="text-xs text-gold/80">Success Rate</p>
          </div>
        </div>

        {/* Field Mapping Summary */}
        <div className="text-left max-w-lg mx-auto mb-6 p-4 rounded-xl bg-parchment/30">
          <h4 className="font-semibold text-charcoal text-sm mb-2">Fields Mapped</h4>
          <div className="space-y-1">
            {mappings.map(m => (
              <div key={m.sourceField} className="flex items-center justify-between text-xs">
                <span className="font-mono text-warm-gray">{m.sourceField}</span>
                <ArrowRight className="w-3 h-3 text-parchment-dark" />
                <span className="text-charcoal">{m.targetField}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Next Steps */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={onNewImport} variant="outline" className="flex items-center gap-2">
            <Upload className="w-4 h-4" /> Import Another File
          </Button>
          <Button onClick={onReset} className="flex items-center gap-2 bg-gold hover:bg-gold-light text-white">
            <CheckCircle2 className="w-4 h-4" /> Done
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════
// STEP INDICATOR
// ═══════════════════════════════════════════

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps: { key: WizardStep; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'upload', label: 'Upload', icon: Upload },
    { key: 'detect', label: 'Analyze', icon: Eye },
    { key: 'map', label: 'Map Fields', icon: MapPin },
    { key: 'preview', label: 'Preview', icon: Eye },
    { key: 'import', label: 'Import', icon: Play },
  ];

  const currentIndex = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center justify-center">
      <div className="flex items-center gap-0">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === currentIndex;
          const isDone = i < currentIndex;

          return (
            <div key={s.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <motion.div
                  animate={{
                    backgroundColor: isDone ? '#2D6A4F' : isActive ? '#C9963B' : '#EAE5D9',
                    scale: isActive ? 1.1 : 1,
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                >
                  {isDone ? (
                    <Check className="w-5 h-5 text-white" />
                  ) : (
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-warm-gray'}`} />
                  )}
                </motion.div>
                <span className={`text-xs mt-2 font-medium ${isActive ? 'text-gold' : isDone ? 'text-success' : 'text-warm-gray'}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="w-12 h-0.5 mx-2 mb-5">
                  <motion.div
                    animate={{
                      backgroundColor: i < currentIndex ? '#2D6A4F' : '#EAE5D9',
                    }}
                    className="h-full rounded-full"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
