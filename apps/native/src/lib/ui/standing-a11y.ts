import type { StandingItem } from "@dragons/shared";
import type { Translate } from "@/lib/ui/match-a11y";

/**
 * The sentence a standings row reads to VoiceOver/TalkBack. Left to the
 * platform, the row's cells read as "1, Dragons, 10, 8, 2, +54, 16" — the
 * column headers that give those numbers their meaning sit in another row.
 */
export function standingA11yLabel(
  item: Pick<
    StandingItem,
    "position" | "played" | "won" | "lost" | "pointsDiff" | "leaguePoints" | "verzicht"
  >,
  team: string,
  t: Translate,
): string {
  const row = t("a11y.standing.row", {
    position: item.position,
    team,
    played: item.played,
    won: item.won,
    lost: item.lost,
    diff: item.pointsDiff > 0 ? `+${String(item.pointsDiff)}` : String(item.pointsDiff),
    points: item.leaguePoints,
  });
  return item.verzicht ? `${row}, ${t("a11y.standing.withdrawn")}` : row;
}
