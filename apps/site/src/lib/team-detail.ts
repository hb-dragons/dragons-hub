/**
 * Static helpers for the team detail page (`/teams/[slug]`), ported from
 * dragons-app `app/components/teams/TeamTrainer.vue`: the legacy overlay showed
 * the trainer's name over their portrait.
 *
 * The coach now comes from the Hub rather than the CMS (ADR 0008): the page
 * looks the team's staff up by federation permanent id (src/lib/team-staff.ts)
 * and this shapes the head coach into what the hero renders. The portrait is a
 * plain API URL, so it carries no blurhash — BlurImage falls back to a solid
 * placeholder, the same as for any CMS upload without one.
 */

import { mediaUrl, type SiteImage } from "./media";
import { headCoach, type SiteStaffMember } from "./team-staff";

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

export interface TrainerDisplay {
  name: string;
  image: SiteImage | null;
}

/**
 * The coach the detail page's hero shows, or null when the team has none (the
 * overlay then falls back to the plain "Trainer" title, legacy behavior). A
 * coach without a portrait keeps the name and falls back to the club banner.
 */
export function primaryTrainer(
  staff: readonly SiteStaffMember[] | null | undefined,
): TrainerDisplay | null {
  const coach = headCoach(staff ?? []);
  if (coach === null) return null;
  return {
    name: coach.name,
    image: coach.photoUrl === null ? null : { url: coach.photoUrl, alt: coach.name },
  };
}
