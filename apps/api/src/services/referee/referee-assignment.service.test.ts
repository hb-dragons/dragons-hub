// apps/api/src/services/referee/referee-assignment.service.test.ts

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked (issue #110).
// The load-bearing logic in this module is a compare-and-set: an
// `UPDATE … WHERE api_match_id = ? AND srN_status = 'open' RETURNING id` whose
// affected-row count decides whether we talk to the federation at all, plus a
// guarded rollback that must not clobber a rival's valid assignment. The old
// version stubbed `eq`/`and` to identity functions and hand-fed the row count,
// so "the slot was taken" and "the slot was free" were test-configured facts
// rather than database facts, and `expect(updateWhere).toHaveBeenCalledOnce()`
// asserted nothing about what was written. Everything below runs against a real
// (in-process PGlite) Postgres and asserts the surviving row.
//
// Only the two genuinely external collaborators are mocked: the federation SDK
// and the domain-event publisher.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  searchRefereesForGame: vi.fn(),
  submitRefereeAssignment: vi.fn(),
  submitRefereeUnassignment: vi.fn(),
  publishDomainEvent: vi.fn().mockResolvedValue({ id: "evt-1" }),
}));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../sync/sdk-client", () => ({
  sdkClient: {
    searchRefereesForGame: mocks.searchRefereesForGame,
    submitRefereeAssignment: mocks.submitRefereeAssignment,
    submitRefereeUnassignment: mocks.submitRefereeUnassignment,
  },
}));

vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: mocks.publishDomainEvent,
}));

// --- Imports (after mocks) ---

import {
  assignReferee,
  assignRefereeAsSelf,
  unassignReferee,
  searchCandidates,
  rankCandidates,
} from "./referee-assignment.service";
import {
  refereeGames,
  referees,
  matches,
  teams,
  refereeAssignmentRules,
  refereeAssignmentIntents,
} from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.searchRefereesForGame.mockReset();
  mocks.submitRefereeAssignment.mockReset();
  mocks.submitRefereeUnassignment.mockReset();
  mocks.publishDomainEvent.mockResolvedValue({ id: "evt-1" });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Fixtures ---

const SPIELPLAN_ID = 12345;
const REF_API_ID = 9001;

const CANDIDATE = {
  srId: REF_API_ID,
  vorname: "Max",
  nachName: "Muster",
  email: "max@example.com",
  lizenznr: 12345,
  strasse: "Musterstr. 1",
  plz: "12345",
  ort: "Berlin",
  distanceKm: "5.2",
  qmaxSr1: null,
  qmaxSr2: null,
  warning: [],
  meta: {} as never,
  qualiSr1: true,
  qualiSr2: true,
  qualiSr3: false,
  qualiCoa: false,
  qualiKom: false,
  srModusMismatchSr1: false,
  srModusMismatchSr2: false,
  ansetzungAmTag: false,
  blocktermin: false,
  zeitraumBlockiert: null,
  srGruppen: [],
};

const SUCCESS_RESPONSE = {
  game1: { spielplanId: SPIELPLAN_ID },
  gameInfoMessages: ["Änderungen erfolgreich übernommen"],
  editAnythingPossible: true,
};

// --- Seed helpers ---

async function seedGame(
  seed: Partial<typeof refereeGames.$inferInsert> & { apiMatchId?: number } = {},
): Promise<number> {
  const [row] = await ctx.db
    .insert(refereeGames)
    .values({
      apiMatchId: SPIELPLAN_ID,
      matchNo: 42,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      homeTeamName: "Dragons A",
      guestTeamName: "Lions B",
      sr1OurClub: true,
      sr2OurClub: true,
      sr1Status: "open",
      sr2Status: "open",
      isHomeGame: true,
      ...seed,
    })
    .returning({ id: refereeGames.id });
  return row!.id;
}

async function seedReferee(apiId = REF_API_ID): Promise<number> {
  const [row] = await ctx.db
    .insert(referees)
    .values({ apiId, firstName: "Max", lastName: "Muster", isOwnClub: true })
    .returning({ id: referees.id });
  return row!.id;
}

async function seedTeam(apiTeamPermanentId: number): Promise<number> {
  const [row] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId,
      seasonTeamId: apiTeamPermanentId,
      teamCompetitionId: apiTeamPermanentId,
      name: `Team ${apiTeamPermanentId}`,
      clubId: 1,
    })
    .returning({ id: teams.id });
  return row!.id;
}

/** Seed a linked match (with its two teams) and return `{ matchId, homeTeamId, guestTeamId }`. */
async function seedMatch(): Promise<{
  matchId: number;
  homeTeamId: number;
  guestTeamId: number;
}> {
  const homeTeamId = await seedTeam(201);
  const guestTeamId = await seedTeam(202);
  const [row] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: SPIELPLAN_ID,
      matchNo: 42,
      matchDay: 1,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      homeTeamApiId: 201,
      guestTeamApiId: 202,
    })
    .returning({ id: matches.id });
  return { matchId: row!.id, homeTeamId, guestTeamId };
}

interface SlotRow {
  sr1_name: string | null;
  sr1_referee_api_id: number | null;
  sr1_status: string;
  sr2_name: string | null;
  sr2_referee_api_id: number | null;
  sr2_status: string;
}

async function slotRow(apiMatchId = SPIELPLAN_ID): Promise<SlotRow> {
  const res = await ctx.client.query<SlotRow>(
    `SELECT sr1_name, sr1_referee_api_id, sr1_status,
            sr2_name, sr2_referee_api_id, sr2_status
     FROM referee_games WHERE api_match_id = $1`,
    [apiMatchId],
  );
  return res.rows[0]!;
}

async function intentRows(): Promise<
  Array<{ match_id: number; referee_id: number; slot_number: number }>
> {
  const res = await ctx.client.query<{
    match_id: number;
    referee_id: number;
    slot_number: number;
  }>(
    `SELECT match_id, referee_id, slot_number
     FROM referee_assignment_intents ORDER BY slot_number`,
  );
  return res.rows;
}

/** Configure the federation to know this candidate and accept the submit. */
function federationAccepts() {
  mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
  mocks.submitRefereeAssignment.mockResolvedValue(SUCCESS_RESPONSE);
}

// ---------------------------------------------------------------------------
// assignReferee
// ---------------------------------------------------------------------------

describe("assignReferee — happy path", () => {
  it("writes the referee into slot 1 and leaves slot 2 untouched", async () => {
    const gameId = await seedGame();
    await seedReferee();
    federationAccepts();

    const result = await assignReferee(SPIELPLAN_ID, 1, REF_API_ID);

    expect(result).toEqual({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Max Muster",
    });
    expect(await slotRow()).toEqual({
      sr1_name: "Max Muster",
      sr1_referee_api_id: REF_API_ID,
      sr1_status: "assigned",
      sr2_name: null,
      sr2_referee_api_id: null,
      sr2_status: "open",
    });
    expect(mocks.submitRefereeAssignment).toHaveBeenCalledWith(SPIELPLAN_ID, 1, CANDIDATE);
    expect(gameId).toBeGreaterThan(0);
  });

  it("writes the referee into slot 2 and leaves slot 1 untouched", async () => {
    await seedGame();
    await seedReferee();
    federationAccepts();

    const result = await assignReferee(SPIELPLAN_ID, 2, REF_API_ID);

    expect(result.slot).toBe("sr2");
    expect(await slotRow()).toEqual({
      sr1_name: null,
      sr1_referee_api_id: null,
      sr1_status: "open",
      sr2_name: "Max Muster",
      sr2_referee_api_id: REF_API_ID,
      sr2_status: "assigned",
    });
  });

  it("only updates the game it was asked about", async () => {
    await seedGame();
    await seedGame({ apiMatchId: 55555 });
    await seedReferee();
    federationAccepts();

    await assignReferee(SPIELPLAN_ID, 1, REF_API_ID);

    expect((await slotRow(55555)).sr1_status).toBe("open");
    expect((await slotRow(55555)).sr1_referee_api_id).toBeNull();
  });

  it("upserts an assignment intent when the game is linked to a match", async () => {
    const { matchId } = await seedMatch();
    await seedGame({ matchId });
    const refereeId = await seedReferee();
    federationAccepts();

    await assignReferee(SPIELPLAN_ID, 1, REF_API_ID);

    expect(await intentRows()).toEqual([
      { match_id: matchId, referee_id: refereeId, slot_number: 1 },
    ]);
  });

  it("writes no intent when the game has no linked match", async () => {
    await seedGame({ matchId: null });
    await seedReferee();
    federationAccepts();

    await assignReferee(SPIELPLAN_ID, 1, REF_API_ID);

    expect(await intentRows()).toEqual([]);
  });

  it("publishes referee.assigned with the game's details", async () => {
    const { matchId } = await seedMatch();
    const gameId = await seedGame({ matchId });
    const refereeId = await seedReferee();
    federationAccepts();

    await assignReferee(SPIELPLAN_ID, 1, REF_API_ID);

    expect(mocks.publishDomainEvent).toHaveBeenCalledOnce();
    const event = mocks.publishDomainEvent.mock.calls[0]![0];
    expect(event).toMatchObject({
      type: "referee.assigned",
      source: "manual",
      entityType: "referee",
      entityId: refereeId,
      entityName: "Max Muster",
    });
    expect(event.payload).toMatchObject({
      matchNo: 42,
      homeTeam: "Dragons A",
      guestTeam: "Lions B",
      refereeName: "Max Muster",
      role: "SR1",
      refereeId,
      matchId,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      deepLink: `/referee-game/${gameId}`,
    });
  });

  it("publishes role SR2 for a slot-2 assignment", async () => {
    await seedGame();
    await seedReferee();
    federationAccepts();

    await assignReferee(SPIELPLAN_ID, 2, REF_API_ID);

    expect(mocks.publishDomainEvent.mock.calls[0]![0].payload.role).toBe("SR2");
  });
});

describe("assignReferee — lookup failures", () => {
  it("GAME_NOT_FOUND when no referee-game has that spielplanId", async () => {
    await seedGame();
    await seedReferee();

    await expect(assignReferee(99999, 1, REF_API_ID)).rejects.toMatchObject({
      code: "GAME_NOT_FOUND",
      name: "AssignmentError",
    });
    expect(mocks.searchRefereesForGame).not.toHaveBeenCalled();
  });

  it("GAME_NOT_FOUND for a tombstoned game (#105)", async () => {
    await seedGame({ removedAt: new Date("2026-04-01T00:00:00Z") });
    await seedReferee();

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toMatchObject({
      code: "GAME_NOT_FOUND",
    });
    // The withdrawn game's slot must not be touched.
    expect((await slotRow()).sr1_status).toBe("open");
  });

  it("NOT_QUALIFIED when the referee is not in the local referees table", async () => {
    await seedGame();

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toMatchObject({
      code: "NOT_QUALIFIED",
    });
    expect(mocks.searchRefereesForGame).not.toHaveBeenCalled();
    expect((await slotRow()).sr1_status).toBe("open");
  });
});

describe("assignReferee — deny rules", () => {
  it("DENY_RULE when the referee has a deny rule for a team in this game", async () => {
    const { matchId, guestTeamId } = await seedMatch();
    await seedGame({ matchId });
    const refereeId = await seedReferee();
    await ctx.db.insert(refereeAssignmentRules).values({
      refereeId,
      teamId: guestTeamId,
      deny: true,
    });

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toMatchObject({
      code: "DENY_RULE",
    });
    expect(mocks.searchRefereesForGame).not.toHaveBeenCalled();
    expect((await slotRow()).sr1_status).toBe("open");
  });

  it("a non-deny (allow) rule for the same team does not block", async () => {
    const { matchId, homeTeamId } = await seedMatch();
    await seedGame({ matchId });
    const refereeId = await seedReferee();
    await ctx.db.insert(refereeAssignmentRules).values({
      refereeId,
      teamId: homeTeamId,
      deny: false,
      allowSr1: true,
    });
    federationAccepts();

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).resolves.toMatchObject({
      success: true,
    });
  });

  it("a deny rule for an unrelated team does not block", async () => {
    const { matchId } = await seedMatch();
    const unrelated = await seedTeam(999);
    await seedGame({ matchId });
    const refereeId = await seedReferee();
    await ctx.db
      .insert(refereeAssignmentRules)
      .values({ refereeId, teamId: unrelated, deny: true });
    federationAccepts();

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).resolves.toMatchObject({
      success: true,
    });
  });

  it("another referee's deny rule does not block this referee", async () => {
    const { matchId, homeTeamId } = await seedMatch();
    await seedGame({ matchId });
    await seedReferee();
    const otherRefereeId = await seedReferee(7777);
    await ctx.db
      .insert(refereeAssignmentRules)
      .values({ refereeId: otherRefereeId, teamId: homeTeamId, deny: true });
    federationAccepts();

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).resolves.toMatchObject({
      success: true,
    });
  });

  it("skips the deny check entirely when the game has no linked match", async () => {
    await seedGame({ matchId: null });
    await seedReferee();
    federationAccepts();

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).resolves.toMatchObject({
      success: true,
    });
  });
});

describe("assignReferee — federation candidate paging (#68)", () => {
  it("pages past the first window to find a distance-ranked referee", async () => {
    await seedGame();
    await seedReferee();
    const OTHER = { ...CANDIDATE, srId: 1234 };
    mocks.searchRefereesForGame
      .mockResolvedValueOnce({ results: [OTHER], total: 2 })
      .mockResolvedValueOnce({ results: [CANDIDATE], total: 2 });
    mocks.submitRefereeAssignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await assignReferee(SPIELPLAN_ID, 1, REF_API_ID);

    expect(result.success).toBe(true);
    expect(mocks.searchRefereesForGame).toHaveBeenCalledTimes(2);
    expect(mocks.searchRefereesForGame.mock.calls[0]![1]).toMatchObject({
      pageFrom: 0,
      pageSize: 200,
    });
    expect(mocks.searchRefereesForGame.mock.calls[1]![1]).toMatchObject({
      pageFrom: 1,
      pageSize: 200,
    });
    expect(mocks.submitRefereeAssignment).toHaveBeenCalledWith(SPIELPLAN_ID, 1, CANDIDATE);
  });

  it("NOT_QUALIFIED once the reported total is exhausted", async () => {
    await seedGame();
    await seedReferee();
    mocks.searchRefereesForGame
      .mockResolvedValueOnce({ results: [{ ...CANDIDATE, srId: 1234 }], total: 2 })
      .mockResolvedValueOnce({ results: [{ ...CANDIDATE, srId: 5678 }], total: 2 });

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toMatchObject({
      code: "NOT_QUALIFIED",
    });
    expect(mocks.searchRefereesForGame).toHaveBeenCalledTimes(2);
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
    expect((await slotRow()).sr1_status).toBe("open");
  });

  it("NOT_QUALIFIED when the federation returns no candidates at all", async () => {
    await seedGame();
    await seedReferee();
    mocks.searchRefereesForGame.mockResolvedValue({ results: [], total: 5 });

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toMatchObject({
      code: "NOT_QUALIFIED",
    });
    // Guards against an infinite paging loop when results are empty but total is not.
    expect(mocks.searchRefereesForGame).toHaveBeenCalledTimes(1);
  });
});

describe("assignReferee — atomic local claim (#84, #67)", () => {
  it("SLOT_TAKEN when a rival already holds the slot, without touching their row", async () => {
    await seedGame({
      sr1Status: "assigned",
      sr1RefereeApiId: 5555,
      sr1Name: "Rival Ref",
    });
    await seedReferee();
    federationAccepts();

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toMatchObject({
      code: "SLOT_TAKEN",
      name: "AssignmentError",
    });

    // The guarded UPDATE matched 0 rows: the rival's assignment survives intact.
    expect(await slotRow()).toMatchObject({
      sr1_name: "Rival Ref",
      sr1_referee_api_id: 5555,
      sr1_status: "assigned",
    });
    // The federation has no compare-and-set; the race loser must not submit.
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
    expect(await intentRows()).toEqual([]);
    expect(mocks.publishDomainEvent).not.toHaveBeenCalled();
  });

  it("SLOT_TAKEN when the slot is merely offered, not open", async () => {
    await seedGame({ sr1Status: "offered", sr1RefereeApiId: 5555 });
    await seedReferee();
    federationAccepts();

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toMatchObject({
      code: "SLOT_TAKEN",
    });
    expect((await slotRow()).sr1_status).toBe("offered");
  });

  it("gates on the slot being claimed, not the other one", async () => {
    // sr1 is taken, sr2 is free: claiming sr2 must succeed.
    await seedGame({ sr1Status: "assigned", sr1RefereeApiId: 5555, sr1Name: "Rival" });
    await seedReferee();
    federationAccepts();

    await expect(assignReferee(SPIELPLAN_ID, 2, REF_API_ID)).resolves.toMatchObject({
      slot: "sr2",
    });
    expect(await slotRow()).toMatchObject({
      sr1_referee_api_id: 5555,
      sr2_referee_api_id: REF_API_ID,
      sr2_status: "assigned",
    });
  });

  it("two concurrent claims on the same slot: exactly one wins", async () => {
    await seedGame();
    await seedReferee();
    await seedReferee(7777);
    const RIVAL = { ...CANDIDATE, srId: 7777, vorname: "Rival", nachName: "Ref" };
    mocks.searchRefereesForGame.mockImplementation(() =>
      Promise.resolve({ results: [CANDIDATE, RIVAL], total: 2 }),
    );
    mocks.submitRefereeAssignment.mockResolvedValue(SUCCESS_RESPONSE);

    const outcomes = await Promise.allSettled([
      assignReferee(SPIELPLAN_ID, 1, REF_API_ID),
      assignReferee(SPIELPLAN_ID, 1, 7777),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "SLOT_TAKEN",
    });
    // Exactly one federation submit, and the DB holds exactly one referee.
    expect(mocks.submitRefereeAssignment).toHaveBeenCalledTimes(1);
    const row = await slotRow();
    expect(row.sr1_status).toBe("assigned");
    expect([REF_API_ID, 7777]).toContain(row.sr1_referee_api_id);
  });
});

describe("assignReferee — federation rejection rolls the claim back", () => {
  it("restores the slot to open when the federation rejects", async () => {
    await seedGame();
    await seedReferee();
    mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
    mocks.submitRefereeAssignment.mockResolvedValue({
      game1: { spielplanId: SPIELPLAN_ID },
      gameInfoMessages: ["Fehler: Etwas ging schief"],
      editAnythingPossible: true,
    });

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toMatchObject({
      code: "FEDERATION_ERROR",
    });

    expect(await slotRow()).toMatchObject({
      sr1_name: null,
      sr1_referee_api_id: null,
      sr1_status: "open",
    });
    expect(await intentRows()).toEqual([]);
    expect(mocks.publishDomainEvent).not.toHaveBeenCalled();
  });

  it("restores the slot when the federation call throws", async () => {
    await seedGame();
    await seedReferee();
    mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
    mocks.submitRefereeAssignment.mockRejectedValue(new Error("network down"));

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toThrow("network down");

    expect(await slotRow()).toMatchObject({
      sr1_referee_api_id: null,
      sr1_status: "open",
    });
  });

  it("rolls back only the slot it claimed", async () => {
    await seedGame({ sr2Status: "assigned", sr2RefereeApiId: 8888, sr2Name: "Other Ref" });
    await seedReferee();
    mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
    mocks.submitRefereeAssignment.mockRejectedValue(new Error("boom"));

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toThrow("boom");

    expect(await slotRow()).toEqual({
      sr1_name: null,
      sr1_referee_api_id: null,
      sr1_status: "open",
      sr2_name: "Other Ref",
      sr2_referee_api_id: 8888,
      sr2_status: "assigned",
    });
  });

  it("does not clobber a referee a concurrent caller validly assigned mid-submit", async () => {
    await seedGame();
    await seedReferee();
    mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
    // While our submit is in flight, a rival wins the slot (e.g. the federation
    // sync writes a different referee in). The rollback is a compare-and-set on
    // THIS caller still holding the slot, so it must leave the rival alone.
    mocks.submitRefereeAssignment.mockImplementation(async () => {
      await ctx.client.query(
        `UPDATE referee_games
         SET sr1_name = 'Rival Ref', sr1_referee_api_id = 5555, sr1_status = 'assigned'
         WHERE api_match_id = $1`,
        [SPIELPLAN_ID],
      );
      throw new Error("federation timeout");
    });

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toThrow(
      "federation timeout",
    );

    expect(await slotRow()).toMatchObject({
      sr1_name: "Rival Ref",
      sr1_referee_api_id: 5555,
      sr1_status: "assigned",
    });
  });
});

describe("assignReferee — idempotent self-reclaim (#86)", () => {
  it("returns success without re-submitting when this referee already holds the slot", async () => {
    const { matchId } = await seedMatch();
    await seedGame({
      matchId,
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
      sr1Name: "Max Muster",
    });
    const refereeId = await seedReferee();
    federationAccepts();

    const result = await assignReferee(SPIELPLAN_ID, 1, REF_API_ID);

    expect(result).toEqual({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Max Muster",
    });
    // The federation already holds this referee.
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
    // The intent is (idempotently) recovered …
    expect(await intentRows()).toEqual([
      { match_id: matchId, referee_id: refereeId, slot_number: 1 },
    ]);
    // … but REFEREE_ASSIGNED is not replayed as a stale "just assigned" push.
    expect(mocks.publishDomainEvent).not.toHaveBeenCalled();
    // The stored slot is untouched.
    expect(await slotRow()).toMatchObject({
      sr1_referee_api_id: REF_API_ID,
      sr1_status: "assigned",
    });
  });

  it("recognises the reclaim on slot 2, not just slot 1", async () => {
    await seedGame({
      sr2Status: "assigned",
      sr2RefereeApiId: REF_API_ID,
      sr2Name: "Max Muster",
    });
    await seedReferee();
    federationAccepts();

    await expect(assignReferee(SPIELPLAN_ID, 2, REF_API_ID)).resolves.toMatchObject({
      slot: "sr2",
      success: true,
    });
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });

  it("a second assign does not duplicate the intent row (upsert)", async () => {
    const { matchId } = await seedMatch();
    await seedGame({ matchId });
    const refereeId = await seedReferee();
    federationAccepts();

    await assignReferee(SPIELPLAN_ID, 1, REF_API_ID);
    const first = await ctx.client.query<{ clicked_at: Date }>(
      `SELECT clicked_at FROM referee_assignment_intents`,
    );
    await assignReferee(SPIELPLAN_ID, 1, REF_API_ID); // idempotent reclaim
    const after = await ctx.client.query<{ clicked_at: Date }>(
      `SELECT clicked_at FROM referee_assignment_intents`,
    );

    expect(await intentRows()).toEqual([
      { match_id: matchId, referee_id: refereeId, slot_number: 1 },
    ]);
    expect(new Date(after.rows[0]!.clicked_at).getTime()).toBeGreaterThanOrEqual(
      new Date(first.rows[0]!.clicked_at).getTime(),
    );
  });

  it("a rival holding the slot is still SLOT_TAKEN, not a reclaim", async () => {
    await seedGame({
      sr1Status: "assigned",
      sr1RefereeApiId: 5555,
      sr1Name: "Other Ref",
    });
    await seedReferee();
    federationAccepts();

    await expect(assignReferee(SPIELPLAN_ID, 1, REF_API_ID)).rejects.toMatchObject({
      code: "SLOT_TAKEN",
    });
    expect(mocks.publishDomainEvent).not.toHaveBeenCalled();
  });
});

describe("assignRefereeAsSelf — ownership (#75, #52)", () => {
  // assignReferee itself stays unrestricted — admin/referee-assignment.routes.ts
  // and referee-claim.service.ts both call it directly and must keep assigning
  // any qualified referee. assignRefereeAsSelf is the explicit wrapper the
  // self-service route uses instead, so "forgot to pass a caller id" is a
  // missing argument (a typecheck failure), not a silently-skipped check.
  it("throws NOT_OWN_CLUB when the caller's referee is not own-club", async () => {
    const [ref] = await ctx.db
      .insert(referees)
      .values({ apiId: 4242, firstName: "Outsider", lastName: "Ref", isOwnClub: false })
      .returning({ id: referees.id });

    await expect(assignRefereeAsSelf(1, 1, 4242, ref!.id)).rejects.toMatchObject({
      code: "NOT_OWN_CLUB",
      status: 403,
    });
  });

  it("throws FORBIDDEN when assigning a different referee", async () => {
    const [ref] = await ctx.db
      .insert(referees)
      .values({ apiId: 1111, firstName: "Self", lastName: "Ref", isOwnClub: true })
      .returning({ id: referees.id });

    await expect(assignRefereeAsSelf(1, 1, 9999, ref!.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("throws FORBIDDEN when the caller's referee row no longer exists (stale session)", async () => {
    // A session can outlive the referee row it was linked to (row deleted
    // out from under it). The !refereeRow half of the guard is the one that
    // catches that — a non-existent id must fail closed like a mismatched one,
    // not throw an unrelated error or fall through.
    const NO_SUCH_REFEREE_ID = 999_999;

    await expect(
      assignRefereeAsSelf(1, 1, 4242, NO_SUCH_REFEREE_ID),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("delegates to assignReferee (unmodified) once ownership passes", async () => {
    const gameId = await seedGame();
    const refereeId = await seedReferee();
    federationAccepts();

    const result = await assignRefereeAsSelf(SPIELPLAN_ID, 1, REF_API_ID, refereeId);

    expect(result).toEqual({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Max Muster",
    });
    expect(gameId).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// unassignReferee
// ---------------------------------------------------------------------------

describe("unassignReferee", () => {
  it("clears the slot, deletes the intent and publishes referee.unassigned", async () => {
    const { matchId } = await seedMatch();
    const gameId = await seedGame({
      matchId,
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
      sr1Name: "Max Muster",
    });
    const refereeId = await seedReferee();
    await ctx.db
      .insert(refereeAssignmentIntents)
      .values({ matchId, refereeId, slotNumber: 1 });
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await unassignReferee(SPIELPLAN_ID, 1);

    expect(result).toEqual({ success: true, slot: "sr1", status: "open" });
    expect(await slotRow()).toMatchObject({
      sr1_name: null,
      sr1_referee_api_id: null,
      sr1_status: "open",
    });
    expect(await intentRows()).toEqual([]);

    const event = mocks.publishDomainEvent.mock.calls[0]![0];
    expect(event).toMatchObject({
      type: "referee.unassigned",
      entityId: refereeId,
      entityName: "Max Muster",
    });
    expect(event.payload).toMatchObject({
      role: "SR1",
      refereeName: "Max Muster",
      refereeId,
      matchId,
      deepLink: `/referee-game/${gameId}`,
    });
  });

  it("clears only the requested slot", async () => {
    await seedGame({
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
      sr1Name: "Max Muster",
      sr2Status: "assigned",
      sr2RefereeApiId: 8888,
      sr2Name: "Other Ref",
    });
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    await unassignReferee(SPIELPLAN_ID, 1);

    expect(await slotRow()).toEqual({
      sr1_name: null,
      sr1_referee_api_id: null,
      sr1_status: "open",
      sr2_name: "Other Ref",
      sr2_referee_api_id: 8888,
      sr2_status: "assigned",
    });
  });

  it("only clears the game it was asked about", async () => {
    await seedGame({ sr1Status: "assigned", sr1RefereeApiId: REF_API_ID, sr1Name: "Max" });
    await seedGame({
      apiMatchId: 55555,
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
      sr1Name: "Max",
    });
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    await unassignReferee(SPIELPLAN_ID, 1);

    expect((await slotRow(55555)).sr1_status).toBe("assigned");
  });

  it("deletes only the intent for this match, referee and slot", async () => {
    const { matchId } = await seedMatch();
    await seedGame({
      matchId,
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
      sr1Name: "Max Muster",
    });
    const refereeId = await seedReferee();
    const otherRefereeId = await seedReferee(7777);
    await ctx.db.insert(refereeAssignmentIntents).values([
      { matchId, refereeId, slotNumber: 1 },
      { matchId, refereeId, slotNumber: 2 },
      { matchId, refereeId: otherRefereeId, slotNumber: 1 },
    ]);
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    await unassignReferee(SPIELPLAN_ID, 1);

    // Collapsing the three-way AND into an OR would wipe all three rows.
    expect(await intentRows()).toEqual([
      { match_id: matchId, referee_id: otherRefereeId, slot_number: 1 },
      { match_id: matchId, referee_id: refereeId, slot_number: 2 },
    ]);
  });

  it("GAME_NOT_FOUND when the game does not exist", async () => {
    await expect(unassignReferee(99999, 1)).rejects.toMatchObject({
      code: "GAME_NOT_FOUND",
      name: "AssignmentError",
    });
    expect(mocks.submitRefereeUnassignment).not.toHaveBeenCalled();
  });

  it("GAME_NOT_FOUND for a tombstoned game (#105)", async () => {
    await seedGame({
      removedAt: new Date("2026-04-01T00:00:00Z"),
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
    });

    await expect(unassignReferee(SPIELPLAN_ID, 1)).rejects.toMatchObject({
      code: "GAME_NOT_FOUND",
    });
    expect((await slotRow()).sr1_status).toBe("assigned");
  });

  it("FEDERATION_ERROR leaves the slot assigned", async () => {
    await seedGame({
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
      sr1Name: "Max Muster",
    });
    mocks.submitRefereeUnassignment.mockResolvedValue({
      game1: { spielplanId: SPIELPLAN_ID },
      gameInfoMessages: ["Fehler beim Aufheben"],
      editAnythingPossible: true,
    });

    await expect(unassignReferee(SPIELPLAN_ID, 1)).rejects.toMatchObject({
      code: "FEDERATION_ERROR",
    });
    expect(await slotRow()).toMatchObject({
      sr1_name: "Max Muster",
      sr1_referee_api_id: REF_API_ID,
      sr1_status: "assigned",
    });
    expect(mocks.publishDomainEvent).not.toHaveBeenCalled();
  });

  it("skips intent deletion when the game has no linked match", async () => {
    await seedGame({
      matchId: null,
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
      sr1Name: "Max Muster",
    });
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await unassignReferee(SPIELPLAN_ID, 1);

    expect(result).toEqual({ success: true, slot: "sr1", status: "open" });
    expect(mocks.publishDomainEvent.mock.calls[0]![0].payload.refereeId).toBeUndefined();
  });

  it("is a no-op for an already-open slot: no federation call, no event (#77)", async () => {
    const { matchId } = await seedMatch();
    await seedGame({ matchId, sr1Status: "open", sr1RefereeApiId: null });
    const refereeId = await seedReferee();
    await ctx.db
      .insert(refereeAssignmentIntents)
      .values({ matchId, refereeId, slotNumber: 1 });
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await unassignReferee(SPIELPLAN_ID, 1);

    // Idempotent success — a double-click still answers "the slot is open".
    expect(result).toEqual({ success: true, slot: "sr1", status: "open" });
    // There is nothing to undo, so the federation is not told to clear a slot
    // that is already clear, and no referee.unassigned goes out for a referee
    // who was never there (it used to, with entityId 0 and an empty name).
    expect(mocks.submitRefereeUnassignment).not.toHaveBeenCalled();
    expect(mocks.publishDomainEvent).not.toHaveBeenCalled();
    expect(await intentRows()).toEqual([
      { match_id: matchId, referee_id: refereeId, slot_number: 1 },
    ]);
  });

  it("retracts an offered slot without emitting referee.unassigned (#77)", async () => {
    await seedGame({ sr1Status: "offered", sr1RefereeApiId: null });
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await unassignReferee(SPIELPLAN_ID, 1);

    expect(result).toEqual({ success: true, slot: "sr1", status: "open" });
    // The offer is real, so the federation is told; but nobody was assigned, so
    // there is no unassignment to announce.
    expect(mocks.submitRefereeUnassignment).toHaveBeenCalledWith(SPIELPLAN_ID, 1);
    expect((await slotRow()).sr1_status).toBe("open");
    expect(mocks.publishDomainEvent).not.toHaveBeenCalled();
  });

  it("does not clear a referee a rival assigned while the federation call was in flight (#77)", async () => {
    await seedGame({
      sr1Status: "assigned",
      sr1RefereeApiId: REF_API_ID,
      sr1Name: "Max Muster",
    });
    // The federation call is the window: another caller re-fills the slot with
    // a different referee while we are waiting on it.
    mocks.submitRefereeUnassignment.mockImplementation(async () => {
      await ctx.db
        .update(refereeGames)
        .set({ sr1RefereeApiId: 9999, sr1Name: "Rival Ref", sr1Status: "assigned" })
        .where(eq(refereeGames.apiMatchId, SPIELPLAN_ID));
      return SUCCESS_RESPONSE;
    });

    await unassignReferee(SPIELPLAN_ID, 1);

    // The clear is a compare-and-set on the referee we read, so it matches
    // nothing and the rival's assignment survives.
    expect(await slotRow()).toMatchObject({
      sr1_referee_api_id: 9999,
      sr1_name: "Rival Ref",
      sr1_status: "assigned",
    });
  });

  it("publishes entityId 0 when the assigned referee is unknown locally", async () => {
    const { matchId } = await seedMatch();
    await seedGame({
      matchId,
      sr1Status: "assigned",
      sr1RefereeApiId: 4242,
      sr1Name: "Unknown Ref",
    });
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    await unassignReferee(SPIELPLAN_ID, 1);

    const event = mocks.publishDomainEvent.mock.calls[0]![0];
    expect(event.entityId).toBe(0);
    expect(event.payload.refereeId).toBeUndefined();
  });

  it("reports the slot-2 referee name when unassigning slot 2", async () => {
    await seedGame({
      sr2Status: "assigned",
      sr2RefereeApiId: REF_API_ID,
      sr2Name: "Max Muster",
    });
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await unassignReferee(SPIELPLAN_ID, 2);

    expect(result.slot).toBe("sr2");
    const event = mocks.publishDomainEvent.mock.calls[0]![0];
    expect(event.payload.role).toBe("SR2");
    expect(event.payload.refereeName).toBe("Max Muster");
  });
});

// ---------------------------------------------------------------------------
// Pure helpers (no database involved)
// ---------------------------------------------------------------------------

describe("searchCandidates", () => {
  it("proxies to sdkClient with correct args and returns ranked results", async () => {
    mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });

    const result = await searchCandidates(SPIELPLAN_ID, "Max", 0, 15);

    expect(mocks.searchRefereesForGame).toHaveBeenCalledWith(SPIELPLAN_ID, {
      textSearch: "Max",
      pageFrom: 0,
      pageSize: 15,
    });
    expect(result).toEqual({ total: 1, results: [CANDIDATE] });
  });

  it("passes null textSearch when search is an empty string", async () => {
    mocks.searchRefereesForGame.mockResolvedValue({ results: [], total: 0 });

    await searchCandidates(SPIELPLAN_ID, "", 0, 20);

    expect(mocks.searchRefereesForGame).toHaveBeenCalledWith(SPIELPLAN_ID, {
      textSearch: null,
      pageFrom: 0,
      pageSize: 20,
    });
  });
});

describe("rankCandidates", () => {
  const makeCandidate = (
    overrides: Partial<{
      srId: number;
      vorname: string;
      nachName: string;
      lizenznr: number;
      qualiSr1: boolean;
      qualiSr2: boolean;
      srModusMismatchSr1: boolean;
      srModusMismatchSr2: boolean;
      blocktermin: boolean;
      zeitraumBlockiert: string | null;
      meta: { total: number };
    }> = {},
  ) => ({
    srId: 1,
    vorname: "A",
    nachName: "Last",
    lizenznr: 100,
    qualiSr1: true,
    qualiSr2: true,
    srModusMismatchSr1: false,
    srModusMismatchSr2: false,
    blocktermin: false,
    zeitraumBlockiert: null,
    meta: { total: 5 },
    ...overrides,
  });

  it("places eligible candidates before blocked ones", () => {
    const eligible = makeCandidate({ srId: 1 });
    const blocked = makeCandidate({ srId: 2, blocktermin: true });
    const result = rankCandidates([blocked, eligible], 1);
    expect(result.map((c) => c.srId)).toEqual([1, 2]);
  });

  it("orders eligible candidates by ascending workload", () => {
    const a = makeCandidate({ srId: 1, meta: { total: 10 } });
    const b = makeCandidate({ srId: 2, meta: { total: 3 } });
    const c = makeCandidate({ srId: 3, meta: { total: 7 } });
    const result = rankCandidates([a, b, c], 1);
    expect(result.map((x) => x.srId)).toEqual([2, 3, 1]);
  });

  it("tie-breaks equal workload by license number, then last name", () => {
    const a = makeCandidate({ srId: 1, lizenznr: 200, nachName: "Beta", meta: { total: 5 } });
    const b = makeCandidate({ srId: 2, lizenznr: 100, nachName: "Alpha", meta: { total: 5 } });
    const c = makeCandidate({ srId: 3, lizenznr: 200, nachName: "Alpha", meta: { total: 5 } });
    const result = rankCandidates([a, b, c], 1);
    expect(result.map((x) => x.srId)).toEqual([2, 3, 1]);
  });
});
