import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/lib/i18n.ts",
        "src/i18n/**",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Rescoped 2026-07-26 (issue #109). These numbers are LOWER than the
        // 48/27/49/48 that stood here before, and that is not a threshold
        // reduction — it is a different measurement. Until this date
        // `coverage.include` was `src/lib/**/*.ts`, i.e. 814 of the app's
        // 16,288 lines (~5%), so the old figures described `src/lib` alone
        // while `components/`, `app/`, `hooks/` and `theme/` were invisible to
        // the gate. `include` now covers all of `src/**`, and these are the
        // honest measured floors under that wider scope. Do not "restore" the
        // old values; ratchet these up as native tests grow.
        //
        // Ratcheted 2026-08-11 (#213): statements 9 -> 10, on the SDK 57
        // foundation's new tests (global error handler, nav architecture, app
        // config). Measured 10.08/8.01/9.59/9.96 — branches, functions and
        // lines have not yet cleared their next whole point.
        //
        // Ratcheted 2026-08-11 (#216): lines 9 -> 10, on the native-header
        // tests (header options, tab-bar minimize behaviour, the widened nav
        // architecture suite). Measured 10.2/8.02/9.68/10.08 — statements,
        // branches and functions hold.
        //
        // Ratcheted 2026-08-11 (#217): statements 10 -> 11, functions 9 -> 11,
        // lines 9 -> 11, on the typed-href route table and its tests. Measured
        // 11.44/8.52/11.67/11.25 — branches still short of 9.
        //
        // Ratcheted 2026-08-11 (#218): functions and lines 9 -> 10, on the
        // haptic-semantics and filter-pill a11y tests. Measured
        // 10.36/8.02/10.85/10.26 — statements and branches hold. Superseded by
        // #217's higher floors above, which this merge keeps.
        branches: 8,
        functions: 11,
        lines: 11,
        statements: 11,
      },
    },
  },
});
