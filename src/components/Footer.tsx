import { getParishConfig } from '@/lib/parishConfig';

export default function Footer() {
  const config = getParishConfig();
  const year = new Date().getFullYear();
  return (
    <footer className="py-4 px-6 border-t border-parchment text-center dark:border-dm-border">
      <p className="text-xs text-warm-gray dark:text-dm-text-muted">
        ChurchOS v1.1 &copy; {year} &middot; {config.parishName}
      </p>
    </footer>
  );
}
