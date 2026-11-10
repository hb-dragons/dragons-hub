import type { StandingItem } from "@dragons/shared";
import type { Translate } from "@/lib/ui/match-a11y";

export type StandingStatKey = "played" | "won" | "lost" | "diff" | "points";

export interface StandingStatCell {
  key: StandingStatKey;
  /** The column heading, short form ("Sp", "GP"). */
  label: string;
  value: string;
}

/** A point difference with an explicit plus sign; zero and negatives as-is. */
export function formatPointsDiff(diff: number): string {
  return diff > 0 ? `+${String(diff)}` : String(diff);
}

const HEADING_KEYS: Record<StandingStatKey, string> = {
  played: "standings.played",
  won: "standings.won",
  lost: "standings.lost",
  diff: "standings.diff",
  points: "standings.points",
};

const STAT_ORDER: readonly StandingStatKey[] = ["played", "won", "lost", "diff", "points"];

/** The numeric column headings of the standings table, in table order. */
export function standingStatHeadings(t: Translate): { key: StandingStatKey; label: string }[] {
  return STAT_ORDER.map((key) => ({ key, label: t(HEADING_KEYS[key]) }));
}

/**
 * The numeric columns of a standings row, in table order, each with its
 * heading. The column layout puts the headings in a header row; the stacked
 * layout (large text sizes) prints each heading next to its value, since
 * there is no header row to read them from.
 */
export function standingStatCells(
  item: Pick<StandingItem, "played" | "won" | "lost" | "pointsDiff" | "leaguePoints">,
  t: Translate,
): StandingStatCell[] {
  const values: Record<StandingStatKey, string> = {
    played: String(item.played),
    won: String(item.won),
    lost: String(item.lost),
    diff: formatPointsDiff(item.pointsDiff),
    points: String(item.leaguePoints),
  };
  return standingStatHeadings(t).map((heading) => ({ ...heading, value: values[heading.key] }));
}
