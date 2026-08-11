/**
 * Static helpers for the team detail page (`/teams/[slug]`), ported from
 * dragons-app `app/components/teams/TeamTrainer.vue`: the legacy overlay
 * showed `trainer.ehrenamtliche.name` with the `trainer.image ||
 * ehrenamtliche.image` portrait. The new CMS models that as `teams.trainers`
 * (hasMany) → trainer → person; the page renders the first trainer.
 */

import { mediaUrl, type SiteImage } from "./media";

interface MediaLike {
  url?: string | null | undefined;
  blurhash?: string | null | undefined;
  alt?: string | null | undefined;
}

/**
 * A populated CMS media doc as a renderable {@link SiteImage}, its URL
 * resolved against the CMS base (src/lib/media.ts rules). Null when the
 * relation is empty or the upload has no URL — callers fall back to the club
 * banner, like the legacy UiBannerImage.
 */
export function toSiteImage(
  media: MediaLike | null | undefined,
  base: string | undefined,
): SiteImage | null {
  const url = mediaUrl(media?.url, base);
  if (url === null) return null;
  return { url, blurhash: media?.blurhash, alt: media?.alt };
}

export interface TrainerLike {
  person?: { name: string; image?: MediaLike | null | undefined } | null | undefined;
  image?: MediaLike | null | undefined;
}

export interface TrainerDisplay {
  name: string;
  image: MediaLike | null;
}

/**
 * The trainer the detail page shows, or null when the team has none (the
 * overlay then falls back to the plain "Trainer" title, legacy behavior).
 * A trainer whose person relation is unpopulated counts as none — there is
 * no name to show.
 */
export function primaryTrainer(
  trainers: readonly TrainerLike[] | null | undefined,
): TrainerDisplay | null {
  const first = trainers?.[0];
  if (first?.person == null) return null;
  return {
    name: first.person.name,
    image: first.image ?? first.person.image ?? null,
  };
}
