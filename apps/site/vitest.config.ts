import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Executed by Astro during `astro build`/`astro sync`, not importable
        // under vitest (`astro:content` is a virtual module). Covered by the
        // end-to-end build against a local CMS instead.
        "src/content.config.ts",
      ],
      thresholds: {
        // Measured floor 2026-08-01 (issue #172, first test suite in this
        // package): 96.55 branches / 100 functions / 97.36 lines / 97.77
        // statements — src/lib/payload.ts fully exercised, src/lib/strings.ts
        // is a literal map. Ratchet up over time; never lower.
        branches: 96,
        functions: 100,
        lines: 97,
        statements: 97,
      },
    },
  },
});
