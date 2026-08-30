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
    // Bricolage Grotesque, not Archivo: the nav sets its links in caps at 16px
    // and Archivo's heavy weights close their counters at that size, which is
    // what made the bar read as a row of blocks. Bricolage is the display face
    // that pairs with Edo on the hero — both carry visible drawing rather than
    // neutral UI-grotesque shapes.
    //
    // It tops out at 800: `font-black` (14 uses) resolves to 800, since CSS
    // weight matching picks the nearest available face rather than
    // synthesising past the top of the family. So `font-bold` and
    // `font-black` sit one step apart instead of two — intended, not a
    // regression to fix by adding a weight that does not exist.
    //
    // The list is exactly what the site uses; Layout.astro preloads the
    // 400/700/800 subset of it (`<Font preload={[...]}>` filters by weight).
    // The family ships no italic at all, so RichText's `em` is the browser's
    // synthetic oblique.
    { provider: fontProviders.fontsource(), name: "Bricolage Grotesque",
      cssVariable: "--font-bricolage",
      weights: [400, 500, 600, 700, 800], styles: ["normal"] },
    { provider: fontProviders.fontsource(), name: "JetBrains Mono", cssVariable: "--font-jetbrains-mono",
      weights: [400, 700] },
    // Display face for the home hero claim, and nothing else — a brush font
    // falls apart below ~24px and German compound words make it worse. Only
    // index.astro pulls it in, so the other pages never pay for it.
    // Vic Fieger's Edo SZ, 1001Fonts FFC licence (src/assets/fonts/
    // edo-LICENSE.txt): commercial use and WOFF2 conversion are allowed,
    // modification is not, so the file is the full font converted
    // format-only — never subset.
    //
    // Edo SZ replaced plain Edo (2026-08-27): same designer, same licence,
    // but it draws 178 codepoints against Edo's 68 — the comma in the claim,
    // plus every umlaut and ß, which Edo mapped but left blank. It is also
    // ~17% narrower per glyph, which the claim's font sizes account for.
    //
    // `unicodeRange` is not an optimisation here, it is a correctness fix.
    // Edo SZ still maps 70 codepoints it does not draw (#, $, §, the maths
    // symbols, the fi/fl ligatures) as zero-contour glyphs with a real
    // advance width. A browser has no way to know they are empty, so it
    // renders an invisible gap and never falls back. Declaring the range the
    // font can actually draw hands everything else to Bricolage. Re-derive it
    // from `glyf[g].numberOfContours`, never from the cmap, if the file is
    // ever replaced.
    { provider: fontProviders.local(), name: "Edo SZ", cssVariable: "--font-edo",
      fallbacks: ["Bricolage Grotesque", "sans-serif"],
      options: {
        variants: [{
          weight: 400, style: "normal", src: ["./src/assets/fonts/edo-sz.woff2"],
          unicodeRange: [
            "U+20-22", "U+25-29", "U+2B-3B", "U+3D", "U+3F-5A", "U+5E-7A", "U+7E",
            "U+A1", "U+A8", "U+AA-AB", "U+AD", "U+B4", "U+B7-B8", "U+BA-BB",
            "U+BF-CF", "U+D1-D6", "U+D8-DC", "U+DF-EF", "U+F1-F6", "U+F8-FC",
            "U+FF", "U+131", "U+152-153", "U+160-161", "U+178", "U+17D-17E",
            "U+2C6-2C7", "U+2C9", "U+2D8-2DD", "U+37E", "U+2013-2014",
            "U+2018-201A", "U+201C-201E", "U+20AC", "U+2219",
          ],
        }],
      } },
  ],
  vite: {
    plugins: [tailwindcss()],
    ssr: { noExternal: ["@dragons/ui", "@dragons/api-client", "@dragons/shared", "@dragons/contracts"] },
  },
});
