import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  clean: true,
  // Bundle workspace packages (they ship as raw TypeScript) and the git dep
  noExternal: [/^@dragons\//, "basketball-bund-sdk"],
  // All npm packages stay external — pnpm deploy provides them at runtime
});
