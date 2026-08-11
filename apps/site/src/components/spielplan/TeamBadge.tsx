import { cn } from "@dragons/ui/lib/utils";
import { teamBadgeClassName } from "./team-badge-classes";

/**
 * Faithful port of dragons-app `app/components/spielplan/TeamBadge.vue`
 * (SpielplanTeamBadge): same markup and structural classes, same link
 * semantics (dragons teams go to their team page, opponents to
 * Probetraining). The legacy hardcoded per-team-name color literals are
 * replaced by the shared color presets — the team's `badgeColor` key from the
 * API, with the shared name-hash fallback — per plan Task C5.
 */

export interface TeamBadgeProps {
  /** Display name inside the badge — "Herren 1" or an opponent's club name. */
  teamName: string;
  /**
   * Whether the name is one of our own teams. Own teams link to
   * `/teams/<slug>/`; everything else links to `/probetraining/`
   * (legacy behavior). Defaults to false.
   */
  isDragonsTeam?: boolean;
  /**
   * The team's color preset key (`homeBadgeColor`/`guestBadgeColor` from the
   * public API). Omitting it falls back to a hash of `teamName`, so a team
   * with a configured color renders differently on surfaces that forget it.
   */
  badgeColor?: string | null;
  /** Render a plain badge without the surrounding link. */
  disableLink?: boolean;
  className?: string;
}

/** Legacy slug rule: lowercase, first space to a hyphen ("Damen 1" → "damen-1"). */
export function teamSlug(teamName: string): string {
  return teamName.toLowerCase().replace(" ", "-");
}

export function TeamBadge({
  teamName,
  isDragonsTeam = false,
  badgeColor = null,
  disableLink = false,
  className,
}: TeamBadgeProps) {
  const badge = (
    <span
      className={cn(
        "rounded-md px-1 border text-center flex items-center justify-center font-bold",
        teamBadgeClassName(badgeColor, teamName),
        className,
      )}
    >
      {teamName}
    </span>
  );

  if (disableLink) return badge;

  return (
    <a
      href={isDragonsTeam ? `/teams/${teamSlug(teamName)}/` : "/probetraining/"}
      aria-label={`${teamName} Team`}
    >
      {badge}
    </a>
  );
}
