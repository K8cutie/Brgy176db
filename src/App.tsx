import { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import LoginPage from '@/pages/LoginPage'
import WizardPage from '@/pages/WizardPage'
import RegistryPage from '@/pages/RegistryPage'
import DirectoryPage from '@/pages/DirectoryPage'
import CalendarPage from '@/pages/CalendarPage'
import FinancePage from '@/pages/FinancePage'
import MinistriesPage from '@/pages/MinistriesPage'
import SsdmPage from '@/pages/SsdmPage'
import ReportsPage from '@/pages/ReportsPage'
import SettingsPage from '@/pages/SettingsPage'
import ImportPage from '@/pages/ImportPage'
import TourGuide from '@/components/TourGuide';
import FirstRunDetector from '@/components/FirstRunDetector';
import CelebrationToast from '@/components/CelebrationToast';
import {
  shouldRunFirstLogin,
  firstLoginTour,
  getTourStatus,
  areAllToursDisabled,
} from '@/lib/tours';
import { checkFirstAction, type Achievement } from '@/lib/achievements';
import type { Step } from 'react-joyride';

interface ActiveTour {
  id: string;
  steps: Step[];
  run: boolean;
}

function AppRoutes() {
  const location = useLocation();
  const isStandalone = location.pathname === '/login' || location.pathname === '/setup';

  // ── Tour State ──
  const [activeTour, setActiveTour] = useState<ActiveTour | null>(null);
  const [celebration, setCelebration] = useState<Achievement | null>(null);

  // ── Check for first-login tour on mount ──
  useEffect(() => {
    if (shouldRunFirstLogin()) {
      const timer = setTimeout(() => {
        setActiveTour({
          id: firstLoginTour.id,
          steps: firstLoginTour.steps,
          run: true,
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // ── Listen for module navigation tours ──
  useEffect(() => {
    if (areAllToursDisabled()) return;

    const tourMap: Record<string, { id: string; steps: Step[] }> = {
      '/registry': { id: 'registry', steps: [] },
      '/directory': { id: 'directory', steps: [] },
      '/calendar': { id: 'calendar', steps: [] },
      '/finance': { id: 'finance', steps: [] },
      '/ministries': { id: 'ministries', steps: [] },
      '/ssdm': { id: 'ssdm', steps: [] },
      '/reports': { id: 'reports', steps: [] },
      '/settings': { id: 'settings', steps: [] },
    };

    const tourInfo = tourMap[location.pathname];
    if (tourInfo) {
      const status = getTourStatus(tourInfo.id);
      if (!status.completed && !status.skipped) {
        // Import tours dynamically or load from a registry
        import('@/lib/tours').then((mod) => {
          const tours = [mod.firstLoginTour, mod.registryTour, mod.directoryTour,
            mod.calendarTour, mod.financeTour, mod.ministriesTour,
            mod.ssdmTour, mod.reportsTour, mod.settingsTour];
          const found = tours.find(t => t.id === tourInfo.id);
          if (found) {
            const timer = setTimeout(() => {
              setActiveTour({ id: found.id, steps: found.steps, run: true });
            }, 3000);
            return () => clearTimeout(timer);
          }
        });
      }
    }
  }, [location.pathname]);

  // ── Listen for achievement events ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type) {
        const ach = checkFirstAction(detail.type);
        if (ach) setCelebration(ach);
      }
      if (detail?.milestone) {
        // Handle milestones
      }
    };
    window.addEventListener('churchos-achievement', handler);
    return () => window.removeEventListener('churchos-achievement', handler);
  }, []);

  // Expose global tour starter for Settings page
  useEffect(() => {
    (window as any).__startChurchOSTour = (steps: Step[], id: string) => {
      setActiveTour({ id, steps, run: true });
    };
    return () => { delete (window as any).__startChurchOSTour; };
  }, []);

  if (isStandalone) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<WizardPage />} />
      </Routes>
    );
  }

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/registry" element={<RegistryPage />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/ministries" element={<MinistriesPage />} />
          <Route path="/ssdm" element={<SsdmPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </Layout>

      {/* Active Tour */}
      {activeTour && (
        <TourGuide
          tourId={activeTour.id}
          steps={activeTour.steps}
          run={activeTour.run}
          onComplete={() => setActiveTour(null)}
          onSkip={() => setActiveTour(null)}
        />
      )}

      {/* Achievement Celebration */}
      <CelebrationToast
        achievement={celebration}
        onClose={() => setCelebration(null)}
      />

      {/* First-run detector (for practice mode) */}
      <FirstRunDetector />
    </>
  );
}

export default function App() {
  return <AppRoutes />;
}
