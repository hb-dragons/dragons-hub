import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "../../node_modules/react"),
      "react-dom": path.resolve(__dirname, "../../node_modules/react-dom"),
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
