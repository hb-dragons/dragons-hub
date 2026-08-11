import pLimit from "p-limit";
import { eq } from "drizzle-orm";
import { getDb } from "../../config/database";
import { referees } from "@dragons/db/schema";
import { getRefereeGames } from "./referee-games.service";
import { searchCandidates } from "./referee-assignment.service";
import { isRefereeEligibleForGame } from "./referee-slot-resolver";
import { RefereeSettingsError } from "../admin/referee-admin.errors";
import type { EligibleOpenGamesResponse, RefereeGameListItem } from "@dragons/shared";

/**
 * Returns open games this referee is eligible to take (matching the candidate-picker
 * eligibility rules: qualification + mode + no blocktermin + no time-window conflict).
 *
 * For each game, queries the federation candidate list for the open slot, finds the
 * referee, and applies the same `isRefereeEligibleForGame` check used by the picker.
 *
 * Candidates are evaluated with bounded concurrency (CONCURRENCY=5) to avoid
 * hammering the federation API while still parallelising what was an N+1 sequential loop.
 * Promise.all preserves insertion order, so output order matches input order.
 */

const CONCURRENCY = 5;

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

  const limit = pLimit(CONCURRENCY);
  const evaluated = await Promise.all(
    gamesWithOpenSlot.map((game) =>
      limit(async (): Promise<RefereeGameListItem | null> => {
        const openSlot: 1 | 2 =
          game.sr1Status === "open" && game.sr1RefereeApiId == null ? 1 : 2;
        const candidateList = await searchCandidates(game.apiMatchId, "", 0, 100, openSlot);
        const meta = candidateList.results.find((c) => c.srId === refereeApiId);
        if (meta && isRefereeEligibleForGame(meta, openSlot)) return game;
        return null;
      }),
    ),
  );

  return { items: evaluated.filter((g): g is RefereeGameListItem => g !== null) };
}

/**
 * Route-facing entry point: resolves the internal referee id to the federation
 * `apiId` `getEligibleOpenGames` needs, throwing `RefereeSettingsError`
 * `NOT_FOUND` for an unknown referee.
 *
 * `getEligibleOpenGames` itself stays unrestricted and keyed on `apiId` —
 * callers that already hold one (e.g. a future federation-facing caller with
 * no local referee row to resolve) still call it directly. Reusing
 * `RefereeSettingsError` rather than adding a class here avoids a second
 * one-entry status table for the same code (see `referee-admin.errors.ts`).
 */
export async function getEligibleOpenGamesForReferee(
  id: number,
): Promise<EligibleOpenGamesResponse> {
  const [row] = await getDb()
    .select({ apiId: referees.apiId })
    .from(referees)
    .where(eq(referees.id, id))
    .limit(1);

  if (!row) {
    throw new RefereeSettingsError("Referee not found", "NOT_FOUND");
  }
  return getEligibleOpenGames(row.apiId);
}
