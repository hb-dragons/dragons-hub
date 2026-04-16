import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    environment: "node",
    hookTimeout: 30_000,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/services/test.ts", "src/services/social/templates/**/*.tsx", "src/test/**"],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
  },
});
