/**
 * What a match card shows, worked out once from a `MatchListItem`.
 *
 * The cards read a game from the club's side — own squad, opponent, own score
 * first — while the API describes it as home and guest. The Spielplan card
 * takes that flip and the win/loss rule from here, where both are tested; the
 * older cards still work it out inline.
 */
import type { MatchListItem } from "@dragons/shared";

/** What the corner of a card says about the game. */
type MatchOutcome = "win" | "loss" | "cancelled" | "forfeited" | "upcoming";

export interface MatchCardModel {
  /** True when the club's squad plays at home. */
  isHome: boolean;
  /** The side that is ours, or null for a game between two other clubs. */
  ownSide: "home" | "guest" | null;
  /** Display name of the club's squad: custom name, short name, federation name. */
  ownName: string;
  /** Federation name and badge colour of that squad, the inputs to its team colour. */
  ownRawName: string;
  ownBadgeColor: string | null;
  /** The opponent's full federation name — never the cryptic short code. */
  opponentName: string;
  opponentClubId: number;
  /** Names in home/guest order, for the spoken label. */
  homeName: string;
  guestName: string;
  hasScore: boolean;
  ownScore: number | null;
  opponentScore: number | null;
  outcome: MatchOutcome;
}

function displayName(custom: string | null, short: string | null, name: string): string {
  return custom || short || name;
}

export function matchCardModel(match: MatchListItem): MatchCardModel {
  // A game where neither side is flagged is read from the home side, the way
  // the list has always drawn it; a derby between two own squads likewise.
  const isHome = match.homeIsOwnClub || !match.guestIsOwnClub;
  const ownSide = match.homeIsOwnClub ? "home" : match.guestIsOwnClub ? "guest" : null;

  const ownName = isHome
    ? displayName(match.homeTeamCustomName, match.homeTeamNameShort, match.homeTeamName)
    : displayName(match.guestTeamCustomName, match.guestTeamNameShort, match.guestTeamName);
  const opponentName = isHome ? match.guestTeamName : match.homeTeamName;

  const hasScore = match.homeScore !== null && match.guestScore !== null;
  const ownScore = isHome ? match.homeScore : match.guestScore;
  const opponentScore = isHome ? match.guestScore : match.homeScore;

  let outcome: MatchOutcome = "upcoming";
  if (match.isCancelled) outcome = "cancelled";
  else if (match.isForfeited) outcome = "forfeited";
  else if (hasScore) outcome = ownScore! > opponentScore! ? "win" : "loss";

  return {
    isHome,
    ownSide,
    ownName,
    ownRawName: isHome ? match.homeTeamName : match.guestTeamName,
    ownBadgeColor: isHome ? match.homeBadgeColor : match.guestBadgeColor,
    opponentName,
    opponentClubId: isHome ? match.guestClubId : match.homeClubId,
    homeName: isHome ? ownName : opponentName,
    guestName: isHome ? opponentName : ownName,
    hasScore,
    ownScore,
    opponentScore,
    outcome,
  };
}

/** `"81:74"`, own score first; null while the game has no result. */
export function scoreLine(model: Pick<MatchCardModel, "hasScore" | "ownScore" | "opponentScore">): string | null {
  if (!model.hasScore) return null;
  return `${String(model.ownScore)}:${String(model.opponentScore)}`;
}

export type LocationFilter = "all" | "home" | "away";

/** The Spielplan's Alle / Heim / Auswärts choice. */
export function filterByLocation(matches: MatchListItem[], filter: LocationFilter): MatchListItem[] {
  if (filter === "home") return matches.filter((m) => m.homeIsOwnClub);
  if (filter === "away") return matches.filter((m) => m.guestIsOwnClub);
  return matches;
}
