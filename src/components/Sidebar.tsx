import { useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Calendar,
  DollarSign,
  UserCheck,
  Heart,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Church,
  Upload,
  Inbox,
  Landmark,
  ScrollText,
} from 'lucide-react';
import { canSeeDiocese } from '@/lib/dioceseAccess';
import { getModuleRegistry, subscribeModules, getModulesSnapshot } from '@/lib/moduleRegistry';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// Short sidebar labels + rendered icons per module id. Routes and enabled
// state come from the module registry — this map only styles the entry.
const MODULE_NAV_META: Record<string, { label: string; icon: React.ElementType }> = {
  dashboard: { label: 'Dashboard', icon: LayoutDashboard },
  registry: { label: 'Registry', icon: BookOpen },
  directory: { label: 'Directory', icon: Users },
  calendar: { label: 'Calendar', icon: Calendar },
  intentions: { label: 'Intentions', icon: ScrollText },
  requests: { label: 'Requests', icon: Inbox },
  finance: { label: 'Finance', icon: DollarSign },
  ministries: { label: 'Ministries', icon: UserCheck },
  ssdm: { label: 'SSDM', icon: Heart },
  reports: { label: 'Reports', icon: FileText },
};

// Section grouping (preserved from the original hardcoded nav). Module entries
// are resolved against the registry and hidden when the module is disabled;
// static items (non-module system pages) are always shown.
const SECTION_LAYOUT: Array<{ title: string; moduleIds: string[]; staticItems?: NavItem[] }> = [
  {
    title: 'PARISH',
    moduleIds: ['dashboard', 'registry', 'directory', 'calendar', 'intentions', 'requests'],
  },
  {
    title: 'ADMIN',
    moduleIds: ['finance', 'ministries', 'ssdm'],
  },
  {
    title: 'SYSTEM',
    moduleIds: ['reports'],
    staticItems: [
      { label: 'Import Data', icon: Upload, path: '/import' },
      { label: 'Settings', icon: Settings, path: '/settings' },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();

  // Re-render immediately when a module is toggled in Settings — the nav item
  // appears/disappears without a reload.
  useSyncExternalStore(subscribeModules, getModulesSnapshot);
  const registry = getModuleRegistry();

  const navSections: NavSection[] = SECTION_LAYOUT.map((section) => ({
    title: section.title,
    items: [
      ...section.moduleIds
        .map((id) => registry.find((m) => m.id === id))
        .filter((m): m is NonNullable<typeof m> => !!m && m.enabled)
        .map((m) => ({
          label: MODULE_NAV_META[m.id]?.label ?? m.name,
          icon: MODULE_NAV_META[m.id]?.icon ?? LayoutDashboard,
          path: m.route,
        })),
      ...(section.staticItems ?? []),
    ],
  }));

  // Diocese entry only exists for cloud diocese_admin/bishop (same gate as the
  // /diocese route). Everyone else keeps the exact same sections array.
  const sections = canSeeDiocese()
    ? [
        navSections[0],
        { title: 'DIOCESE', items: [{ label: 'Diocese', icon: Landmark, path: '/diocese' }] },
        ...navSections.slice(1),
      ]
    : navSections;

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-deep-navy flex flex-col z-sidebar transition-all duration-300"
      style={{ width: collapsed ? 68 : 260 }}
    >
      {/* Logo */}
      <div
        className="sidebar-logo flex items-center gap-3 px-5 border-b border-white/[0.08] shrink-0"
        style={{ height: 64 }}
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gold shrink-0">
          <Church className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden whitespace-nowrap"
          >
            <span className="font-playfair text-lg font-semibold text-white">
              ChurchOS
            </span>
          </motion.div>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-2">
            {!collapsed && (
              <div className="px-5 mt-5 mb-2">
                <span className="label text-white/40">{section.title}</span>
              </div>
            )}
            {collapsed && <div className="h-4" />}
            {section.items.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  data-tour={item.label.toLowerCase()}
                  className={
                    'relative flex items-center mx-2 rounded-lg transition-all duration-150 group ' +
                    (collapsed ? 'justify-center px-0 py-3 mx-2' : 'px-4 py-3 mx-2') +
                    ' ' +
                    (isActive
                      ? 'bg-[rgba(201,150,59,0.2)] text-gold'
                      : 'text-white/70 hover:text-white hover:bg-white/[0.06]')
                  }
                  style={isActive ? { borderLeft: '3px solid #C9963B' } : { borderLeft: '3px solid transparent' }}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon
                    className={'shrink-0 ' + (isActive ? 'text-gold' : 'text-current')}
                    style={{ width: 20, height: 20 }}
                  />
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15, delay: 0.1 }}
                      className="ml-4 text-sm font-medium whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div className="shrink-0 p-3 border-t border-white/[0.08]">
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center w-full py-2.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <div className="flex items-center gap-2">
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Collapse</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
