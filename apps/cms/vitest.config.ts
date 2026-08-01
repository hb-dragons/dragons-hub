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
        // Measured floor 2026-08-01 (issue #161, first tests): blurhash helper,
        // media hook and access rule are covered; the uncovered remainder is
        // declarative payload.config/users config. Ratchet up as tests grow;
        // never lower.
        branches: 50,
        functions: 100,
        lines: 86,
        statements: 86,
      },
    },
  },
});
