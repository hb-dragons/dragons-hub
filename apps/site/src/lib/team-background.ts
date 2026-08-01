import { z } from "astro/zod";

import type { SiteImage } from "./media";

/**
 * Fetches the `team-background` global (the halftone gym photo behind the
 * teams-index rows). Read access is `anyone` CMS-side, so no API key is
 * needed; the caller gates the call on a content build (`cmsBaseUrl()`
 * present — src/lib/media.ts), and once it runs any failure throws and fails
 * the build loudly, per the loaders' failure model (src/lib/payload.ts).
 */

const teamBackgroundSchema = z.object({
  image: z
    .object({
      url: z.string().nullish(),
      blurhash: z.string().nullish(),
      alt: z.string().nullish(),
    })
    .nullish(),
});

export async function fetchTeamBackground(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SiteImage | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/globals/team-background?depth=1`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`team-background: HTTP ${res.status} for ${url}`);
  const parsed = teamBackgroundSchema.parse(await res.json());
  const image = parsed.image;
  if (image?.url == null) return null;
  return { url: image.url, blurhash: image.blurhash, alt: image.alt };
}
