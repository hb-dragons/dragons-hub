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
