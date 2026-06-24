import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { hydrateDesktopStore } from './lib/desktopStore'
import { hydrateCloudStore } from './lib/cloudStore'
import { reconcileSession } from './lib/session'
import { initMonitoring } from './lib/monitoring'

// Initialize error monitoring first so any startup error is captured. No-op
// unless VITE_SENTRY_DSN is set (desktop/local stay fully offline).
initMonitoring()

// Hydrate whichever backend is active (desktop SQLite or cloud Supabase) into
// the in-memory cache before the first render, so all synchronous storage reads
// see real data. reconcileSession() aligns the renderer with the main-process
// verified login (so an edited localStorage can't fake a session). Each no-ops
// when it isn't the active mode; in the plain browser all resolve immediately.
Promise.all([hydrateDesktopStore(), hydrateCloudStore(), reconcileSession()]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>,
  )
})
