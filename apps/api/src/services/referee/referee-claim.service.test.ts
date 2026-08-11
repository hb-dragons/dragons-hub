import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type * as RefereeAssignmentService from "./referee-assignment.service";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked (issue #110).
// This service decides *whether a referee may claim a slot* from three DB reads:
// the referee row, the game row (which must not be a tombstone) and the rules
// scoped to that referee. The old version replayed a positional array of canned
// result sets through identity-stubbed operators, so a query scoped to the wrong
// referee — or one that ignored `removed_at` — read exactly the same. These run
// against a real (in-process PGlite) Postgres.
//
// `assignReferee`/`unassignReferee` stay mocked: they own the federation round
// trip and have their own integration tests in referee-assignment.service.test.ts.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  assignReferee: vi.fn(),
  unassignReferee: vi.fn(),
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

vi.mock("./referee-assignment.service", async () => {
  const actual = await vi.importActual<typeof RefereeAssignmentService>(
    "./referee-assignment.service",
  );
  return {
    ...actual,
    assignReferee: mocks.assignReferee,
    unassignReferee: mocks.unassignReferee,
  };
});

// --- Imports (after mocks) ---

import { claimRefereeGame, unclaimRefereeGame } from "./referee-claim.service";
import { resolveClaimableSlots } from "./referee-slot-resolver";
import { AssignmentError } from "./referee-assignment.errors";
import { refereeGames, referees, teams, refereeAssignmentRules } from "@dragons/db/schema";
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
  mocks.assignReferee.mockReset();
  mocks.unassignReferee.mockReset();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Seed helpers ---

const REF_API_ID = 9001;
const API_MATCH_ID = 12345;

async function seedGame(
  seed: Partial<typeof refereeGames.$inferInsert> = {},
): Promise<number> {
  const [row] = await ctx.db
    .insert(refereeGames)
    .values({
      apiMatchId: API_MATCH_ID,
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

async function seedReferee(opts: {
  apiId?: number;
  isOwnClub?: boolean;
  allowAllHomeGames?: boolean;
  allowAwayGames?: boolean;
} = {}): Promise<number> {
  const [row] = await ctx.db
    .insert(referees)
    .values({
      apiId: opts.apiId ?? REF_API_ID,
      firstName: "Hans",
      lastName: "Muster",
      isOwnClub: opts.isOwnClub ?? true,
      allowAllHomeGames: opts.allowAllHomeGames ?? true,
      allowAwayGames: opts.allowAwayGames ?? true,
    })
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

async function seedRule(
  refereeId: number,
  teamId: number,
  rule: { deny?: boolean; allowSr1?: boolean; allowSr2?: boolean },
): Promise<void> {
  await ctx.db.insert(refereeAssignmentRules).values({
    refereeId,
    teamId,
    deny: rule.deny ?? false,
    allowSr1: rule.allowSr1 ?? false,
    allowSr2: rule.allowSr2 ?? false,
  });
}

const ASSIGN_OK = {
  success: true as const,
  slot: "sr1" as const,
  status: "assigned" as const,
  refereeName: "Hans Muster",
};

// --- Tests ---

describe("resolveClaimableSlots", () => {
  const baseGame = {
    sr1OurClub: true,
    sr1Status: "open",
    sr2OurClub: true,
    sr2Status: "open",
    isHomeGame: true,
    homeTeamId: 42,
  };

  it("returns both slots when referee allows all home games and no deny rule", () => {
    const slots = resolveClaimableSlots(
      baseGame,
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
    );
    expect(slots.sort()).toEqual([1, 2]);
  });

  it("excludes slots that are not open", () => {
    const slots = resolveClaimableSlots(
      { ...baseGame, sr1Status: "assigned" },
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
    );
    expect(slots).toEqual([2]);
  });

  it("excludes slots where our club does not hold the slot", () => {
    const slots = resolveClaimableSlots(
      { ...baseGame, sr2OurClub: false },
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
    );
    expect(slots).toEqual([1]);
  });

  it("returns empty list when deny rule matches home team", () => {
    const slots = resolveClaimableSlots(
      baseGame,
      { allowAllHomeGames: true, allowAwayGames: false },
      [{ teamId: 42, deny: true, allowSr1: false, allowSr2: false }],
    );
    expect(slots).toEqual([]);
  });

  it("respects allowlist rule with only allowSr2", () => {
    const slots = resolveClaimableSlots(
      baseGame,
      { allowAllHomeGames: false, allowAwayGames: false },
      [{ teamId: 42, deny: false, allowSr1: false, allowSr2: true }],
    );
    expect(slots).toEqual([2]);
  });

  it("returns empty list when allowlist mode has no matching rule", () => {
    const slots = resolveClaimableSlots(
      baseGame,
      { allowAllHomeGames: false, allowAwayGames: false },
      [{ teamId: 99, deny: false, allowSr1: true, allowSr2: true }],
    );
    expect(slots).toEqual([]);
  });

  it("returns empty list for away game when allowAwayGames is false", () => {
    const slots = resolveClaimableSlots(
      { ...baseGame, isHomeGame: false },
      { allowAllHomeGames: false, allowAwayGames: false },
      [],
    );
    expect(slots).toEqual([]);
  });

  it("returns open slots for away game when allowAwayGames is true", () => {
    const slots = resolveClaimableSlots(
      { ...baseGame, isHomeGame: false, sr2Status: "assigned" },
      { allowAllHomeGames: false, allowAwayGames: true },
      [],
    );
    expect(slots).toEqual([1]);
  });
});

describe("claimRefereeGame", () => {
  it("throws NOT_QUALIFIED when the referee row does not exist", async () => {
    const gameId = await seedGame();

    await expect(
      claimRefereeGame({ refereeId: 999, gameId }),
    ).rejects.toMatchObject({ code: "NOT_QUALIFIED" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("throws NOT_OWN_CLUB when the referee is not an own-club referee", async () => {
    const gameId = await seedGame();
    const refereeId = await seedReferee({ isOwnClub: false });

    await expect(
      claimRefereeGame({ refereeId, gameId }),
    ).rejects.toMatchObject({ code: "NOT_OWN_CLUB" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("throws GAME_NOT_FOUND when the game does not exist", async () => {
    const refereeId = await seedReferee();

    await expect(
      claimRefereeGame({ refereeId, gameId: 999 }),
    ).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("throws GAME_NOT_FOUND for a tombstoned game (#105)", async () => {
    const gameId = await seedGame({ removedAt: new Date("2026-04-01T00:00:00Z") });
    const refereeId = await seedReferee();

    await expect(
      claimRefereeGame({ refereeId, gameId }),
    ).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("looks up the requested game, not simply the first row", async () => {
    await seedGame({ apiMatchId: 111, sr1Status: "assigned", sr2Status: "assigned" });
    const wanted = await seedGame({ apiMatchId: 222 });
    const refereeId = await seedReferee();
    mocks.assignReferee.mockResolvedValue(ASSIGN_OK);

    await claimRefereeGame({ refereeId, gameId: wanted });

    expect(mocks.assignReferee).toHaveBeenCalledWith(222, 1, REF_API_ID);
  });

  it("throws NOT_QUALIFIED when no slot is claimable", async () => {
    const gameId = await seedGame({ sr1Status: "assigned", sr2Status: "assigned" });
    const refereeId = await seedReferee();

    await expect(
      claimRefereeGame({ refereeId, gameId }),
    ).rejects.toMatchObject({ code: "NOT_QUALIFIED" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("picks slot 1 by default when both slots are open", async () => {
    const gameId = await seedGame();
    const refereeId = await seedReferee();
    mocks.assignReferee.mockResolvedValue(ASSIGN_OK);

    const result = await claimRefereeGame({ refereeId, gameId });

    expect(mocks.assignReferee).toHaveBeenCalledWith(API_MATCH_ID, 1, REF_API_ID);
    expect(result.slot).toBe("sr1");
  });

  it("falls back to slot 2 when slot 1 is not claimable", async () => {
    const gameId = await seedGame({ sr1Status: "assigned" });
    const refereeId = await seedReferee();
    mocks.assignReferee.mockResolvedValue({ ...ASSIGN_OK, slot: "sr2" as const });

    await claimRefereeGame({ refereeId, gameId });

    expect(mocks.assignReferee).toHaveBeenCalledWith(API_MATCH_ID, 2, REF_API_ID);
  });

  it("honors an explicit claimable slotNumber", async () => {
    const gameId = await seedGame();
    const refereeId = await seedReferee();
    mocks.assignReferee.mockResolvedValue({ ...ASSIGN_OK, slot: "sr2" as const });

    await claimRefereeGame({ refereeId, gameId, slotNumber: 2 });

    expect(mocks.assignReferee).toHaveBeenCalledWith(API_MATCH_ID, 2, REF_API_ID);
  });

  it("throws SLOT_TAKEN when the requested slot is not claimable", async () => {
    const gameId = await seedGame({ sr2Status: "assigned" });
    const refereeId = await seedReferee();

    await expect(
      claimRefereeGame({ refereeId, gameId, slotNumber: 2 }),
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("applies this referee's deny rule to the game's home team", async () => {
    const teamId = await seedTeam(101);
    const gameId = await seedGame({ homeTeamId: teamId });
    const refereeId = await seedReferee();
    await seedRule(refereeId, teamId, { deny: true });

    await expect(
      claimRefereeGame({ refereeId, gameId }),
    ).rejects.toMatchObject({ code: "NOT_QUALIFIED" });
  });

  it("ignores another referee's deny rule", async () => {
    const teamId = await seedTeam(101);
    const gameId = await seedGame({ homeTeamId: teamId });
    const refereeId = await seedReferee();
    const otherRefereeId = await seedReferee({ apiId: 7777 });
    await seedRule(otherRefereeId, teamId, { deny: true });
    mocks.assignReferee.mockResolvedValue(ASSIGN_OK);

    await expect(claimRefereeGame({ refereeId, gameId })).resolves.toMatchObject({
      success: true,
    });
  });

  it("uses this referee's allowlist rule in allowlist mode", async () => {
    const teamId = await seedTeam(101);
    const gameId = await seedGame({ homeTeamId: teamId });
    const refereeId = await seedReferee({ allowAllHomeGames: false, allowAwayGames: false });
    await seedRule(refereeId, teamId, { allowSr2: true });
    mocks.assignReferee.mockResolvedValue({ ...ASSIGN_OK, slot: "sr2" as const });

    await claimRefereeGame({ refereeId, gameId });

    expect(mocks.assignReferee).toHaveBeenCalledWith(API_MATCH_ID, 2, REF_API_ID);
  });

  it("does not inherit another referee's allowlist rule", async () => {
    const teamId = await seedTeam(101);
    const gameId = await seedGame({ homeTeamId: teamId });
    const refereeId = await seedReferee({ allowAllHomeGames: false, allowAwayGames: false });
    const otherRefereeId = await seedReferee({ apiId: 7777 });
    await seedRule(otherRefereeId, teamId, { allowSr1: true, allowSr2: true });

    await expect(
      claimRefereeGame({ refereeId, gameId }),
    ).rejects.toMatchObject({ code: "NOT_QUALIFIED" });
  });

  it("propagates AssignmentError from assignReferee", async () => {
    const gameId = await seedGame();
    const refereeId = await seedReferee();
    mocks.assignReferee.mockRejectedValue(
      new AssignmentError("federation failed", "FEDERATION_ERROR"),
    );

    await expect(
      claimRefereeGame({ refereeId, gameId }),
    ).rejects.toMatchObject({ code: "FEDERATION_ERROR" });
  });
});

describe("unclaimRefereeGame", () => {
  it("throws NOT_QUALIFIED when the referee row does not exist", async () => {
    const gameId = await seedGame({ sr1RefereeApiId: REF_API_ID });

    await expect(
      unclaimRefereeGame({ refereeId: 999, gameId }),
    ).rejects.toMatchObject({ code: "NOT_QUALIFIED" });
    expect(mocks.unassignReferee).not.toHaveBeenCalled();
  });

  it("throws GAME_NOT_FOUND when the game does not exist", async () => {
    const refereeId = await seedReferee();

    await expect(
      unclaimRefereeGame({ refereeId, gameId: 999 }),
    ).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("throws GAME_NOT_FOUND for a tombstoned game (#105)", async () => {
    const gameId = await seedGame({
      sr1RefereeApiId: REF_API_ID,
      sr1Status: "assigned",
      removedAt: new Date("2026-04-01T00:00:00Z"),
    });
    const refereeId = await seedReferee();

    await expect(
      unclaimRefereeGame({ refereeId, gameId }),
    ).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
    expect(mocks.unassignReferee).not.toHaveBeenCalled();
  });

  it("throws NOT_ASSIGNED when the referee holds neither slot", async () => {
    const gameId = await seedGame({
      sr1RefereeApiId: 777,
      sr2RefereeApiId: 888,
      sr1Status: "assigned",
      sr2Status: "assigned",
    });
    const refereeId = await seedReferee();

    await expect(
      unclaimRefereeGame({ refereeId, gameId }),
    ).rejects.toMatchObject({ code: "NOT_ASSIGNED" });
    expect(mocks.unassignReferee).not.toHaveBeenCalled();
  });

  it("unassigns slot 1 when the referee holds sr1", async () => {
    const gameId = await seedGame({
      sr1RefereeApiId: REF_API_ID,
      sr1Status: "assigned",
    });
    const refereeId = await seedReferee();
    mocks.unassignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "open",
    });

    const result = await unclaimRefereeGame({ refereeId, gameId });

    expect(mocks.unassignReferee).toHaveBeenCalledWith(API_MATCH_ID, 1);
    expect(result.slot).toBe("sr1");
  });

  it("unassigns slot 2 when the referee holds sr2", async () => {
    const gameId = await seedGame({
      sr1RefereeApiId: 777,
      sr1Status: "assigned",
      sr2RefereeApiId: REF_API_ID,
      sr2Status: "assigned",
    });
    const refereeId = await seedReferee();
    mocks.unassignReferee.mockResolvedValue({
      success: true,
      slot: "sr2",
      status: "open",
    });

    await unclaimRefereeGame({ refereeId, gameId });

    expect(mocks.unassignReferee).toHaveBeenCalledWith(API_MATCH_ID, 2);
  });

  it("resolves the game by id, passing that game's apiMatchId on", async () => {
    await seedGame({ apiMatchId: 111, sr1RefereeApiId: REF_API_ID });
    const wanted = await seedGame({ apiMatchId: 222, sr1RefereeApiId: REF_API_ID });
    const refereeId = await seedReferee();
    mocks.unassignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "open",
    });

    await unclaimRefereeGame({ refereeId, gameId: wanted });

    expect(mocks.unassignReferee).toHaveBeenCalledWith(222, 1);
  });

  it("propagates federation errors", async () => {
    const gameId = await seedGame({
      sr1RefereeApiId: REF_API_ID,
      sr1Status: "assigned",
    });
    const refereeId = await seedReferee();
    mocks.unassignReferee.mockRejectedValue(
      new AssignmentError("federation failed", "FEDERATION_ERROR"),
    );

    await expect(
      unclaimRefereeGame({ refereeId, gameId }),
    ).rejects.toMatchObject({ code: "FEDERATION_ERROR" });
  });
});
