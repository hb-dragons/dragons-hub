import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  clean: true,
  external: ["dotenv"], // dev-only: conditionally imported, never runs in production
  deps: {
    // Bundle workspace packages (they ship as raw TypeScript) and the git dep
    alwaysBundle: [/^@dragons\//, "basketball-bund-sdk"],
    onlyAllowBundle: ["basketball-bund-sdk"],
  },
});
