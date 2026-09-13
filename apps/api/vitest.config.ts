import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    environment: "node",
    hookTimeout: 30_000,
    include: ["src/**/*.test.ts"],
    globalSetup: ["./vitest.global-setup.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/services/test.ts", "src/services/social/templates/**/*.tsx", "src/test/**"],
      thresholds: {
        // Measured floor 2026-09-05 (issue #229): functions 97 -> 98 after the
        // team entries follow-ups landed. Actual: 91.90 branches / 98.05
        // functions / 98.57 lines / 97.94 statements. The other three sit
        // just under their next integer and stay put.
        //
        // Prior floor measured 2026-07-27, ratcheted up from 90/95/95/95 after
        // the #54 + #77 + #78 + #79 + #80 + #81 + #85 batch landed. Actual:
        // 91.92 branches / 97.68 functions / 98.57 lines / 98.00 statements.
        //
        // Each of those seven branches was told to leave these numbers alone
        // so seven concurrent branches would not red-line each other at merge
        // time; that reason expired the moment the batch was merged, and this
        // is the close-out. Ratchet up over time; never lower.
        branches: 91,
        functions: 98,
        lines: 98,
        statements: 97,
      },
    },
  },
});
