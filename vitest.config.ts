import path from "path"
import { defineConfig } from "vitest/config"

// Separate from vite.config.ts on purpose: the build config pulls in the React
// and inspect plugins that aren't needed (and slow down) the unit-test run. Tests
// target the pure business/util logic in src/lib.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // jsdom gives us localStorage etc. for the storage-backed helpers.
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      // Scope coverage to the pure logic we actually test; the UI/data-heavy
      // modules are excluded so the number reflects tested business logic.
      include: ["src/lib/validation.ts", "src/lib/feeSchedule.ts"],
    },
  },
})
