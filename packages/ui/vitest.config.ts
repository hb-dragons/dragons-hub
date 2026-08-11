import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Components in this package import each other through the package's own
      // subpath export (`@dragons/ui/components/foo`). Vite does not read the
      // `exports` map of the package it is currently loading from source, so
      // map the specifier back to src/ by hand.
      "@dragons/ui": path.resolve(__dirname, "./src"),
      // pnpm doesn't hoist to the repo root by default — react lives under
      // this workspace's symlinked node_modules. Pin the alias there so a
      // missing top-level hoist doesn't break test resolution.
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    // Matches @dragons/web: node by default, with the DOM opted into per file
    // via a `// @vitest-environment happy-dom` docblock. happy-dom is the
    // repo's one DOM implementation; do not add jsdom as a second.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Two pieces of @dragons/web's config are deliberately absent here. That
    // one aliases a patched @radix-ui/react-compose-refs — React 19 hits a
    // max-update-depth loop when an inline ref callback meets upstream's
    // unstable useCallback dependency — and inlines /@radix-ui/ so the alias
    // reaches imports inside node_modules. Neither is needed for these tests:
    // the suite passes without them, and the inlining alone costs roughly 4x
    // the runtime because Vite then transforms all of Radix from source.
    // Should a future test in this package trip the loop, copy the shim from
    // apps/web/src/__mocks__/@radix-ui/ along with the `server.deps.inline`
    // entry that makes it apply.
    coverage: {
      provider: "v8",
      // Scoped to the hand-written modules only. The rest of this package is
      // vendored shadcn/Radix wrappers — a cn() call, a cva variant map and a
      // Slot around a primitive — where a test would assert Radix's behaviour
      // rather than ours. packages/db and packages/sdk scope their gates the
      // same way and for the same reason. Those wrappers stay guarded from
      // outside by @dragons/web's component tests, `tsc`, and
      // `pnpm check:design-tokens`. Widen this list when a file grows logic,
      // and re-measure the floors when you do.
      include: [
        "src/components/sidebar.tsx",
        "src/components/combobox.tsx",
        "src/components/date-picker.tsx",
        "src/components/time-picker.tsx",
        "src/components/use-mobile.ts",
        "src/components/field.tsx",
        "src/lib/utils.ts",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Measured floor 2026-07-27, issue #131 — the first thresholds this
        // package has had. Actual: 96.19 branches / 98.03 functions /
        // 99.32 lines / 99.36 statements. They start this high because the
        // scope above is narrow: it gates seven hand-written modules, not the
        // whole package. Ratchet up over time; never lower. If the scope is
        // widened to cover more files, re-measure and record the reason here
        // rather than treating the new, lower numbers as a regression.
        branches: 96,
        functions: 98,
        lines: 99,
        statements: 99,
      },
    },
  },
});
