import { useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { EyeOff } from 'lucide-react';
import { getModuleRegistry, subscribeModules, getModulesSnapshot } from '@/lib/moduleRegistry';

// Gentle notice shown at the top of a page whose module is turned off.
// Judgment call (documented): module toggles hide navigation only — routes
// stay mounted so direct links, bookmarks, and in-app references keep working.
// This banner tells the user why the page is missing from the menu instead of
// hard-blocking them out of their own data.
export default function ModuleDisabledBanner() {
  useSyncExternalStore(subscribeModules, getModulesSnapshot);
  const { pathname } = useLocation();

  const mod = getModuleRegistry().find((m) => m.route === pathname);
  if (!mod || mod.enabled) return null;

  return (
    <div className="mb-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 flex items-center gap-3">
      <EyeOff className="w-4 h-4 text-gold shrink-0" />
      <p className="text-sm text-charcoal dark:text-dm-text">
        The <span className="font-medium">{mod.name}</span> module is turned off in{' '}
        <Link to="/settings" className="text-gold underline underline-offset-2 hover:text-gold-light">
          Settings
        </Link>
        . It is hidden from the menu, but this page still works if you need it.
      </p>
    </div>
  );
}
