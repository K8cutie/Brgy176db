import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2, Unlink, Upload, Download, CheckCircle, AlertCircle,
  Clock, ChevronRight, Shield, FileJson, QrCode, History,
  X, Info,
} from 'lucide-react';
import {
  getDioceseConnection, getParishIdentity,
  updateDioceseConnection, addSyncRecord,
  type DioceseConnection, type SyncRecord,
} from '@/lib/parishIdentity';
import { generateDiocesePacket, createSyncRecord, validatePacket } from '@/lib/diocesePacket';
import type { SyncScope } from '@/lib/diocesePacket';

export default function DioceseConnection() {
  const [conn, setConn] = useState<DioceseConnection>(getDioceseConnection());
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [selectedScope, setSelectedScope] = useState<SyncScope[]>(['financial_summary', 'sacramental_counts', 'parish_status']);

  const parish = getParishIdentity();

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Simulate QR code scan connection ──
  const handleConnect = () => {
    if (!qrInput.trim()) {
      showToast('Please enter a diocese connection code', 'error');
      return;
    }
    setConnecting(true);
    // Simulate network delay
    setTimeout(() => {
      const dioceseName = qrInput.includes('manila') ? 'Diocese of Manila'
        : qrInput.includes('cebu') ? 'Diocese of Cebu'
        : qrInput.includes('davao') ? 'Diocese of Davao'
        : 'Diocese of ' + qrInput.slice(0, 20);

      const updated: DioceseConnection = {
        ...conn,
        status: 'connected',
        dioceseId: `diocese_${qrInput.slice(0, 30)}`,
        dioceseName,
        connectedAt: new Date().toISOString(),
        lastSyncAt: undefined,
        syncHistory: [],
      };
      updateDioceseConnection(updated);
      setConn(updated);
      setShowConnectModal(false);
      setConnecting(false);
      setQrInput('');
      showToast(`Connected to ${dioceseName}`, 'success');
    }, 1500);
  };

  // ── Disconnect ──
  const handleDisconnect = () => {
    const updated: DioceseConnection = {
      ...conn,
      status: 'disconnected',
      dioceseId: '',
      dioceseName: '',
      connectedAt: undefined,
      lastSyncAt: undefined,
    };
    updateDioceseConnection(updated);
    setConn(updated);
    showToast('Disconnected from diocese', 'info');
  };

  // ── Simulate sync ──
  const handleSync = () => {
    if (selectedScope.length === 0) {
      showToast('Please select at least one data scope', 'error');
      return;
    }
    setSyncing(true);

    setTimeout(() => {
      const packet = generateDiocesePacket(selectedScope);
      const validation = validatePacket(packet);

      if (!validation.valid) {
        const record = createSyncRecord(packet, 'failed', validation.errors.join(', '));
        addSyncRecord(record);
        setConn(getDioceseConnection());
        setSyncing(false);
        setShowSyncModal(false);
        showToast('Sync failed: ' + validation.errors.join(', '), 'error');
        return;
      }

      const record = createSyncRecord(packet, 'success');
      addSyncRecord(record);
      setConn(getDioceseConnection());
      setSyncing(false);
      setShowSyncModal(false);
      showToast(`Sync successful! Uploaded ${packet.scope.length} data categories.`, 'success');
    }, 2000);
  };

  // ── Toggle scope ──
  const toggleScope = (scope: SyncScope) => {
    setSelectedScope(prev =>
      prev.includes(scope)
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    );
  };

  const scopeLabels: Record<SyncScope, { label: string; desc: string }> = {
    financial_summary: { label: 'Financial Summary', desc: 'Revenue, expenses, budget by category (totals only)' },
    sacramental_counts: { label: 'Sacramental Counts', desc: 'Number of baptisms, weddings, confirmations, burials (no names)' },
    collection_summary: { label: 'Collection Summary', desc: 'Sunday collection totals by Mass time' },
    parish_status: { label: 'Parish Status', desc: 'Current priest, active modules, fiscal year' },
  };

  return (
    <div className="space-y-6">
      {/* ── Status Card ── */}
      <div className={`cos-card p-5 border-l-4 ${
        conn.status === 'connected' ? 'border-l-forest-green' : 'border-l-warm-gray'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              conn.status === 'connected' ? 'bg-forest-green/10' : 'bg-cream-dark'
            }`}>
              {conn.status === 'connected'
                ? <Link2 className="w-6 h-6 text-forest-green" />
                : <Unlink className="w-6 h-6 text-warm-gray" />
              }
            </div>
            <div>
              <h3 className="heading-md text-charcoal dark:text-dm-text">
                {conn.status === 'connected' ? `Connected to ${conn.dioceseName}` : 'Not Connected to Diocese'}
              </h3>
              <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-0.5">
                {conn.status === 'connected'
                  ? `Last synced: ${conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleString('en-PH') : 'Never'}`
                  : 'Connect to your diocese hub to share parish summaries with the bishop'
                }
              </p>
              {conn.status === 'connected' && conn.connectedAt && (
                <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1">
                  Connected since {new Date(conn.connectedAt).toLocaleDateString('en-PH')}
                </p>
              )}
            </div>
          </div>

          {conn.status === 'connected' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSyncModal(true)}
                className="cos-btn cos-btn-primary text-sm flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                Sync Now
              </button>
              <button
                onClick={handleDisconnect}
                className="cos-btn cos-btn-secondary text-sm flex items-center gap-1.5"
              >
                <Unlink className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConnectModal(true)}
              className="cos-btn cos-btn-primary text-sm flex items-center gap-1.5"
            >
              <QrCode className="w-4 h-4" />
              Connect to Diocese
            </button>
          )}
        </div>
      </div>

      {/* ── Quick Stats ── */}
      {conn.status === 'connected' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard icon={Upload} label="Total Syncs" value={String(conn.syncHistory.length)} accent="#3B6BC9" />
          <StatCard icon={CheckCircle} label="Successful" value={String(conn.syncHistory.filter(s => s.status === 'success').length)} accent="#2D6A4F" />
          <StatCard icon={Clock} label="Last Sync" value={conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : 'Never'} accent="#C9963B" />
        </div>
      )}

      {/* ── Sync History ── */}
      {conn.status === 'connected' && conn.syncHistory.length > 0 && (
        <div className="cos-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-deep-navy dark:text-gold" />
            <h3 className="heading-md text-charcoal dark:text-dm-text">Sync History</h3>
          </div>
          <div className="space-y-2">
            {conn.syncHistory.slice(0, 10).map((record: SyncRecord) => (
              <div key={record.id} className="flex items-center justify-between p-3 rounded-lg bg-cream-dark/30 dark:bg-dm-surface-raised/30">
                <div className="flex items-center gap-3">
                  {record.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-forest-green" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-error" />
                  )}
                  <div>
                    <p className="body-sm text-charcoal dark:text-dm-text">
                      {record.scope.join(', ')}
                    </p>
                    <p className="body-xs text-warm-gray dark:text-dm-text-muted">
                      {new Date(record.timestamp).toLocaleString('en-PH')}
                    </p>
                  </div>
                </div>
                <span className={`cos-badge ${record.status === 'success' ? 'cos-badge-success' : 'cos-badge-danger'}`}>
                  {record.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Privacy Notice ── */}
      <div className="cos-card p-4 bg-gold-glow/30 border border-gold/20">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
          <div>
            <p className="body-sm text-charcoal dark:text-dm-text font-medium">What the Diocese Sees</p>
            <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1">
              When you sync, the diocese only receives aggregate totals — not individual records.
              They see "₱85,000 in personnel costs" not "Fr. Reyes salary." They see
              "12 baptisms this quarter" not who was baptized. Your parish data stays sovereign.
            </p>
          </div>
        </div>
      </div>

      {/* ═══════ CONNECT MODAL ═══════ */}
      <AnimatePresence>
        {showConnectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
            onClick={() => setShowConnectModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[460px]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
                <h3 className="heading-lg text-charcoal dark:text-dm-text">Connect to Diocese</h3>
                <button onClick={() => setShowConnectModal(false)} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* QR / Code input */}
                <div>
                  <label className="label block text-warm-gray mb-1.5">Diocese Connection Code</label>
                  <p className="body-xs text-warm-gray dark:text-dm-text-muted mb-2">
                    Enter the code provided by your diocese office, or scan the QR code with your webcam.
                  </p>
                  <input
                    type="text"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    placeholder="e.g., diocese-manila-2026-q2"
                    className="h-10 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  />
                </div>

                {/* Info box */}
                <div className="p-3 bg-cream-dark/40 dark:bg-dm-surface-raised/40 rounded-lg flex items-start gap-2">
                  <Info className="w-4 h-4 text-warm-gray flex-shrink-0 mt-0.5" />
                  <p className="body-xs text-warm-gray dark:text-dm-text-muted">
                    Connecting does not upload any data yet. You will review what to share before each sync.
                    You can disconnect at any time.
                  </p>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="w-full cos-btn cos-btn-primary flex items-center justify-center gap-2"
                >
                  {connecting ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link2 className="w-4 h-4" />
                      Connect
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ SYNC MODAL ═══════ */}
      <AnimatePresence>
        {showSyncModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
            onClick={() => setShowSyncModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[520px]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
                <div>
                  <h3 className="heading-lg text-charcoal dark:text-dm-text">Sync to Diocese</h3>
                  <p className="body-xs text-warm-gray dark:text-dm-text-muted">
                    {parish.shortName} → {conn.dioceseName}
                  </p>
                </div>
                <button onClick={() => setShowSyncModal(false)} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <p className="body-sm text-charcoal dark:text-dm-text">
                  Select what data to share with {conn.dioceseName} for the quarterly meeting:
                </p>

                {/* Scope selection */}
                <div className="space-y-2">
                  {(Object.keys(scopeLabels) as SyncScope[]).map(scope => (
                    <label
                      key={scope}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedScope.includes(scope)
                          ? 'border-gold bg-gold-glow/30'
                          : 'border-parchment dark:border-dm-border hover:bg-cream-dark/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedScope.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        className="mt-0.5 w-4 h-4 rounded border-parchment text-gold focus:ring-gold"
                      />
                      <div>
                        <p className="body-sm text-charcoal dark:text-dm-text font-medium">{scopeLabels[scope].label}</p>
                        <p className="body-xs text-warm-gray dark:text-dm-text-muted">{scopeLabels[scope].desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Preview */}
                <div className="p-3 bg-cream-dark/30 dark:bg-dm-surface-raised/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileJson className="w-4 h-4 text-warm-gray" />
                    <span className="body-xs text-warm-gray dark:text-dm-text-muted">Packet preview</span>
                  </div>
                  <p className="body-xs text-charcoal dark:text-dm-text font-mono">
                    {parish.parishId} → {conn.dioceseId}<br />
                    Scope: {selectedScope.join(', ')}<br />
                    Period: Q2 2026
                  </p>
                </div>

                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="w-full cos-btn cos-btn-primary flex items-center justify-center gap-2"
                >
                  {syncing ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      Uploading data...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Approve and Upload
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-6 right-6 z-toast px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-forest-green text-white' :
              toast.type === 'error' ? 'bg-error text-white' :
              'bg-deep-navy text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> :
             toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
             <Info className="w-4 h-4" />}
            <span className="body-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent: string }) {
  return (
    <div className="cos-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent + '14' }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <span className="body-xs text-warm-gray dark:text-dm-text-muted">{label}</span>
      </div>
      <p className="heading-md text-charcoal dark:text-dm-text">{value}</p>
    </div>
  );
}
