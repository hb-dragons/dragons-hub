import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "*.test.ts"],
    coverage: {
      provider: "v8",
      // Scoped to the hand-written runtime modules on purpose (issue #130).
      // Everything else under src/schema is declarative pgTable/column
      // declarations with no branching; it is exercised end to end by
      // @dragons/api's PGlite suite, which builds every table from this schema
      // and runs real SQL against it. Measuring those files here would report a
      // number that says nothing about whether they work. The push guards
      // (drizzle.config.ts, scripts/no-db-push.mjs) are covered by their own
      // tests but run out of process, so they are not measurable here either.
      // Add any new module with real branching logic to this list.
      include: ["src/index.ts", "src/schema/versions.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Measured floor 2026-07-27 (issue #130), the first tests this package
        // has had: 76.92 statements / 100 branches / 62.5 functions / 76.92
        // lines. Ratchet up as it grows, never down. The gap to 100 is the
        // declarative half of versions.ts — three `references(() => matches.id)`
        // callbacks that drizzle only invokes when it resolves foreign-key
        // metadata, i.e. while generating a migration, not at import. Calling
        // them from a test would assert drizzle's own wiring, which is exactly
        // what the exemption this package just came off existed to avoid.
        branches: 100,
        functions: 62,
        lines: 76,
        statements: 76,
      },
    },
  },
});
