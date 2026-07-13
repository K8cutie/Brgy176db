import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { isAuthenticated, getCurrentUserRole } from '@/lib/session'
import { hasDioceseRole } from '@/lib/dioceseAccess'
import { hasSetupBeenCompleted } from '@/lib/store'
import { setPersistedWriteErrorHandler } from '@/hooks/usePersistedState'
import { setCorruptionHandler } from '@/lib/storageNamespaced'
import { setDesktopWriteErrorHandler } from '@/lib/desktopStore'
import { setCloudWriteErrorHandler, isCloud } from '@/lib/cloudStore'
import { toast } from 'sonner'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import LoginPage from '@/pages/LoginPage'
import WizardPage from '@/pages/WizardPage'
import PublicPortal from '@/pages/PublicPortal'
import RegistryPage from '@/pages/RegistryPage'
import DirectoryPage from '@/pages/DirectoryPage'
import CalendarPage from '@/pages/CalendarPage'
import FinancePage from '@/pages/FinancePage'
import MinistriesPage from '@/pages/MinistriesPage'
import SsdmPage from '@/pages/SsdmPage'
import ReportsPage from '@/pages/ReportsPage'
import SettingsPage from '@/pages/SettingsPage'
import RequestsPage from '@/pages/RequestsPage'
import ImportPage from '@/pages/ImportPage'
import FirstRunDetector from '@/components/FirstRunDetector';
import CelebrationToast from '@/components/CelebrationToast';
import AiAssistant from '@/components/AiAssistant';
import { checkFirstAction, type Achievement } from '@/lib/achievements';

// /diocese is SaaS-only (cross-parish roll-up) and restricted to diocese-level
// roles. Lazy so the cockpit chunk (and its Supabase queries) never loads on
// desktop/offline installs. The gate renders friendly notices instead of a
// crash/blank page, and direct-URL access hits the exact same checks.
const DioceseCockpit = lazy(() => import('@/pages/DioceseCockpit'));

// Mass Intention Register (Canon 958) — lazy like the cockpit so the register
// chunk only loads when the page is opened.
const IntentionsPage = lazy(() => import('@/pages/IntentionsPage'));

function GateNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-lg mx-auto mt-16 rounded-xl border border-parchment bg-white p-8 text-center">
      <h2 className="font-playfair text-xl text-charcoal mb-2">{title}</h2>
      <p className="text-sm text-warm-gray">{body}</p>
    </div>
  );
}

function DioceseGate() {
  if (!isCloud()) {
    return (
      <GateNotice
        title="Diocese oversight is part of ChurchOS Cloud"
        body="This install runs standalone for a single parish, so there is no cross-parish data here. The diocese roll-up is available on ChurchOS Cloud, where parishes report to their diocese."
      />
    );
  }
  if (!hasDioceseRole()) {
    return (
      <GateNotice
        title="Not authorized"
        body="The diocese view is limited to diocese administrators and the bishop. If you believe you need access, contact your diocese administrator."
      />
    );
  }
  return (
    <Suspense fallback={<div className="p-6 text-warm-gray text-sm">Loading diocese…</div>}>
      <DioceseCockpit />
    </Suspense>
  );
}

function AppRoutes() {
  const location = useLocation();
  // The public parishioner portal is a standalone, no-auth route (anon access).
  const isPortal = location.pathname.startsWith('/portal');
  const isStandalone = location.pathname === '/login' || location.pathname === '/setup' || isPortal;

  const [celebration, setCelebration] = useState<Achievement | null>(null);

  // ── Listen for achievement events ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type) {
        const ach = checkFirstAction(detail.type);
        if (ach) setCelebration(ach);
      }
    };
    window.addEventListener('churchos-achievement', handler);
    return () => window.removeEventListener('churchos-achievement', handler);
  }, []);

  // Warn the user if a save fails (e.g. localStorage quota exceeded)
  // instead of silently losing their data.
  useEffect(() => {
    const warn = () => {
      toast.error('Could not save — the database may be full, locked, or on a read-only drive. Check storage and try again.', {
        duration: 8000,
      });
    };
    setPersistedWriteErrorHandler(warn);
    setDesktopWriteErrorHandler(warn);
    setCloudWriteErrorHandler(warn);
    setCorruptionHandler((key) => {
      toast.error(`Some saved data ("${key}") was unreadable and has been set aside (kept as a "${key}__corrupt" copy). Your other records are safe — restore from a backup in Settings if needed.`, {
        duration: 12000,
      });
    });
    return () => {
      setPersistedWriteErrorHandler(null);
      setDesktopWriteErrorHandler(null);
      setCloudWriteErrorHandler(null);
      setCorruptionHandler(null);
    };
  }, []);

  if (isStandalone) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<WizardPage />} />
        <Route path="/portal/:slug" element={<PublicPortal />} />
      </Routes>
    );
  }

  // ── Auth gate ──
  // Send first-time installs through the setup wizard, and require a
  // logged-in user before any parish page is reachable. Without this,
  // navigating directly to a hash route bypassed the login entirely.
  // The local setup wizard is a desktop/offline concept — in cloud (SaaS) mode
  // the parish is provisioned server-side, so skip straight to login.
  if (!isCloud() && !hasSetupBeenCompleted()) {
    return <Navigate to="/setup" replace />;
  }
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  // Diocese-level users (bishop / diocese_admin) have no parish — their home is the
  // diocese cockpit, not the (empty) parish dashboard. Send them there from the root.
  if (isCloud() && location.pathname === '/' && ['bishop', 'diocese_admin'].includes(getCurrentUserRole())) {
    return <Navigate to="/diocese" replace />;
  }

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/registry" element={<RegistryPage />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/requests" element={<RequestsPage />} />
          <Route
            path="/intentions"
            element={
              <Suspense fallback={<div className="p-6 text-warm-gray text-sm">Loading intentions…</div>}>
                <IntentionsPage />
              </Suspense>
            }
          />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/ministries" element={<MinistriesPage />} />
          <Route path="/ssdm" element={<SsdmPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/diocese" element={<DioceseGate />} />
        </Routes>
      </Layout>

      {/* Achievement Celebration */}
      <CelebrationToast
        achievement={celebration}
        onClose={() => setCelebration(null)}
      />

      {/* First-run detector (for practice mode) */}
      <FirstRunDetector />

      {/* AI assistant (desktop only; renders nothing without the bridge) */}
      <AiAssistant />
    </>
  );
}

export default function App() {
  return <AppRoutes />;
}
