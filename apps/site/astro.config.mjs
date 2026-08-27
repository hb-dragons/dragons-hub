import { defineConfig, fontProviders } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://hbdragons.de",
  trailingSlash: "always",
  build: { format: "directory" },   // Apache mod_dir canonicalizes to /path/ — match it
  integrations: [react(), sitemap()],
  // BlurImage runs CMS media through sharp at build time, which means every
  // host that serves media has to be authorised here or `astro build` refuses
  // it. `domains` is exact-match only, so staging (cms.testing.hbdragons.de)
  // and the local CMS need patterns.
  image: {
    domains: ["cms.hbdragons.de", "storage.googleapis.com"],
    remotePatterns: [
      { protocol: "https", hostname: "**.hbdragons.de" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  fonts: [
    { provider: fontProviders.fontsource(), name: "Archivo", cssVariable: "--font-archivo",
      weights: [400, 500, 600, 700, 800, 900] },
    { provider: fontProviders.fontsource(), name: "JetBrains Mono", cssVariable: "--font-jetbrains-mono",
      weights: [400, 700] },
    // Display face for the home hero claim, and nothing else — a brush font
    // falls apart below ~24px and German compound words make it worse. Only
    // index.astro pulls it in, so the other pages never pay for it.
    // Vic Fieger's Edo, 1001Fonts FFC licence (src/assets/fonts/edo-LICENSE.txt):
    // commercial use and WOFF2 conversion are allowed, modification is not, so
    // the file is the full font converted format-only — never subset.
    //
    // `unicodeRange` is not an optimisation here, it is a correctness fix. Edo
    // maps 656 codepoints but draws only these 68: the other 588 — comma,
    // colon, quotes, ampersand, every accented letter, ß — are glyphs with
    // zero contours and a real advance width. A browser has no way to know
    // they are empty, so it renders an invisible gap and never falls back.
    // Declaring the range Edo can actually draw hands everything else to
    // Archivo. Re-derive it from the font, not by eye, if the file is ever
    // replaced.
    { provider: fontProviders.local(), name: "Edo", cssVariable: "--font-edo",
      fallbacks: ["Archivo", "sans-serif"],
      options: {
        variants: [{
          weight: 400, style: "normal", src: ["./src/assets/fonts/edo.woff2"],
          unicodeRange: ["U+21", "U+27", "U+2D-2E", "U+30-39", "U+3F", "U+41-5A", "U+61-7A"],
        }],
      } },
  ],
  vite: {
    plugins: [tailwindcss()],
    ssr: { noExternal: ["@dragons/ui", "@dragons/api-client", "@dragons/shared", "@dragons/contracts"] },
  },
});
