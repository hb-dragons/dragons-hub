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
    include: ["src/**/*.test.{ts,tsx}"],
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
  },
});
