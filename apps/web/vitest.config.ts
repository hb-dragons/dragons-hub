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
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    server: {
      deps: {
        inline: [/@radix-ui/, /radix-ui/],
      },
    },
  },
});
