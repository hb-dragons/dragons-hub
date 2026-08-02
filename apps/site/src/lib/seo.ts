/**
 * SEO meta helpers behind Seo.astro (plan Task C8): title templating,
 * description selection/truncation and canonical/OG URL building. All pure —
 * Seo.astro passes Astro.site/Astro.url in from the render context.
 */
import { toSiteImage } from "./site-image";
import { strings } from "./strings";

/**
 * Default OG/Twitter card image: the club photo shipped in public/img/.
 * Routes with something more specific (news header, team photo) override it.
 */
export const DEFAULT_OG_IMAGE = "/img/gesamt.webp";

/** Meta description budget — Google truncates around this width on desktop. */
const DESCRIPTION_MAX = 155;

/**
 * Applies the club title template (`%s | HB Dragons e.V.`). Titles already
 * carrying the club name pass through untouched, so a page handing in a
 * pre-suffixed legacy title never doubles the brand.
 */
export function withTitleSuffix(title: string): string {
  const trimmed = title.trim();
  return trimmed.includes(strings.site.name) ? trimmed : `${trimmed} | ${strings.site.name}`;
}

/**
 * Collapses whitespace and truncates at the last word boundary inside `max`
 * characters, appending an ellipsis. Trailing punctuation stranded at the cut
 * is dropped so descriptions never end in "…," artifacts.
 */
export function truncateAtWord(text: string, max: number = DESCRIPTION_MAX): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  const slice = collapsed.slice(0, max);
  const boundary = slice.lastIndexOf(" ");
  const cut = boundary > 0 ? slice.slice(0, boundary) : slice;
  return `${cut.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/**
 * The page's meta description: the first candidate with content, truncated to
 * the meta budget. Callers pass `[CMS override, auto-derived text, fallback]`
 * in that order (issue #179: override ?? derived).
 */
export function metaDescription(
  ...candidates: ReadonlyArray<string | null | undefined>
): string {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const collapsed = candidate.replace(/\s+/g, " ").trim();
    if (collapsed !== "") return truncateAtWord(collapsed);
  }
  return "";
}

function requireSite(site: URL | string | undefined): URL | string {
  if (site === undefined) {
    throw new Error(
      "seo: astro.config `site` must be set to build absolute canonical/OG URLs",
    );
  }
  return site;
}

/**
 * Absolute canonical URL in trailing-slash form — the shape the Apache host's
 * mod_dir canonicalizes to (astro.config: trailingSlash "always", directory
 * build format). `.html` pathnames (the 404 route) normalize to their
 * directory form.
 */
export function canonicalUrl(site: URL | string | undefined, pathname: string): string {
  let path = pathname;
  if (path.endsWith("/index.html")) path = path.slice(0, -"index.html".length);
  else if (path.endsWith(".html")) path = `${path.slice(0, -".html".length)}/`;
  if (!path.startsWith("/")) path = `/${path}`;
  if (!path.endsWith("/")) path = `${path}/`;
  return new URL(path, requireSite(site)).href;
}

/**
 * Resolves a site-relative path (public/ assets) against the site origin;
 * already-absolute URLs (CMS/GCS media) pass through untouched. OG images
 * must be absolute — scrapers do not resolve relative URLs.
 */
export function absoluteUrl(pathOrUrl: string, site: URL | string | undefined): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl, requireSite(site)).href;
}

/** The slice of a populated media doc the OG image resolution reads. */
interface SeoMediaLike {
  url?: string | null | undefined;
  blurhash?: string | null | undefined;
  alt?: string | null | undefined;
}

/** The per-doc SEO surface of a CMS `pages` entry (A3 override fields). */
export interface CmsPageSeoSource {
  seoDescription?: string | null | undefined;
  ogImage?: SeoMediaLike | null | undefined;
  header?: { image?: SeoMediaLike | null | undefined } | null | undefined;
}

/**
 * The SEO props every CMS-page-backed route derives the same way:
 * description = CMS override ?? the route's fallback; OG image = dedicated
 * ogImage ?? header image. Routes with richer sources (news posts, teams)
 * compose the pieces themselves.
 */
export function pageSeo(
  page: CmsPageSeoSource | null,
  cmsBase: string | undefined,
  fallbackDescription: string,
): { description: string; image: string | null } {
  return {
    description: metaDescription(page?.seoDescription, fallbackDescription),
    image: toSiteImage(page?.ogImage ?? page?.header?.image, cmsBase)?.url ?? null,
  };
}
