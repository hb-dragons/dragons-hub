// PROTOTYPE (throwaway) — ticket 16, unify-dragons-platform
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      // raw-TS workspace packages must be bundled, not externalized
      noExternal: [
        "@dragons/ui",
        "@dragons/api-client",
        "@dragons/shared",
        "@dragons/contracts",
      ],
    },
  },
});
