/**
 * Adapts a populated CMS media doc to the {@link SiteImage} shape PageHeader
 * and friends consume, resolving relative media URLs against the CMS base.
 */
import type { SiteImage } from "./media";
import { mediaUrl } from "./media";

interface MediaLike {
  url?: string | null | undefined;
  blurhash?: string | null | undefined;
  alt?: string | null | undefined;
}

export function toSiteImage(
  media: MediaLike | null | undefined,
  base: string | undefined,
): SiteImage | null {
  const url = mediaUrl(media?.url, base);
  if (url == null) return null;
  return { url, blurhash: media?.blurhash, alt: media?.alt };
}
