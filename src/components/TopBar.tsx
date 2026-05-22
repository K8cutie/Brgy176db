import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Bell,
  Sun,
  Moon,
  ChevronDown,
  User,
} from 'lucide-react';
import { families } from '@/lib/directoryData';
import { baptismRecords, marriageRecords } from '@/lib/registryData';
import { SAMPLE_EVENTS } from '@/lib/calendarData';

interface TopBarProps {
  pageTitle: string;
  isDark: boolean;
  onToggleDark: () => void;
}

interface SearchResult {
  title: string;
  subtitle: string;
  path: string;
}

export default function TopBar({ pageTitle, isDark, onToggleDark }: TopBarProps) {
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ─── Keyboard shortcut: Ctrl+K ─── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ─── Search logic ─── */
  const results = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const found: SearchResult[] = [];

    // Search parishioners (from families)
    families.forEach((f) => {
      f.members.forEach((m) => {
        const name = `${m.firstName} ${m.lastName}`.toLowerCase();
        if (name.includes(q)) {
          found.push({
            title: `${m.firstName} ${m.lastName}`,
            subtitle: `${f.familyName} Family \u2014 Directory`,
            path: '/directory',
          });
        }
      });
    });

    // Search baptisms
    baptismRecords.forEach((r) => {
      const name = `${r.childFirstName} ${r.childLastName}`.toLowerCase();
      if (name.includes(q)) {
        found.push({
          title: `Baptism: ${r.childFirstName} ${r.childLastName}`,
          subtitle: `Registry #${r.registryNumber}`,
          path: '/registry',
        });
      }
    });

    // Search marriages
    marriageRecords.forEach((r) => {
      const groom = `${r.groomFirstName} ${r.groomLastName}`.toLowerCase();
      const bride = `${r.brideFirstName} ${r.brideLastName}`.toLowerCase();
      if (groom.includes(q) || bride.includes(q)) {
        found.push({
          title: `Wedding: ${r.groomFirstName} ${r.groomLastName} & ${r.brideFirstName} ${r.brideLastName}`,
          subtitle: `Registry #${r.registryNumber}`,
          path: '/registry',
        });
      }
    });

    // Search calendar events
    SAMPLE_EVENTS.forEach((ev) => {
      const title = ev.title.toLowerCase();
      if (title.includes(q)) {
        found.push({
          title: ev.title,
          subtitle: `${ev.type} \u2014 Calendar`,
          path: '/calendar',
        });
      }
    });

    // Limit to 8 results
    return found.slice(0, 8);
  }, [searchQuery]);

  const hasResults = showResults && results.length > 0;
  const hasNoResults = showResults && searchQuery.length >= 2 && results.length === 0;

  const handleResultClick = (path: string) => {
    navigate(path);
    setSearchQuery('');
    setShowResults(false);
  };

  return (
    <header className="sticky top-0 z-sticky h-topbar bg-white border-b border-parchment flex items-center justify-between px-6 transition-colors duration-300 dark:bg-dm-surface dark:border-dm-border">
      {/* Left: Page Title */}
      <div className="flex items-center gap-3">
        <h1 className="heading-lg text-charcoal dark:text-dm-text">{pageTitle}</h1>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(e.target.value.length >= 2);
            }}
            onFocus={() => {
              if (searchQuery.length >= 2) setShowResults(true);
            }}
            className="h-9 w-56 pl-9 pr-16 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
          />
          {/* Keyboard hint */}
          {!searchQuery && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-warm-gray border border-parchment rounded px-1.5 py-0.5 dark:border-dm-border dark:text-dm-text-muted">
              Ctrl+K
            </span>
          )}
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setShowResults(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-gray hover:text-charcoal"
            >
              &times;
            </button>
          )}

          {/* Search results dropdown */}
          <AnimatePresence>
            {hasResults && (
              <>
                {/* Overlay to close on click outside */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowResults(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-modal border border-parchment py-2 z-50 dark:bg-dm-surface dark:border-dm-border"
                >
                  {results.map((result, i) => (
                    <button
                      key={i}
                      onClick={() => handleResultClick(result.path)}
                      className="w-full text-left px-4 py-2.5 hover:bg-cream-dark transition-colors dark:hover:bg-dm-surface-raised"
                    >
                      <p className="body-sm font-medium text-charcoal dark:text-dm-text truncate">
                        {result.title}
                      </p>
                      <p className="label text-warm-gray dark:text-dm-text-muted truncate">
                        {result.subtitle}
                      </p>
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {hasNoResults && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowResults(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-modal border border-parchment py-4 z-50 dark:bg-dm-surface dark:border-dm-border"
                >
                  <p className="body-sm text-warm-gray text-center px-4">
                    No results found for &ldquo;{searchQuery}&rdquo;
                  </p>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text dark:hover:bg-dm-surface-raised">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
        </button>

        {/* Dark Mode Toggle */}
        <button
          onClick={onToggleDark}
          className="p-2 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text dark:hover:bg-dm-surface-raised"
          title={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-cream-dark transition-all dark:hover:bg-dm-surface-raised"
          >
            <div className="w-8 h-8 rounded-full bg-deep-navy flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <span className="hidden md:inline text-sm font-medium text-charcoal dark:text-dm-text">
              Fr. Reyes
            </span>
            <ChevronDown className="w-4 h-4 text-warm-gray hidden md:block" />
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-modal border border-parchment py-1 z-50 dark:bg-dm-surface dark:border-dm-border"
                >
                  <div className="px-4 py-3 border-b border-parchment dark:border-dm-border">
                    <p className="text-sm font-medium text-charcoal dark:text-dm-text">Fr. Jose Reyes</p>
                    <p className="text-xs text-warm-gray dark:text-dm-text-muted">Parish Priest</p>
                  </div>
                  <button className="w-full text-left px-4 py-2 text-sm text-charcoal hover:bg-cream-dark transition-colors dark:text-dm-text dark:hover:bg-dm-surface-raised">
                    Profile
                  </button>
                  <button className="w-full text-left px-4 py-2 text-sm text-charcoal hover:bg-cream-dark transition-colors dark:text-dm-text dark:hover:bg-dm-surface-raised">
                    Settings
                  </button>
                  <div className="border-t border-parchment dark:border-dm-border" />
                  <button className="w-full text-left px-4 py-2 text-sm text-error hover:bg-cream-dark transition-colors">
                    Sign Out
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
