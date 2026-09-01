import type { MatchListItem } from "@dragons/shared";
import { TeamBadge } from "../spielplan/TeamBadge";
import { ClubLogo } from "./ClubLogo";

/**
 * One team side of a games-table row, styled after the native app's
 * MatchCardCompact: our own teams show as their colored badge (or the
 * highlighted "Dragons" label on a team's own page, where the team is
 * implied), opponents as a small club crest plus their muted federation
 * name. A derby renders a badge on both sides and no crest.
 */

/** The slice of `MatchListItem` a cell renders. */
export type TeamCellGame = Pick<
  MatchListItem,
  | "homeTeamName"
  | "guestTeamName"
  | "homeTeamCustomName"
  | "guestTeamCustomName"
  | "homeIsOwnClub"
  | "guestIsOwnClub"
  | "homeClubId"
  | "guestClubId"
  | "homeBadgeColor"
  | "guestBadgeColor"
>;

export function TeamCell({
  game,
  side,
  ownAs = "badge",
}: {
  game: TeamCellGame;
  side: "home" | "guest";
  /** How to render our own side: the team's color badge (Spielplan), or the
   *  plain highlighted "Dragons" label (team detail, where the team is the
   *  page itself). */
  ownAs?: "badge" | "label";
}) {
  const isHome = side === "home";
  const isOwn = isHome ? game.homeIsOwnClub : game.guestIsOwnClub;
  const federationName = (isHome ? game.homeTeamName : game.guestTeamName) || "-";

  if (isOwn) {
    if (ownAs === "label") {
      return <span className="font-semibold text-primary">Dragons</span>;
    }
    const customName = isHome ? game.homeTeamCustomName : game.guestTeamCustomName;
    const badgeColor = isHome ? game.homeBadgeColor : game.guestBadgeColor;
    return (
      <TeamBadge
        teamName={customName ?? federationName}
        isDragonsTeam
        badgeColor={badgeColor}
        className="w-fit"
      />
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <ClubLogo
        clubId={isHome ? game.homeClubId : game.guestClubId}
        isOwnClub={false}
        alt={federationName}
        className="size-5 shrink-0 object-contain"
        fallbackClassName="text-sm shrink-0"
      />
      <span className="text-muted-foreground">{federationName}</span>
    </span>
  );
}
