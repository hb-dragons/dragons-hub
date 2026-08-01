import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Payload-generated artifacts and Next catch-all glue — no hand-written logic.
        "src/payload-types.ts",
        "src/app/**",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Ratcheted 2026-08-01 (issue #162, content collections + contract
        // tests): measured 97.0/66.6/100/96.9. The uncovered remainder is
        // the declarative payload.config. Ratchet up as tests grow; never
        // lower.
        branches: 66,
        functions: 100,
        lines: 96,
        statements: 96,
      },
    },
  },
});
