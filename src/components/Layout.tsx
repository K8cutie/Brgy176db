import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Footer from './Footer';
import PracticeModeBanner from './PracticeModeBanner';
import { useDarkMode } from '@/hooks/useDarkMode';
import { Toaster } from 'sonner';

function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    '/': 'Dashboard',
    '/login': 'Login',
    '/setup': 'Setup',
    '/registry': 'Sacramental Registry',
    '/directory': 'Parishioner Directory',
    '/calendar': 'Calendar & Scheduling',
    '/finance': 'Financial Management',
    '/ministries': 'Ministries',
    '/ssdm': 'SSDM & Assistance',
    '/reports': 'Reports',
    '/settings': 'Settings',
  };
  return titles[pathname] || 'ChurchOS';
}

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { isDark, toggle } = useDarkMode();
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);

  // Prevent body scroll when modal is open (simplified check)
  useEffect(() => {
    document.body.style.overflow = 'auto';
  }, [location.pathname]);

  return (
    <div className="min-h-[100dvh] flex bg-cream dark:bg-dm-bg transition-colors duration-300">
      {/* Sidebar */}
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />

      {/* Main Content Area */}
      <div
        className="flex-1 flex flex-col min-h-screen transition-all duration-300"
        style={{ marginLeft: collapsed ? 68 : 260 }}
      >
        {/* Practice Mode Banner */}
        <PracticeModeBanner />

        {/* Top Bar */}
        <TopBar pageTitle={pageTitle} isDark={isDark} onToggleDark={toggle} />

        {/* Page Content */}
        <main className="flex-1 px-6 py-6">
          <div className="max-w-content mx-auto">
            {children}
          </div>
        </main>

        {/* Footer */}
        <Footer />
      </div>

      {/* Global toast outlet (also used for storage-quota warnings) */}
      <Toaster position="top-right" richColors />
    </div>
  );
}
