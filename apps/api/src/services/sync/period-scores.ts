import type { SdkGetGameResponse } from "@dragons/sdk";

export interface PeriodScores {
  periodFormat: "quarters" | null;
  homeQ1: number | null;
  guestQ1: number | null;
  homeQ2: number | null;
  guestQ2: number | null;
  homeQ3: number | null;
  guestQ3: number | null;
  homeQ4: number | null;
  guestQ4: number | null;
}

export interface OvertimeDeltas {
  homeOt1: number | null;
  guestOt1: number | null;
  homeOt2: number | null;
  guestOt2: number | null;
}

export function validScoreOrNull(score: number | undefined): number | null {
  if (score === undefined || score < 0) return null;
  return score;
}

function delta(
  cumLater: number | null,
  cumEarlier: number | null,
): number | null {
  if (cumLater == null || cumEarlier == null) return null;
  return cumLater - cumEarlier;
}

export function extractPeriodScores(
  game: SdkGetGameResponse["game1"] | undefined,
): PeriodScores {
  const nullScores: PeriodScores = {
    periodFormat: null,
    homeQ1: null,
    guestQ1: null,
    homeQ2: null,
    guestQ2: null,
    homeQ3: null,
    guestQ3: null,
    homeQ4: null,
    guestQ4: null,
  };

  if (!game) return nullScores;

  const hasV5to8 =
    game.heimV5stand !== undefined ||
    game.heimV6stand !== undefined ||
    game.heimV7stand !== undefined ||
    game.heimV8stand !== undefined;

  if (hasV5to8) return nullScores;

  const hasOvertime = game.heimOt1stand >= 0 || game.gastOt1stand >= 0;

  const cumH1 = validScoreOrNull(game.heimV1stand);
  const cumG1 = validScoreOrNull(game.gastV1stand);
  const cumH2 =
    validScoreOrNull(game.heimV2stand) ?? validScoreOrNull(game.heimHalbzeitstand);
  const cumG2 =
    validScoreOrNull(game.gastV2stand) ?? validScoreOrNull(game.gastHalbzeitstand);
  const cumH3 = validScoreOrNull(game.heimV3stand);
  const cumG3 = validScoreOrNull(game.gastV3stand);
  const cumH4 =
    validScoreOrNull(game.heimV4stand) ??
    (hasOvertime ? null : validScoreOrNull(game.heimEndstand));
  const cumG4 =
    validScoreOrNull(game.gastV4stand) ??
    (hasOvertime ? null : validScoreOrNull(game.gastEndstand));

  const hasAnyData =
    cumH1 != null ||
    cumG1 != null ||
    cumH2 != null ||
    cumG2 != null ||
    cumH3 != null ||
    cumG3 != null ||
    cumH4 != null ||
    cumG4 != null;

  return {
    periodFormat: hasAnyData ? "quarters" : null,
    homeQ1: cumH1,
    guestQ1: cumG1,
    homeQ2: delta(cumH2, cumH1),
    guestQ2: delta(cumG2, cumG1),
    homeQ3: delta(cumH3, cumH2),
    guestQ3: delta(cumG3, cumG2),
    homeQ4: delta(cumH4, cumH3),
    guestQ4: delta(cumG4, cumG3),
  };
}

export function extractOvertimeDeltas(
  game: SdkGetGameResponse["game1"] | undefined,
  periodScores: PeriodScores,
): OvertimeDeltas {
  const nullOt: OvertimeDeltas = {
    homeOt1: null,
    guestOt1: null,
    homeOt2: null,
    guestOt2: null,
  };

  if (!game) return nullOt;

  const cumOt1Home = game.heimOt1stand >= 0 ? game.heimOt1stand : null;
  const cumOt1Guest = game.gastOt1stand >= 0 ? game.gastOt1stand : null;
  const cumOt2Home = game.heimOt2stand >= 0 ? game.heimOt2stand : null;
  const cumOt2Guest = game.gastOt2stand >= 0 ? game.gastOt2stand : null;

  if (cumOt1Home == null && cumOt1Guest == null) return nullOt;

  const homePeriods = [
    periodScores.homeQ1,
    periodScores.homeQ2,
    periodScores.homeQ3,
    periodScores.homeQ4,
  ];
  const guestPeriods = [
    periodScores.guestQ1,
    periodScores.guestQ2,
    periodScores.guestQ3,
    periodScores.guestQ4,
  ];

  const sumOrNull = (values: (number | null)[]): number | null => {
    if (values.some((v) => v == null)) return null;
    return values.reduce<number>((s, v) => s + v!, 0);
  };

  const regEndHome = sumOrNull(homePeriods);
  const regEndGuest = sumOrNull(guestPeriods);

  return {
    homeOt1: delta(cumOt1Home, regEndHome),
    guestOt1: delta(cumOt1Guest, regEndGuest),
    homeOt2: delta(cumOt2Home, cumOt1Home),
    guestOt2: delta(cumOt2Guest, cumOt1Guest),
  };
}
