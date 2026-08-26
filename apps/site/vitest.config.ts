import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // node by default; a component test opts in with a
    // `// @vitest-environment happy-dom` docblock, same as @dragons/web.
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        // Executed by Astro during `astro build`/`astro sync`, not importable
        // under vitest (`astro:content` is a virtual module). Covered by the
        // end-to-end build against a local CMS instead.
        "src/content.config.ts",
      ],
      thresholds: {
        // Rescoped 2026-08-26 (issue #268). These numbers are LOWER than the
        // 97/100/99/99 that stood here before, and that is not a threshold
        // reduction — it is a different measurement. Until this date
        // `coverage.include` was `src/**/*.ts`, a glob that matches no `.tsx`
        // and no `.astro`, so the old figures described roughly 28 pure helper
        // modules while all 12 React islands and every presentational
        // component were invisible to the gate. `include` now covers
        // `src/**/*.{ts,tsx}`, and these are the honest measured floors under
        // that wider scope (62.62 statements / 56.84 branches / 48.69
        // functions / 60.74 lines). Do not "restore" the old values; ratchet
        // these up as component tests grow.
        //
        // `.astro` files remain outside the gate: they are compiled by Astro,
        // not importable under vitest. The pattern for covering them is
        // `legal-citations.test.ts` and `deploy-config.test.ts` — read the
        // file from disk and assert against its text.
        branches: 56,
        functions: 48,
        lines: 60,
        statements: 62,
      },
    },
  },
});
