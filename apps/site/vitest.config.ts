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
        // Measured 2026-08-02 (issue #200 cleanup sweep): 97.25 branches /
        // 100 functions / 99.76 lines / 99.41 statements. Ratchet up over
        // time; never lower.
        branches: 97,
        functions: 100,
        lines: 99,
        statements: 99,
      },
    },
  },
});
