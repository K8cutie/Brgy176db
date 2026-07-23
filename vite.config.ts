import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

// Electron loads the app over file:// and needs RELATIVE asset paths ('./'),
// but a web build served from a domain root needs an ABSOLUTE base ('/') or
// deep routes like /portal/demo resolve their assets against /portal/ and 404.
// So: web targets (the demo showcase now, cloud SaaS later) get '/', and the
// default Electron build keeps './'.
const isWebBuild =
  process.env.VITE_CHURCHOS_DEMO === 'true' || process.env.VITE_CHURCHOS_MODE === 'cloud';

// https://vite.dev/config/
export default defineConfig({
  base: isWebBuild ? '/' : './',
  // inspectAttr() rewrites every JSX element with a code-path="src/…:line:col" attribute
  // for the in-app dev inspector. It has no internal env gate, so without apply:'serve'
  // it also runs during `vite build` and ships thousands of source paths into the prod
  // bundle/DOM. Gate it to the dev server only.
  plugins: [{ ...inspectAttr(), apply: 'serve' }, react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
