import { getRefereeGames } from "./referee-games.service";
import { searchCandidates } from "./referee-assignment.service";
import { isRefereeEligibleForGame } from "./referee-slot-resolver";
import type { EligibleOpenGamesResponse, RefereeGameListItem } from "@dragons/shared";

/**
 * Returns open games this referee is eligible to take (matching the candidate-picker
 * eligibility rules: qualification + mode + no blocktermin + no time-window conflict).
 *
 * For each game, queries the federation candidate list for the open slot, finds the
 * referee, and applies the same `isRefereeEligibleForGame` check used by the picker.
 */
export async function getEligibleOpenGames(
  refereeApiId: number,
): Promise<EligibleOpenGamesResponse> {
  const openGames = await getRefereeGames({
    limit: 500,
    offset: 0,
    status: "active",
  });

  const gamesWithOpenSlot = openGames.items.filter(
    (g) =>
      (g.sr1Status === "open" && g.sr1RefereeApiId == null) ||
      (g.sr2Status === "open" && g.sr2RefereeApiId == null),
  );

  const results: RefereeGameListItem[] = [];

  for (const game of gamesWithOpenSlot) {
    const openSlot: 1 | 2 =
      game.sr1Status === "open" && game.sr1RefereeApiId == null ? 1 : 2;
    const candidateList = await searchCandidates(game.apiMatchId, "", 0, 100, openSlot);
    const meta = candidateList.results.find((c) => c.srId === refereeApiId);
    if (meta && isRefereeEligibleForGame(meta, openSlot)) {
      results.push(game);
    }
  }

  return { items: results };
}
