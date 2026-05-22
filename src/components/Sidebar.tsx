import { useState } from 'react';
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
} from 'lucide-react';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'PARISH',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
      { label: 'Registry', icon: BookOpen, path: '/registry' },
      { label: 'Directory', icon: Users, path: '/directory' },
      { label: 'Calendar', icon: Calendar, path: '/calendar' },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      { label: 'Finance', icon: DollarSign, path: '/finance' },
      { label: 'Ministries', icon: UserCheck, path: '/ministries' },
      { label: 'SSDM', icon: Heart, path: '/ssdm' },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { label: 'Reports', icon: FileText, path: '/reports' },
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
        {navSections.map((section) => (
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
