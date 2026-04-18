import { db } from "../../config/database";
import {
  refereeGames,
  referees,
  refereeAssignmentRules,
} from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import type {
  AssignRefereeResponse,
  UnassignRefereeResponse,
} from "@dragons/shared";
import {
  assignReferee,
  unassignReferee,
  AssignmentError,
} from "./referee-assignment.service";
import { resolveClaimableSlots } from "./referee-slot-resolver";

export interface ClaimRefereeGameParams {
  refereeId: number;
  gameId: number;
  slotNumber?: 1 | 2;
}

export interface UnclaimRefereeGameParams {
  refereeId: number;
  gameId: number;
}

export async function claimRefereeGame(
  params: ClaimRefereeGameParams,
): Promise<AssignRefereeResponse> {
  const { refereeId, gameId, slotNumber } = params;

  const [referee] = await db
    .select({
      apiId: referees.apiId,
      isOwnClub: referees.isOwnClub,
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
    })
    .from(referees)
    .where(eq(referees.id, refereeId))
    .limit(1);

  if (!referee || referee.apiId == null) {
    throw new AssignmentError(
      "Referee not found or missing federation apiId",
      "NOT_QUALIFIED",
    );
  }

  if (!referee.isOwnClub) {
    throw new AssignmentError(
      "Referee is not an own-club referee",
      "NOT_OWN_CLUB",
    );
  }

  const [game] = await db
    .select()
    .from(refereeGames)
    .where(eq(refereeGames.id, gameId))
    .limit(1);

  if (!game) {
    throw new AssignmentError(
      `Game with id=${gameId} not found`,
      "GAME_NOT_FOUND",
    );
  }

  const rules = await db
    .select({
      teamId: refereeAssignmentRules.teamId,
      deny: refereeAssignmentRules.deny,
      allowSr1: refereeAssignmentRules.allowSr1,
      allowSr2: refereeAssignmentRules.allowSr2,
    })
    .from(refereeAssignmentRules)
    .where(eq(refereeAssignmentRules.refereeId, refereeId));

  const claimable = resolveClaimableSlots(game, referee, rules);
  if (claimable.length === 0) {
    throw new AssignmentError(
      "No claimable slot for this referee",
      "NOT_QUALIFIED",
    );
  }

  let slot: 1 | 2;
  if (slotNumber != null) {
    if (!claimable.includes(slotNumber)) {
      throw new AssignmentError(
        `Slot ${slotNumber} is not claimable for this referee`,
        "SLOT_TAKEN",
      );
    }
    slot = slotNumber;
  } else {
    slot = claimable.includes(1) ? 1 : 2;
  }

  return assignReferee(game.apiMatchId, slot, referee.apiId);
}

export async function unclaimRefereeGame(
  params: UnclaimRefereeGameParams,
): Promise<UnassignRefereeResponse> {
  const { refereeId, gameId } = params;

  const [referee] = await db
    .select({ apiId: referees.apiId })
    .from(referees)
    .where(eq(referees.id, refereeId))
    .limit(1);

  if (!referee || referee.apiId == null) {
    throw new AssignmentError(
      "Referee not found or missing federation apiId",
      "NOT_QUALIFIED",
    );
  }

  const [game] = await db
    .select()
    .from(refereeGames)
    .where(eq(refereeGames.id, gameId))
    .limit(1);

  if (!game) {
    throw new AssignmentError(
      `Game with id=${gameId} not found`,
      "GAME_NOT_FOUND",
    );
  }

  let slotNumber: 1 | 2;
  if (game.sr1RefereeApiId === referee.apiId) slotNumber = 1;
  else if (game.sr2RefereeApiId === referee.apiId) slotNumber = 2;
  else {
    throw new AssignmentError(
      "Referee is not assigned to this game",
      "NOT_ASSIGNED",
    );
  }

  return unassignReferee(game.apiMatchId, slotNumber);
}
