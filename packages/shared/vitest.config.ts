import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Phase 2 measured floor (2026-06-10) — ratchet up as tests grow.
        branches: 85,
        functions: 96,
        lines: 97,
        statements: 93,
      },
    },
  },
});
