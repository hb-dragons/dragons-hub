import { getDb } from "../../config/database";
import {
  refereeGames,
  referees,
  matches,
  teams,
  refereeAssignmentRules,
  refereeAssignmentIntents,
} from "@dragons/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { sdkClient } from "../sync/sdk-client";
import { publishDomainEvent } from "../events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";
import type {
  AssignRefereeResponse,
  UnassignRefereeResponse,
  CandidateSearchResponse,
} from "@dragons/shared";
import { isRefereeEligibleForGame, type EligibilitySlot } from "./referee-slot-resolver";

export class AssignmentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AssignmentError";
  }
}

const FEDERATION_SUCCESS = "Änderungen erfolgreich übernommen";

export async function assignReferee(
  spielplanId: number,
  slotNumber: 1 | 2,
  refereeApiId: number,
): Promise<AssignRefereeResponse> {
  // 1. Look up game
  const games = await getDb()
    .select()
    .from(refereeGames)
    .where(eq(refereeGames.apiMatchId, spielplanId))
    .limit(1);

  const game = games[0];
  if (!game) {
    throw new AssignmentError(
      `Game with spielplanId=${spielplanId} not found`,
      "GAME_NOT_FOUND",
    );
  }

  // 2. Look up referee
  const refereeRows = await getDb()
    .select()
    .from(referees)
    .where(eq(referees.apiId, refereeApiId))
    .limit(1);

  const referee = refereeRows[0];
  if (!referee) {
    throw new AssignmentError(
      `Referee with apiId=${refereeApiId} not found in local database`,
      "NOT_QUALIFIED",
    );
  }

  // 3. Deny check (only when game has a linked match)
  if (game.matchId != null) {
    const matchRows = await getDb()
      .select()
      .from(matches)
      .where(eq(matches.id, game.matchId))
      .limit(1);

    const match = matchRows[0];
    if (match) {
      const teamRows = await getDb()
        .select()
        .from(teams)
        .where(inArray(teams.apiTeamPermanentId, [match.homeTeamApiId, match.guestTeamApiId]))
        .limit(2);

      const teamIds = teamRows.map((t) => t.id);

      if (teamIds.length > 0) {
        const denyRules = await getDb()
          .select()
          .from(refereeAssignmentRules)
          .where(
            and(
              eq(refereeAssignmentRules.refereeId, referee.id),
              inArray(refereeAssignmentRules.teamId, teamIds),
              eq(refereeAssignmentRules.deny, true),
            ),
          )
          .limit(1);

        if (denyRules.length > 0) {
          throw new AssignmentError(
            `Referee ${refereeApiId} has a deny rule for one of the teams in this game`,
            "DENY_RULE",
          );
        }
      }
    }
  }

  // 4. Find candidate in federation getRefs. Results are distance-sorted and
  // paginated, so a single 200-row window can exclude a genuinely-qualified
  // far-ranked referee. Page through (offset by rows returned) until the
  // referee is found or the federation's reported total is exhausted.
  const REFS_PAGE_SIZE = 200;
  let candidate: Awaited<ReturnType<typeof sdkClient.searchRefereesForGame>>["results"][number] | undefined;
  let pageFrom = 0;
  let total = Infinity;
  while (pageFrom < total) {
    const refsResponse = await sdkClient.searchRefereesForGame(spielplanId, {
      pageFrom,
      pageSize: REFS_PAGE_SIZE,
    });
    total = refsResponse.total;
    candidate = refsResponse.results.find((sr) => sr.srId === refereeApiId);
    if (candidate) break;
    if (refsResponse.results.length === 0) break;
    pageFrom += refsResponse.results.length;
  }
  if (!candidate) {
    throw new AssignmentError(
      `Referee ${refereeApiId} is not qualified or available for game ${spielplanId}`,
      "NOT_QUALIFIED",
    );
  }

  // 5. Build referee name + the slot update
  const refereeName = `${candidate.vorname} ${candidate.nachName}`;
  const slotKey = slotNumber === 1 ? "sr1" : "sr2";

  const slotUpdate =
    slotNumber === 1
      ? { sr1Name: refereeName, sr1RefereeApiId: refereeApiId, sr1Status: "assigned" }
      : { sr2Name: refereeName, sr2RefereeApiId: refereeApiId, sr2Status: "assigned" };

  // 6. Win the slot locally BEFORE submitting to the federation. The federation
  // has no compare-and-set (submitRefereeAssignment is an unconditional set), so
  // if we submitted first two concurrent callers could both write the federation
  // (last-writer-wins divergence). Gating on the atomic conditional UPDATE
  // (status still "open", 0 affected rows = a rival got there first) means only
  // the single caller that wins this guard goes on to submit to the federation.
  const slotStatusColumn =
    slotNumber === 1 ? refereeGames.sr1Status : refereeGames.sr2Status;
  const claimed = await getDb()
    .update(refereeGames)
    .set(slotUpdate)
    .where(
      and(
        eq(refereeGames.apiMatchId, spielplanId),
        eq(slotStatusColumn, "open"),
      ),
    )
    .returning({ id: refereeGames.id });

  if (claimed.length === 0) {
    // 0 rows means the slot was not "open". Re-read the current holder: if it's
    // already this same referee (a re-submit or double-click; the federation
    // already has them), treat it as an idempotent success instead of a spurious
    // SLOT_TAKEN. Only a rival holder is a genuine conflict.
    const currentRows = await getDb()
      .select()
      .from(refereeGames)
      .where(eq(refereeGames.apiMatchId, spielplanId))
      .limit(1);
    const currentApiId =
      slotNumber === 1
        ? currentRows[0]?.sr1RefereeApiId
        : currentRows[0]?.sr2RefereeApiId;

    if (currentApiId !== refereeApiId) {
      throw new AssignmentError(
        `Slot ${slotNumber} for game ${spielplanId} was already taken`,
        "SLOT_TAKEN",
      );
    }

    return {
      success: true,
      slot: slotKey,
      status: "assigned",
      refereeName,
    };
  }

  // 7. Submit to the federation now that we hold the local claim. If the
  // federation rejects (or the call throws), roll the slot back to open so we
  // don't leave a local "assigned" the federation never accepted.
  const rollbackClaim = async () => {
    const slotClear =
      slotNumber === 1
        ? { sr1Name: null, sr1RefereeApiId: null, sr1Status: "open" }
        : { sr2Name: null, sr2RefereeApiId: null, sr2Status: "open" };
    await getDb()
      .update(refereeGames)
      .set(slotClear)
      .where(eq(refereeGames.apiMatchId, spielplanId));
  };

  let submitResponse: Awaited<
    ReturnType<typeof sdkClient.submitRefereeAssignment>
  >;
  try {
    submitResponse = await sdkClient.submitRefereeAssignment(
      spielplanId,
      slotNumber,
      candidate,
    );
  } catch (err) {
    await rollbackClaim();
    throw err;
  }

  if (!submitResponse.gameInfoMessages.includes(FEDERATION_SUCCESS)) {
    await rollbackClaim();
    throw new AssignmentError(
      `Federation rejected assignment: ${submitResponse.gameInfoMessages.join(", ")}`,
      "FEDERATION_ERROR",
    );
  }

  // 8. Upsert intent (only when game has a linked match)
  if (game.matchId != null) {
    await getDb()
      .insert(refereeAssignmentIntents)
      .values({
        matchId: game.matchId,
        refereeId: referee.id,
        slotNumber,
        clickedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          refereeAssignmentIntents.matchId,
          refereeAssignmentIntents.refereeId,
          refereeAssignmentIntents.slotNumber,
        ],
        set: { clickedAt: new Date() },
      });
  }

  // 10. Publish domain event
  await publishDomainEvent({
    type: EVENT_TYPES.REFEREE_ASSIGNED,
    source: "manual",
    entityType: "referee",
    entityId: referee.id,
    entityName: refereeName,
    deepLinkPath: "/admin/referees",
    payload: {
      matchNo: game.matchNo,
      homeTeam: game.homeTeamName,
      guestTeam: game.guestTeamName,
      refereeName,
      role: slotKey.toUpperCase(),
      teamIds: [],
      refereeId: referee.id,
      matchId: game.matchId,
      kickoffDate: game.kickoffDate,
      kickoffTime: game.kickoffTime,
      deepLink: `/referee-game/${game.id}`,
    },
  });

  // 11. Return response
  return {
    success: true,
    slot: slotKey,
    status: "assigned",
    refereeName,
  };
}

export async function unassignReferee(
  spielplanId: number,
  slotNumber: 1 | 2,
): Promise<UnassignRefereeResponse> {
  // 1. Look up game
  const games = await getDb()
    .select()
    .from(refereeGames)
    .where(eq(refereeGames.apiMatchId, spielplanId))
    .limit(1);

  const game = games[0];
  if (!game) {
    throw new AssignmentError(
      `Game with spielplanId=${spielplanId} not found`,
      "GAME_NOT_FOUND",
    );
  }

  const slotKey = slotNumber === 1 ? "sr1" : "sr2";

  // 2. Call federation unassignment
  const submitResponse = await sdkClient.submitRefereeUnassignment(
    spielplanId,
    slotNumber,
  );

  // 3. Check federation success
  if (!submitResponse.gameInfoMessages.includes(FEDERATION_SUCCESS)) {
    throw new AssignmentError(
      `Federation rejected unassignment: ${submitResponse.gameInfoMessages.join(", ")}`,
      "FEDERATION_ERROR",
    );
  }

  // 4. Clear slot fields in refereeGames
  const slotClear =
    slotNumber === 1
      ? { sr1Name: null, sr1RefereeApiId: null, sr1Status: "open" }
      : { sr2Name: null, sr2RefereeApiId: null, sr2Status: "open" };

  await getDb()
    .update(refereeGames)
    .set(slotClear)
    .where(eq(refereeGames.apiMatchId, spielplanId));

  // 5. Delete intent (only when game has a linked match and a referee was assigned)
  let refereeEntityId = 0;

  if (game.matchId != null) {
    const srApiId =
      slotNumber === 1 ? game.sr1RefereeApiId : game.sr2RefereeApiId;

    if (srApiId != null) {
      const refereeRows = await getDb()
        .select()
        .from(referees)
        .where(eq(referees.apiId, srApiId))
        .limit(1);

      const referee = refereeRows[0];
      if (referee) {
        refereeEntityId = referee.id;
        await getDb()
          .delete(refereeAssignmentIntents)
          .where(
            and(
              eq(refereeAssignmentIntents.matchId, game.matchId),
              eq(refereeAssignmentIntents.refereeId, referee.id),
              eq(refereeAssignmentIntents.slotNumber, slotNumber),
            ),
          );
      }
    }
  }

  // 6. Publish domain event
  const refereeName =
    slotNumber === 1 ? (game.sr1Name ?? "") : (game.sr2Name ?? "");

  await publishDomainEvent({
    type: EVENT_TYPES.REFEREE_UNASSIGNED,
    source: "manual",
    entityType: "referee",
    entityId: refereeEntityId,
    entityName: refereeName,
    deepLinkPath: "/admin/referees",
    payload: {
      matchNo: game.matchNo,
      homeTeam: game.homeTeamName,
      guestTeam: game.guestTeamName,
      refereeName,
      role: slotKey.toUpperCase(),
      teamIds: [],
      refereeId: refereeEntityId > 0 ? refereeEntityId : undefined,
      matchId: game.matchId,
      kickoffDate: game.kickoffDate,
      kickoffTime: game.kickoffTime,
      deepLink: `/referee-game/${game.id}`,
    },
  });

  // 7. Return response
  return {
    success: true,
    slot: slotKey,
    status: "open",
  };
}

export function rankCandidates<
  T extends {
    srId: number;
    nachName: string;
    lizenznr: number;
    qualiSr1: boolean;
    qualiSr2: boolean;
    srModusMismatchSr1: boolean;
    srModusMismatchSr2: boolean;
    blocktermin: boolean;
    zeitraumBlockiert: string | null;
    meta: { total: number };
  },
>(candidates: T[], slot: EligibilitySlot): T[] {
  const eligible: T[] = [];
  const blocked: T[] = [];

  for (const c of candidates) {
    if (isRefereeEligibleForGame(c, slot)) eligible.push(c);
    else blocked.push(c);
  }

  const compare = (a: T, b: T) => {
    if (a.meta.total !== b.meta.total) return a.meta.total - b.meta.total;
    if (a.lizenznr !== b.lizenznr) return a.lizenznr - b.lizenznr;
    return a.nachName.localeCompare(b.nachName);
  };

  eligible.sort(compare);
  blocked.sort(compare);

  return [...eligible, ...blocked];
}

export async function searchCandidates(
  spielplanId: number,
  search: string,
  pageFrom: number,
  pageSize: number,
  slot: EligibilitySlot = "either",
): Promise<CandidateSearchResponse> {
  const { results, ...rest } = await sdkClient.searchRefereesForGame(spielplanId, {
    textSearch: search || null,
    pageFrom,
    pageSize,
  });
  const ranked = rankCandidates(results, slot);
  return { ...rest, results: ranked };
}
