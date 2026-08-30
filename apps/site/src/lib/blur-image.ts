/**
 * Pure helpers behind BlurImage.astro's three rendering branches.
 *
 * The component itself is compiled by Astro and invisible to the coverage
 * gate, so the branch logic lives here where vitest can reach it — the same
 * pattern as `legal-citations.ts` and `deploy-config.ts`.
 */

/** An `import`ed image asset, narrowed to the fields the branch logic reads. */
interface ImportedImage {
  src: string;
  width: number;
  format: string;
}

export type BlurImageSource = string | ImportedImage;

/**
 * Widths BlurImage generates a `srcset` from when a caller names none.
 *
 * The largest card on the site is the PageHeader band at full viewport width;
 * everything else is a grid tile at a half or a third of a 1280px container.
 */
export const DEFAULT_IMAGE_WIDTHS = [400, 800, 1200] as const;

/**
 * `sizes` for a tile that fills the viewport on phones and about half of it
 * from tablet up. Full-bleed callers (PageHeader) pass `"100vw"` instead, and
 * fixed-width ones (ItemRows logos) pass their pixel width.
 */
export const DEFAULT_IMAGE_SIZES = "(max-width: 768px) 100vw, 50vw";

/** A `/public` path ships byte-for-byte; only absolute URLs are remote. */
function isRemote(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

function isSvgPath(src: string): boolean {
  return /\.svg(?:[?#]|$)/i.test(src);
}

/**
 * Which of BlurImage's three branches a source takes.
 *
 * - `asset` — an `import`ed file: Astro already knows its dimensions.
 * - `remote` — a CMS URL: Astro needs `inferSize` to fetch it at build time,
 *   and the host must be allowed by `image.remotePatterns` in astro.config.
 * - `passthrough` — a `/public` path or an SVG. Files under `public/` are not
 *   part of the build graph, and sharp cannot rasterise an SVG to a `srcset`;
 *   both render as a plain `<img>`.
 */
export function imageBranch(src: BlurImageSource): "asset" | "remote" | "passthrough" {
  if (typeof src !== "string") return src.format === "svg" ? "passthrough" : "asset";
  if (!isRemote(src) || isSvgPath(src)) return "passthrough";
  return "remote";
}

/** The URL to put on a plain `<img>`, for either source shape. */
export function plainSrc(src: BlurImageSource): string {
  return typeof src === "string" ? src : src.src;
}

/**
 * Clamps the requested widths to what the source can actually supply.
 *
 * Asking Astro for a width above the original upscales it: a bigger file that
 * carries no more detail. Widths at or below the source are kept as-is, and a
 * source smaller than every requested width still gets its own single width so
 * `srcset` is never empty.
 */
export function clampWidths(widths: readonly number[], sourceWidth: number): number[] {
  const fitting = widths.filter((width) => width <= sourceWidth);
  return fitting.length > 0 ? fitting : [sourceWidth];
}

/**
 * The width for the fallback `src` — the largest `srcset` candidate.
 *
 * Without an explicit `width`, Astro renders the fallback at the source's
 * original width: a client that ignores `srcset` (OG scrapers, mail clients,
 * old browsers) then downloads the full original — 733 KB for the home page's
 * club photo — instead of the largest size the layout ever asks for.
 */
export function fallbackWidth(widths: readonly number[], sourceWidth: number): number {
  return Math.max(...clampWidths(widths, sourceWidth));
}
