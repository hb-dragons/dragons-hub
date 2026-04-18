import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  selectCalls: [] as unknown[][],
  assignReferee: vi.fn(),
  unassignReferee: vi.fn(),
}));

let selectCallIndex = 0;

vi.mock("../../config/database", () => ({
  db: {
    select: () => {
      const idx = selectCallIndex++;
      const rows = () => mocks.selectCalls[idx] ?? [];
      return {
        from: () => ({
          where: () => {
            const result: unknown[] & { limit?: () => Promise<unknown[]> } =
              Object.assign([] as unknown[], {
                then: (resolve: (rows: unknown[]) => void) => resolve(rows()),
                limit: () => Promise.resolve(rows()),
              });
            return result;
          },
        }),
      };
    },
  },
}));

vi.mock("./referee-assignment.service", async () => {
  const actual = await vi.importActual<typeof import("./referee-assignment.service")>(
    "./referee-assignment.service",
  );
  return {
    ...actual,
    assignReferee: mocks.assignReferee,
    unassignReferee: mocks.unassignReferee,
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({ eq: [_a, _b] })),
}));

vi.mock("@dragons/db/schema", () => ({
  refereeGames: {
    id: "rg.id",
    apiMatchId: "rg.apiMatchId",
  },
  referees: { id: "r.id" },
  refereeAssignmentRules: { refereeId: "rar.refereeId" },
}));

import { claimRefereeGame, unclaimRefereeGame } from "./referee-claim.service";
import { resolveClaimableSlots } from "./referee-slot-resolver";
import { AssignmentError } from "./referee-assignment.service";

beforeEach(() => {
  mocks.selectCalls = [];
  mocks.assignReferee.mockReset();
  mocks.unassignReferee.mockReset();
  selectCallIndex = 0;
});

function queueSelects(...rows: unknown[][]) {
  mocks.selectCalls = rows;
  selectCallIndex = 0;
}

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
  const referee = {
    apiId: 9001,
    isOwnClub: true,
    allowAllHomeGames: true,
    allowAwayGames: true,
  };
  const game = {
    id: 5,
    apiMatchId: 12345,
    sr1OurClub: true,
    sr1Status: "open",
    sr2OurClub: true,
    sr2Status: "open",
    isHomeGame: true,
    homeTeamId: 42,
  };

  it("throws GAME_NOT_FOUND when game does not exist", async () => {
    queueSelects([referee], [], []);
    await expect(
      claimRefereeGame({ refereeId: 1, gameId: 999 }),
    ).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("throws NOT_QUALIFIED when referee missing", async () => {
    queueSelects([], [game], []);
    await expect(
      claimRefereeGame({ refereeId: 1, gameId: 5 }),
    ).rejects.toMatchObject({ code: "NOT_QUALIFIED" });
  });

  it("throws NOT_OWN_CLUB when referee is not own club", async () => {
    queueSelects([{ ...referee, isOwnClub: false }], [game], []);
    await expect(
      claimRefereeGame({ refereeId: 1, gameId: 5 }),
    ).rejects.toMatchObject({ code: "NOT_OWN_CLUB" });
  });

  it("throws NOT_QUALIFIED when no claimable slot exists", async () => {
    queueSelects(
      [referee],
      [{ ...game, sr1Status: "assigned", sr2Status: "assigned" }],
      [],
    );
    await expect(
      claimRefereeGame({ refereeId: 1, gameId: 5 }),
    ).rejects.toMatchObject({ code: "NOT_QUALIFIED" });
  });

  it("picks slot 1 by default when both slots are open", async () => {
    queueSelects([referee], [game], []);
    mocks.assignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Hans Muster",
    });

    const result = await claimRefereeGame({ refereeId: 1, gameId: 5 });

    expect(mocks.assignReferee).toHaveBeenCalledWith(12345, 1, 9001);
    expect(result.slot).toBe("sr1");
  });

  it("honors explicit slotNumber when claimable", async () => {
    queueSelects([referee], [game], []);
    mocks.assignReferee.mockResolvedValue({
      success: true,
      slot: "sr2",
      status: "assigned",
      refereeName: "Hans Muster",
    });

    await claimRefereeGame({ refereeId: 1, gameId: 5, slotNumber: 2 });

    expect(mocks.assignReferee).toHaveBeenCalledWith(12345, 2, 9001);
  });

  it("throws SLOT_TAKEN when requested slot is not claimable", async () => {
    queueSelects([referee], [{ ...game, sr2Status: "assigned" }], []);

    await expect(
      claimRefereeGame({ refereeId: 1, gameId: 5, slotNumber: 2 }),
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("propagates AssignmentError from assignReferee", async () => {
    queueSelects([referee], [game], []);
    mocks.assignReferee.mockRejectedValue(
      new AssignmentError("federation failed", "FEDERATION_ERROR"),
    );

    await expect(
      claimRefereeGame({ refereeId: 1, gameId: 5 }),
    ).rejects.toMatchObject({ code: "FEDERATION_ERROR" });
  });
});

describe("unclaimRefereeGame", () => {
  const referee = { apiId: 9001 };
  const gameOnSr1 = {
    id: 5,
    apiMatchId: 12345,
    sr1RefereeApiId: 9001,
    sr2RefereeApiId: null,
  };
  const gameOnSr2 = {
    id: 5,
    apiMatchId: 12345,
    sr1RefereeApiId: 777,
    sr2RefereeApiId: 9001,
  };
  const gameWithoutMe = {
    id: 5,
    apiMatchId: 12345,
    sr1RefereeApiId: 777,
    sr2RefereeApiId: 888,
  };

  it("throws NOT_QUALIFIED when referee is missing", async () => {
    queueSelects([], [gameOnSr1]);
    await expect(
      unclaimRefereeGame({ refereeId: 1, gameId: 5 }),
    ).rejects.toMatchObject({ code: "NOT_QUALIFIED" });
  });

  it("throws GAME_NOT_FOUND when game is missing", async () => {
    queueSelects([referee], []);
    await expect(
      unclaimRefereeGame({ refereeId: 1, gameId: 999 }),
    ).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("throws NOT_ASSIGNED when referee is not on this game", async () => {
    queueSelects([referee], [gameWithoutMe]);
    await expect(
      unclaimRefereeGame({ refereeId: 1, gameId: 5 }),
    ).rejects.toMatchObject({ code: "NOT_ASSIGNED" });
    expect(mocks.unassignReferee).not.toHaveBeenCalled();
  });

  it("unassigns slot 1 when referee is on sr1", async () => {
    queueSelects([referee], [gameOnSr1]);
    mocks.unassignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "open",
    });

    const result = await unclaimRefereeGame({ refereeId: 1, gameId: 5 });

    expect(mocks.unassignReferee).toHaveBeenCalledWith(12345, 1);
    expect(result.slot).toBe("sr1");
  });

  it("unassigns slot 2 when referee is on sr2", async () => {
    queueSelects([referee], [gameOnSr2]);
    mocks.unassignReferee.mockResolvedValue({
      success: true,
      slot: "sr2",
      status: "open",
    });

    await unclaimRefereeGame({ refereeId: 1, gameId: 5 });

    expect(mocks.unassignReferee).toHaveBeenCalledWith(12345, 2);
  });

  it("propagates federation errors", async () => {
    queueSelects([referee], [gameOnSr1]);
    mocks.unassignReferee.mockRejectedValue(
      new AssignmentError("federation failed", "FEDERATION_ERROR"),
    );

    await expect(
      unclaimRefereeGame({ refereeId: 1, gameId: 5 }),
    ).rejects.toMatchObject({ code: "FEDERATION_ERROR" });
  });
});
