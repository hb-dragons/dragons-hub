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
        // 10.36/8.02/10.85/10.26 — statements and branches hold.
        //
        // Ratcheted 2026-08-11 (#219): the board's utility sheets became
        // routes, and the logic they used to carry inline — param parsing,
        // result routing, move placement, local-date conversion — moved into
        // tested lib modules. Measured 12.56/9.07/12.87/12.29.
        //
        // Ratcheted 2026-08-11 (#216, #217, #218, #219 merged): statements
        // 12 -> 14, functions 12 -> 17, lines 12 -> 14. Each figure above was
        // measured on its own branch against the shared base; the four suites
        // together cover more than any one of them did, so the floors are
        // re-measured here rather than left at the highest single branch's.
        // Measured 14.5/9.58/17.04/14.2 — branches holds at 9.
        //
        // Ratcheted 2026-08-11 (#222): statements 14 -> 15, branches 9 -> 10,
        // functions 17 -> 18, on the task-detail and quick-create sheet routes
        // and the logic they shed on the way (the create-task payload, the
        // assignee diff, the board-tasks key matcher, the column ordering).
        // Measured 15.27/10.28/18.55/14.92 — lines has not yet cleared 15.
        //
        // Ratcheted 2026-08-11 (#223): every floor up by one point. The
        // referee-assignment modal — 693 untested lines — became a route
        // sheet, and the logic it carried inline (distance brackets, candidate
        // grouping, avatar swatches, slot params) moved into tested lib
        // modules alongside the header search field's options. Measured
        // 15.57/10.2/18.43/15.16.
        //
        // Ratcheted 2026-08-11 (#221, #222, #223 merged): statements 15 -> 16,
        // functions 18 -> 20. Same reason as the four-branch re-measure above —
        // each figure was measured on its own branch against the shared base,
        // and the three suites together cover more than any one did. Measured
        // 16.44/10.95/20.09/15.96 — branches and lines hold at their current
        // floors, neither having cleared the next whole point.
        //
        // Ratcheted 2026-08-11 (#220): lines 15 -> 16, on the task action
        // vocabulary and the undo payload that came out of the board screen
        // when the two long-press sheets became one native context menu.
        // Measured 16.69/10.95/20.53/16.24 — statements, branches and
        // functions hold, none having cleared the next whole point.
        // Ratcheted 2026-08-12 (#225): branches 10 -> 11. The last JS bottom
        // sheet became a route, which took an untested 125-line component out
        // of the scope and put its submit gate in a tested lib module.
        // Measured 16.94/11.12/20.87/16.47 — statements, functions and lines
        // have not cleared the next whole point.
        //
        // Ratcheted 2026-08-12 (#224): statements 16 -> 17, functions 20 -> 21.
        // The board's header buttons and Profile's two hand-rolled pickers
        // became data — the board action vocabulary and the preference segment
        // specs — and the untested JSX they replaced left the scope with them.
        // Measured 17.17/11.14/21.24/16.7 — branches and lines hold.
        //
        // Ratcheted 2026-08-25 after #230's code track: statements 17 -> 18,
        // branches 11 -> 12, lines 16 -> 17, on the store-readiness lib
        // modules (legal links and the mailto builder, the push pre-prompt
        // decision, the privacy-manifest and nav-architecture guards).
        // Measured 18.19/12.18/21.97/17.61 — functions holds at 21, not
        // having cleared the next whole point.
        branches: 12,
        functions: 21,
        lines: 17,
        statements: 18,
      },
    },
  },
});
