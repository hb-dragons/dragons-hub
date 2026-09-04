import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "scripts/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "scripts/**/*.test.ts",
        // Payload-generated artifacts and Next catch-all glue — no hand-written logic.
        "src/payload-types.ts",
        "src/app/**",
        // `payload migrate:create` output (issue #164) — generated SQL, not code.
        "src/migrations/**",
        // Ambient module declaration — types only, no runtime.
        "scripts/migrate-strapi/jsdom.d.ts",
        // The migration's entry point is a three-line runner whose only job is
        // to call main() on import; importing it under test would start a
        // migration. The orchestration it calls lives in migrate.ts and is
        // covered there.
        "scripts/migrate-strapi/index.ts",
        // Same three-line runner shape for the one-off staff import; its
        // orchestration lives in run.ts and is covered there.
        "scripts/import-staff/index.ts",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // RESCOPED 2026-08-10 (issue #165): coverage.include was widened from
        // "src/**" to "src/** + scripts/**", so the gate now measures the
        // ~1,000-line Strapi importer it previously ignored entirely. Floors
        // re-measured against the new, roughly 3x larger scope — a new
        // measurement, not a relaxed gate (see CLAUDE.md, Testing
        // Requirements). Measured 99.46/90.83/98.93/99.38.
        //
        // Statements and lines went UP (98 -> 99) and are ratcheted here.
        // Branches (91 -> 90) and functions (100 -> 98) read marginally lower
        // only because the new scope contains code the old one did not: the
        // importer's defensive `??` fallbacks for Strapi fields that are
        // always present in the real corpus, and convert-blocks' placeholder
        // db adapter, whose init() exists precisely so it can never be
        // called — unreachable by construction, so functions cannot reach 100
        // under this scope. Ratchet up as tests grow; never lower.
        //
        // Ratcheted 2026-09-03 (issue #311): the CMS -> Hub staff import
        // added ~200 covered lines. Measured statements 99.58,
        // branches 92.48, functions 99.12, lines 99.52.
        //
        // Ratcheted 2026-09-04 (issue #329): the import's `--portraits` pass
        // added ~150 covered lines. Measured statements 99.65,
        // branches 93.46, functions 99.21, lines 99.6.
        branches: 93,
        functions: 99,
        lines: 99,
        statements: 99,
      },
    },
  },
});
