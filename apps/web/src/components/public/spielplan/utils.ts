import type { MatchListItem } from "@dragons/shared";
import { cn } from "@dragons/ui/lib/utils";
import { getOwnTeamLabel } from "@/components/admin/matches/utils";

type RowClassMatch = Pick<
  MatchListItem,
  "homeIsOwnClub" | "isCancelled" | "isForfeited" | "publicComment"
>;

export function spielplanRowClass(match: RowClassMatch): string {
  return cn(
    match.homeIsOwnClub && "border-l-2 border-l-primary/50 bg-primary/5",
    match.publicComment?.includes("verlegt") && "text-muted-foreground",
    match.isCancelled && "line-through text-muted-foreground opacity-60",
    match.isForfeited && "line-through text-muted-foreground opacity-40",
  );
}

type TeamIdMatch = Pick<
  MatchListItem,
  | "homeIsOwnClub"
  | "homeTeamApiId"
  | "guestTeamApiId"
  | "homeTeamName"
  | "homeTeamNameShort"
  | "homeTeamCustomName"
  | "guestTeamName"
  | "guestTeamNameShort"
  | "guestTeamCustomName"
>;

/**
 * The squad ids (`apiTeamPermanentId`) behind the team filter selection, for
 * the squad-filtered ICS feed, in selection order with each squad once.
 * Labels that match no game in the schedule are dropped; an empty result
 * means the feed covers the whole club.
 */
export function selectedTeamApiIds(
  games: readonly TeamIdMatch[],
  selected: readonly string[] | undefined,
): number[] {
  if (!selected || selected.length === 0) return [];
  const ids: number[] = [];
  for (const label of selected) {
    const match = games.find((game) => getOwnTeamLabel(game) === label);
    if (!match) continue;
    const id = match.homeIsOwnClub ? match.homeTeamApiId : match.guestTeamApiId;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
