import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // pnpm doesn't hoist to the repo root by default — react lives under
      // this workspace's symlinked node_modules. Pin the alias there so a
      // missing top-level hoist doesn't break test resolution.
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      // Patched compose-refs: upstream v1.1.2 passes the full `refs` array as
      // the useCallback dependency, which creates a new ref callback identity
      // each render when any ref is an inline arrow function. React 19 then
      // calls the old callback with null before attaching the new one, causing
      // setState → re-render → repeat until max update depth is hit. The patch
      // uses a ref-backed stable callback that never changes identity.
      "@radix-ui/react-compose-refs": path.resolve(
        __dirname,
        "./src/__mocks__/@radix-ui/react-compose-refs.ts",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
    server: {
      deps: {
        // Inline radix-ui packages so Vite processes "use client" directives
        // and resolves the patched @radix-ui/react-compose-refs alias defined
        // above. Without inlining, the alias would not apply to imports inside
        // pre-bundled node_modules.
        inline: [/@radix-ui/, /radix-ui/],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/messages/**",
        "src/i18n/**",
        "scripts/**",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        // Measured floor 2026-09-05 (issue #229), ratcheted up from
        // 35/39/43/42. Actual: 42.15 branches / 46.57 functions / 51.36 lines /
        // 50.25 statements. The old numbers had drifted 7-8 points below
        // actual across the seasons, team staff and referee-hub work that
        // landed since the prior measurement without moving them.
        //
        // Prior floor measured 2026-07-27, ratcheted up from 29/32/37/36 after
        // the #129 + #132 batch landed. Actual: 35.40 branches / 39.20 functions /
        // 43.73 lines / 42.87 statements — roughly +5 points, from #132
        // un-skipping two files (6 dead tests became 9 live ones) and #129
        // adding tests alongside its i18n/a11y work. #132 deliberately left the
        // old numbers in place so concurrent branches would not red-line at
        // merge time; that reason expired once the batch was merged.
        //
        // Prior floor measured 2026-07-26 (issue #109), itself raised from
        // 9/10/12/12 after the old numbers had drifted ~25 points below actual,
        // leaving enough slack to delete a quarter of the suite with CI green.
        // Ratchet up over time; never lower.
        branches: 42,
        functions: 46,
        lines: 51,
        statements: 50,
      },
    },
  },
});
