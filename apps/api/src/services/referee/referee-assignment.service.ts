import { db } from "../../config/database";
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
  const games = await db
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
  const refereeRows = await db
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
    const matchRows = await db
      .select()
      .from(matches)
      .where(eq(matches.id, game.matchId))
      .limit(1);

    const match = matchRows[0];
    if (match) {
      const teamRows = await db
        .select()
        .from(teams)
        .where(inArray(teams.apiTeamPermanentId, [match.homeTeamApiId, match.guestTeamApiId]))
        .limit(2);

      const teamIds = teamRows.map((t) => t.id);

      if (teamIds.length > 0) {
        const denyRules = await db
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

  // 4. Find candidate in federation getRefs
  const refsResponse = await sdkClient.searchRefereesForGame(spielplanId, {
    pageSize: 200,
  });

  const candidate = refsResponse.results.find((sr) => sr.srId === refereeApiId);
  if (!candidate) {
    throw new AssignmentError(
      `Referee ${refereeApiId} is not qualified or available for game ${spielplanId}`,
      "NOT_QUALIFIED",
    );
  }

  // 5. Submit assignment to federation
  const submitResponse = await sdkClient.submitRefereeAssignment(
    spielplanId,
    slotNumber,
    candidate,
  );

  // 6. Check federation success
  if (!submitResponse.gameInfoMessages.includes(FEDERATION_SUCCESS)) {
    throw new AssignmentError(
      `Federation rejected assignment: ${submitResponse.gameInfoMessages.join(", ")}`,
      "FEDERATION_ERROR",
    );
  }

  // 7. Build referee name
  const refereeName = `${candidate.vorname} ${candidate.nachName}`;
  const slotKey = slotNumber === 1 ? "sr1" : "sr2";

  // 8. Update refereeGames slot fields
  const slotUpdate =
    slotNumber === 1
      ? { sr1Name: refereeName, sr1RefereeApiId: refereeApiId, sr1Status: "assigned" }
      : { sr2Name: refereeName, sr2RefereeApiId: refereeApiId, sr2Status: "assigned" };

  await db
    .update(refereeGames)
    .set(slotUpdate)
    .where(eq(refereeGames.apiMatchId, spielplanId));

  // 9. Upsert intent (only when game has a linked match)
  if (game.matchId != null) {
    await db
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
    deepLinkPath: "/admin/referee/matches",
    payload: {
      matchNo: game.matchNo,
      homeTeam: game.homeTeamName,
      guestTeam: game.guestTeamName,
      refereeName,
      role: slotKey.toUpperCase(),
      teamIds: [],
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
  const games = await db
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

  await db
    .update(refereeGames)
    .set(slotClear)
    .where(eq(refereeGames.apiMatchId, spielplanId));

  // 5. Delete intent (only when game has a linked match and a referee was assigned)
  let refereeEntityId = 0;

  if (game.matchId != null) {
    const srApiId =
      slotNumber === 1 ? game.sr1RefereeApiId : game.sr2RefereeApiId;

    if (srApiId != null) {
      const refereeRows = await db
        .select()
        .from(referees)
        .where(eq(referees.apiId, srApiId))
        .limit(1);

      const referee = refereeRows[0];
      if (referee) {
        refereeEntityId = referee.id;
        await db
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
    deepLinkPath: "/admin/referee/matches",
    payload: {
      matchNo: game.matchNo,
      homeTeam: game.homeTeamName,
      guestTeam: game.guestTeamName,
      refereeName,
      role: slotKey.toUpperCase(),
      teamIds: [],
    },
  });

  // 7. Return response
  return {
    success: true,
    slot: slotKey,
    status: "open",
  };
}

export async function searchCandidates(
  spielplanId: number,
  search: string,
  pageFrom: number,
  pageSize: number,
): Promise<CandidateSearchResponse> {
  return sdkClient.searchRefereesForGame(spielplanId, {
    textSearch: search || null,
    pageFrom,
    pageSize,
  });
}
