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
 * The own-club team api id behind a single-team filter selection, for the
 * per-team ICS feed. Anything but exactly one known team resolves to null —
 * the feed then covers the whole club.
 */
export function selectedTeamApiId(
  games: readonly TeamIdMatch[],
  selected: readonly string[] | undefined,
): number | null {
  if (!selected || selected.length !== 1) return null;
  const match = games.find((game) => getOwnTeamLabel(game) === selected[0]);
  if (!match) return null;
  return match.homeIsOwnClub ? match.homeTeamApiId : match.guestTeamApiId;
}
