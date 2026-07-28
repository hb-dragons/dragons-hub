import { getDb } from "../../config/database";
import {
  refereeGames,
  referees,
  matches,
  teams,
  refereeAssignmentRules,
  refereeAssignmentIntents,
} from "@dragons/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { sdkClient } from "../sync/sdk-client";
import { publishDomainEvent } from "../events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";
import type {
  AssignRefereeResponse,
  UnassignRefereeResponse,
  CandidateSearchResponse,
} from "@dragons/shared";
import { isRefereeEligibleForGame, type EligibilitySlot } from "./referee-slot-resolver";
import { AssignmentError } from "./referee-assignment.errors";

const FEDERATION_SUCCESS = "Änderungen erfolgreich übernommen";

export async function assignReferee(
  spielplanId: number,
  slotNumber: 1 | 2,
  refereeApiId: number,
): Promise<AssignRefereeResponse> {
  // 1. Look up game (a withdrawn game — issue #105 — is not actionable)
  const games = await getDb()
    .select()
    .from(refereeGames)
    .where(and(eq(refereeGames.apiMatchId, spielplanId), isNull(refereeGames.removedAt)))
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
        isNull(refereeGames.removedAt),
        eq(slotStatusColumn, "open"),
      ),
    )
    .returning({ id: refereeGames.id });

  const slotRefereeApiIdColumn =
    slotNumber === 1
      ? refereeGames.sr1RefereeApiId
      : refereeGames.sr2RefereeApiId;

  let idempotentReclaim = false;
  if (claimed.length === 0) {
    // 0 rows means the slot was not "open". Re-read the current holder: if it's
    // already this same referee (a re-submit or double-click; the federation
    // already has them), treat it as an idempotent reclaim instead of a spurious
    // SLOT_TAKEN. Only a rival holder is a genuine conflict.
    const currentRows = await getDb()
      .select()
      .from(refereeGames)
      .where(and(eq(refereeGames.apiMatchId, spielplanId), isNull(refereeGames.removedAt)))
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

    idempotentReclaim = true;
  }

  // 7. Submit to the federation now that we hold the local claim. Skip on an
  // idempotent reclaim — the federation already holds this referee. If the
  // federation rejects (or the call throws), roll the slot back to open. The
  // rollback is a compare-and-set guarded on THIS caller still holding the slot
  // so it can't clobber a referee a concurrent caller validly assigned while our
  // submit was in flight.
  const rollbackClaim = async () => {
    const slotClear =
      slotNumber === 1
        ? { sr1Name: null, sr1RefereeApiId: null, sr1Status: "open" }
        : { sr2Name: null, sr2RefereeApiId: null, sr2Status: "open" };
    await getDb()
      .update(refereeGames)
      .set(slotClear)
      .where(
        and(
          eq(refereeGames.apiMatchId, spielplanId),
          isNull(refereeGames.removedAt),
          eq(slotRefereeApiIdColumn, refereeApiId),
          eq(slotStatusColumn, "assigned"),
        ),
      );
  };

  if (!idempotentReclaim) {
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
  }

  // 8. Record the assignment intent and the domain event in ONE transaction.
  // The federation call above has to stay outside it — it is network I/O and
  // holding a transaction open across it would pin a connection for the
  // duration of a third-party request — so the durable local state that
  // follows the submit is what gets made atomic. A crash between the intent
  // upsert and the event insert previously left a referee assigned with no
  // notification and no outbox row to recover from. Passing `tx` inserts the
  // event with the intent; the outbox poller enqueues it after commit.
  //
  // The intent upsert runs on the idempotent reclaim too: it is idempotent, so
  // it recovers a missing intent if the original call died after the federation
  // submit but before persisting it. The event does not — on a reclaim the
  // assignment is not happening now, and replaying REFEREE_ASSIGNED would spam
  // a stale "just assigned" notification.
  const matchIdForIntent = game.matchId;
  if (matchIdForIntent != null || !idempotentReclaim) {
    await getDb().transaction(async (tx) => {
      if (matchIdForIntent != null) {
        const clickedAt = new Date();
        await tx
          .insert(refereeAssignmentIntents)
          .values({
            matchId: matchIdForIntent,
            refereeId: referee.id,
            slotNumber,
            clickedAt,
          })
          .onConflictDoUpdate({
            target: [
              refereeAssignmentIntents.matchId,
              refereeAssignmentIntents.refereeId,
              refereeAssignmentIntents.slotNumber,
            ],
            set: { clickedAt },
          });
      }

      if (!idempotentReclaim) {
        await publishDomainEvent(
          {
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
          },
          tx,
        );
      }
    });
  }

  // 11. Return response
  return {
    success: true,
    slot: slotKey,
    status: "assigned",
    refereeName,
  };
}

/**
 * Self-service entry point: a referee may only assign themselves.
 *
 * `assignReferee` itself stays unrestricted — `admin/referee-assignment.routes.ts`
 * assigns any qualified referee under `requirePermission`, and
 * `referee-claim.service.ts` calls it internally after already resolving and
 * validating the referee itself — so hoisting an ownership check into
 * `assignReferee` would either break admin assignment (which has no "caller
 * referee" concept at all) or make the check skippable by a caller that simply
 * omits an optional argument. This wrapper is the one and only path a
 * self-service caller uses, so the ownership check cannot be bypassed by a
 * missed argument: `callerRefereeId` is required, and a call site that forgets
 * it fails to typecheck.
 */
export async function assignRefereeAsSelf(
  spielplanId: number,
  slotNumber: 1 | 2,
  refereeApiId: number,
  callerRefereeId: number,
): Promise<AssignRefereeResponse> {
  const [refereeRow] = await getDb()
    .select({ apiId: referees.apiId, isOwnClub: referees.isOwnClub })
    .from(referees)
    .where(eq(referees.id, callerRefereeId))
    .limit(1);

  if (!refereeRow || refereeRow.apiId !== refereeApiId) {
    throw new AssignmentError("Cannot assign another referee", "FORBIDDEN");
  }
  if (!refereeRow.isOwnClub) {
    throw new AssignmentError("Referee is not an own-club referee", "NOT_OWN_CLUB");
  }

  return assignReferee(spielplanId, slotNumber, refereeApiId);
}

export async function unassignReferee(
  spielplanId: number,
  slotNumber: 1 | 2,
): Promise<UnassignRefereeResponse> {
  // 1. Look up game (a withdrawn game — issue #105 — is not actionable)
  const games = await getDb()
    .select()
    .from(refereeGames)
    .where(and(eq(refereeGames.apiMatchId, spielplanId), isNull(refereeGames.removedAt)))
    .limit(1);

  const game = games[0];
  if (!game) {
    throw new AssignmentError(
      `Game with spielplanId=${spielplanId} not found`,
      "GAME_NOT_FOUND",
    );
  }

  const slotKey = slotNumber === 1 ? "sr1" : "sr2";

  const srApiId = slotNumber === 1 ? game.sr1RefereeApiId : game.sr2RefereeApiId;
  const srStatus = slotNumber === 1 ? game.sr1Status : game.sr2Status;

  // 2. An already-open slot is nothing to undo. Returning early keeps the call
  // idempotent (a double-click still succeeds) without telling the federation
  // to clear a slot that is already clear, and without emitting a
  // referee.unassigned event for a referee who was never there — that event
  // used to go out with entityId 0 and an empty referee name, which reads to a
  // subscriber as "somebody was dropped from this game".
  if (srApiId == null && srStatus === "open") {
    return { success: true, slot: slotKey, status: "open" };
  }

  // 3. Call federation unassignment. Like assignReferee, this network call is
  // deliberately outside the transaction below; the local write is what the
  // next sync reconciles against the federation anyway, so a failure after this
  // point self-heals rather than needing the two to be atomic.
  const submitResponse = await sdkClient.submitRefereeUnassignment(
    spielplanId,
    slotNumber,
  );

  // 4. Check federation success
  if (!submitResponse.gameInfoMessages.includes(FEDERATION_SUCCESS)) {
    throw new AssignmentError(
      `Federation rejected unassignment: ${submitResponse.gameInfoMessages.join(", ")}`,
      "FEDERATION_ERROR",
    );
  }

  // 5. Resolve the local referee row for the referee we are dropping, so the
  // event can name them. Independent of whether the game is linked to a match —
  // only the intent delete needs the match id.
  let refereeEntityId = 0;
  if (srApiId != null) {
    const [referee] = await getDb()
      .select()
      .from(referees)
      .where(eq(referees.apiId, srApiId))
      .limit(1);
    if (referee) refereeEntityId = referee.id;
  }

  // 6. Clear the slot, drop the intent and record the event as one unit. Split
  // apart, a failure between them left the slot open locally with the intent
  // still standing (the next sync would "confirm" an assignment that no longer
  // exists) or with nobody notified. The clear is a compare-and-set on the
  // referee still occupying the slot so it cannot wipe an assignment a
  // concurrent caller made while the federation call above was in flight.
  const slotClear =
    slotNumber === 1
      ? { sr1Name: null, sr1RefereeApiId: null, sr1Status: "open" }
      : { sr2Name: null, sr2RefereeApiId: null, sr2Status: "open" };

  const slotRefereeApiIdColumn =
    slotNumber === 1 ? refereeGames.sr1RefereeApiId : refereeGames.sr2RefereeApiId;

  const refereeName =
    slotNumber === 1 ? (game.sr1Name ?? "") : (game.sr2Name ?? "");

  await getDb().transaction(async (tx) => {
    await tx
      .update(refereeGames)
      .set(slotClear)
      .where(
        and(
          eq(refereeGames.apiMatchId, spielplanId),
          isNull(refereeGames.removedAt),
          srApiId == null
            ? isNull(slotRefereeApiIdColumn)
            : eq(slotRefereeApiIdColumn, srApiId),
        ),
      );

    if (game.matchId != null && refereeEntityId > 0) {
      await tx
        .delete(refereeAssignmentIntents)
        .where(
          and(
            eq(refereeAssignmentIntents.matchId, game.matchId),
            eq(refereeAssignmentIntents.refereeId, refereeEntityId),
            eq(refereeAssignmentIntents.slotNumber, slotNumber),
          ),
        );
    }

    // Only a slot that actually held a referee produces a referee.unassigned
    // event. Retracting an open offer drops nobody.
    if (srApiId != null) {
      await publishDomainEvent(
        {
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
        },
        tx,
      );
    }
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
