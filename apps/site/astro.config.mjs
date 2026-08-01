import { defineConfig, fontProviders } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://hbdragons.de",
  trailingSlash: "always",
  build: { format: "directory" },   // Apache mod_dir canonicalizes to /path/ — match it
  integrations: [react(), sitemap()],
  image: { domains: ["cms.hbdragons.de", "storage.googleapis.com"] },
  fonts: [
    { provider: fontProviders.fontsource(), name: "Archivo", cssVariable: "--font-archivo",
      weights: [400, 500, 600, 700, 800, 900] },
    { provider: fontProviders.fontsource(), name: "JetBrains Mono", cssVariable: "--font-jetbrains-mono",
      weights: [400, 700] },
  ],
  vite: {
    plugins: [tailwindcss()],
    ssr: { noExternal: ["@dragons/ui", "@dragons/api-client", "@dragons/shared", "@dragons/contracts"] },
  },
});
