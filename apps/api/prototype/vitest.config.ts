// PROTOTYPE — issue #143. Kept out of the package's own vitest config so the
// prototype is not measured by the api coverage gate and does not run in CI.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    root: __dirname,
    include: ["*.test.ts"],
  },
});
