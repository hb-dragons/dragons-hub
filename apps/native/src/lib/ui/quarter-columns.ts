import type { PublicMatchDetail } from "@dragons/shared";
import type { Translate } from "@/lib/ui/match-a11y";

export type QuarterScores = Pick<
  PublicMatchDetail,
  | "homeQ1" | "guestQ1" | "homeQ2" | "guestQ2"
  | "homeQ3" | "guestQ3" | "homeQ4" | "guestQ4"
  | "homeQ5" | "guestQ5" | "homeQ6" | "guestQ6"
  | "homeQ7" | "guestQ7" | "homeQ8" | "guestQ8"
  | "homeOt1" | "guestOt1" | "homeOt2" | "guestOt2"
  | "homeHalftimeScore" | "guestHalftimeScore"
  | "homeScore" | "guestScore"
>;

export interface QuarterColumn {
  label: string;
  homeValue: number | null;
  guestValue: number | null;
}

/** Whether the game has period scores at all; the table is hidden otherwise. */
export function hasQuarterData(match: QuarterScores): boolean {
  return (
    match.homeQ1 !== null ||
    match.guestQ1 !== null ||
    match.homeQ2 !== null ||
    match.guestQ2 !== null
  );
}

/**
 * The periods of a game in table order: four quarters (eight for a game played
 * in eighths), any overtime, then halftime and total when known.
 */
export function quarterColumns(match: QuarterScores, t: Translate): QuarterColumn[] {
  const columns: QuarterColumn[] = [];

  const isAchtel =
    match.homeQ5 !== null ||
    match.homeQ6 !== null ||
    match.homeQ7 !== null ||
    match.homeQ8 !== null;

  const quarterCount = isAchtel ? 8 : 4;
  const homeQuarters = [
    match.homeQ1, match.homeQ2, match.homeQ3, match.homeQ4,
    match.homeQ5, match.homeQ6, match.homeQ7, match.homeQ8,
  ];
  const guestQuarters = [
    match.guestQ1, match.guestQ2, match.guestQ3, match.guestQ4,
    match.guestQ5, match.guestQ6, match.guestQ7, match.guestQ8,
  ];

  for (let i = 0; i < quarterCount; i++) {
    columns.push({
      label: `Q${i + 1}`,
      homeValue: homeQuarters[i] ?? null,
      guestValue: guestQuarters[i] ?? null,
    });
  }

  if (match.homeOt1 !== null || match.guestOt1 !== null) {
    columns.push({ label: "OT1", homeValue: match.homeOt1, guestValue: match.guestOt1 });
  }
  if (match.homeOt2 !== null || match.guestOt2 !== null) {
    columns.push({ label: "OT2", homeValue: match.homeOt2, guestValue: match.guestOt2 });
  }

  if (match.homeHalftimeScore !== null || match.guestHalftimeScore !== null) {
    columns.push({
      label: t("gameDetail.halftime"),
      homeValue: match.homeHalftimeScore,
      guestValue: match.guestHalftimeScore,
    });
  }

  if (match.homeScore !== null || match.guestScore !== null) {
    columns.push({
      label: t("gameDetail.total"),
      homeValue: match.homeScore,
      guestValue: match.guestScore,
    });
  }

  return columns;
}
