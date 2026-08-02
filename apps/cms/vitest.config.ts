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
        // `payload migrate:create` output (issue #164) — generated SQL, not code.
        "src/migrations/**",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Ratcheted 2026-08-01 (issue #163, rebuild dispatch hooks): measured
        // 98.3/91.3/100/98.1. The uncovered remainder is the declarative
        // payload.config. Ratchet up as tests grow; never lower.
        branches: 91,
        functions: 100,
        lines: 98,
        statements: 98,
      },
    },
  },
});
