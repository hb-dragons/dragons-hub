import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Phase 1 baseline — measured floor; ratchet up as api-client tests grow (see Phase 2).
        branches: 86,
        functions: 78,
        lines: 85,
        statements: 85,
      },
    },
  },
});
