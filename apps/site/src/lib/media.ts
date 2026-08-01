/**
 * Populated media shape the site renders (subset of the CMS media doc).
 * Consumed from .astro frontmatter (PageHeader), which knip's ignore list
 * hides from the reference graph.
 * @public
 */
export interface SiteImage {
  url: string;
  blurhash?: string | null | undefined;
  alt?: string | null | undefined;
}

/**
 * CMS base URL for resolving relative media paths at build time. Blank counts
 * as unset — the same rule as the loaders' readEnv (src/lib/payload.ts).
 */
export function cmsBaseUrl(): string | undefined {
  const value = (import.meta.env?.CMS_URL as string | undefined) ?? process.env.CMS_URL;
  return value == null || value === "" ? undefined : value;
}

/**
 * Resolves a Payload media `url` to something the browser can fetch.
 *
 * Local/dev CMS serves uploads under its own origin (`/api/media/file/…`),
 * so relative URLs are prefixed with CMS_URL at build time; GCS-hosted prod
 * media arrives absolute and passes through untouched.
 */
export function mediaUrl(
  url: string | null | undefined,
  base: string | undefined,
): string | null {
  if (url == null) return null;
  if (/^https?:\/\//.test(url) || base === undefined) return url;
  return `${base.replace(/\/$/, "")}${url}`;
}
