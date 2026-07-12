import { useState } from 'react';
import { isDemo } from '@/lib/demo';

// A small, dismissible "live demo" pill. Renders only in VITE_CHURCHOS_DEMO
// builds (compiles out everywhere else) and floats above both the staff app and
// the parishioner portal so a viewer always knows this is a sample showcase.
export default function DemoBanner() {
  const [hidden, setHidden] = useState(false);
  if (!isDemo() || hidden) return null;
  return (
    <div
      style={{
        position: 'fixed', bottom: 14, left: 14, zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#3D3A36', color: '#FFF', borderRadius: 999,
        padding: '8px 8px 8px 14px', fontSize: 13,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 6px 20px rgba(0,0,0,0.28)', maxWidth: 'calc(100vw - 28px)',
      }}
    >
      <span>🎬 Live demo — sample data, saved only in this browser</span>
      <button
        onClick={() => setHidden(true)}
        aria-label="Dismiss demo notice"
        style={{
          background: 'rgba(255,255,255,0.2)', border: 'none', color: '#FFF',
          borderRadius: 6, cursor: 'pointer', padding: '3px 9px', fontSize: 13, lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}
