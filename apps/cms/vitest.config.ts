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
        // RESCOPED 2026-09-04 (issue #316): coverage.include was narrowed from
        // "src/** + scripts/**" back to "src/**". The two one-off importers
        // under scripts/ read the CMS `trainers` collection this issue dropped;
        // they had already run in production, so they were deleted rather than
        // left as unrunnable code padding the gate. What remains is the app
        // itself — roughly a third of the old scope, and a different body of
        // code — so the floors are re-measured against it, the way the
        // 2026-08-10 widening re-measured in the other direction (see
        // CLAUDE.md, Testing Requirements). Measured 98.76/94.28/100/98.57.
        //
        // Ratcheted 2026-10-09: migrations.test.ts boots the config with
        // GCS_MEDIA_BUCKET set, covering the GCS plugin branch of
        // payload.config.ts — the one line that held statements and lines
        // below 100. Measured 100/97.14/100/100. Ratchet up as tests grow;
        // never lower.
        branches: 97,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
