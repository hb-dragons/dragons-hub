// apps/api/src/services/referee/referee-assignment.service.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  selectCalls: [] as unknown[][],
  updateWhere: vi.fn().mockResolvedValue(undefined),
  insertOnConflict: vi.fn().mockResolvedValue(undefined),
  deleteWhere: vi.fn().mockResolvedValue(undefined),
  searchRefereesForGame: vi.fn(),
  submitRefereeAssignment: vi.fn(),
  submitRefereeUnassignment: vi.fn(),
  publishDomainEvent: vi.fn().mockResolvedValue({ id: "evt-1" }),
}));

let selectCallIndex = 0;

vi.mock("../../config/database", () => ({
  db: {
    select: () => {
      const idx = selectCallIndex++;
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(mocks.selectCalls[idx] ?? []),
          }),
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve(mocks.selectCalls[idx] ?? []),
            }),
          }),
        }),
      };
    },
    update: () => ({ set: () => ({ where: mocks.updateWhere }) }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: mocks.insertOnConflict }),
    }),
    delete: () => ({ where: mocks.deleteWhere }),
  },
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

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({ eq: [_a, _b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((_col: unknown, vals: unknown) => ({ inArray: vals })),
}));

vi.mock("@dragons/db/schema", () => ({
  refereeGames: { apiMatchId: "rg.apiMatchId", matchId: "rg.matchId" },
  referees: { apiId: "r.apiId", id: "r.id" },
  matches: { id: "m.id", homeTeamApiId: "m.homeTeamApiId", guestTeamApiId: "m.guestTeamApiId" },
  teams: { id: "t.id", apiTeamPermanentId: "t.apiTeamPermanentId" },
  refereeAssignmentRules: { refereeId: "rar.refereeId", teamId: "rar.teamId", deny: "rar.deny" },
  refereeAssignmentIntents: { matchId: "rai.matchId", refereeId: "rai.refereeId", slotNumber: "rai.slotNumber" },
}));

import { assignReferee, unassignReferee, searchCandidates, AssignmentError } from "./referee-assignment.service";

const GAME_ROW = {
  id: 1, apiMatchId: 12345, matchId: 100, matchNo: 42,
  homeTeamName: "Dragons A", guestTeamName: "Lions B",
  sr1Status: "open", sr2Status: "open",
  sr1Name: null, sr2Name: null,
  sr1RefereeApiId: null, sr2RefereeApiId: null,
};

const REFEREE_ROW = { id: 7, apiId: 9001, firstName: "Max", lastName: "Muster" };

const CANDIDATE = {
  srId: 9001, vorname: "Max", nachName: "Muster",
  email: "max@example.com", lizenznr: 12345,
  strasse: "Musterstr. 1", plz: "12345", ort: "Berlin",
  distanceKm: "5.2", qmaxSr1: null, qmaxSr2: null,
  warning: [], meta: {} as never,
  qualiSr1: true, qualiSr2: true, qualiSr3: false, qualiCoa: false, qualiKom: false,
  srModusMismatchSr1: false, srModusMismatchSr2: false,
  ansetzungAmTag: false, blocktermin: false, zeitraumBlockiert: null, srGruppen: [],
};

const SUCCESS_RESPONSE = {
  game1: { spielplanId: 12345 },
  gameInfoMessages: ["Änderungen erfolgreich übernommen"],
  editAnythingPossible: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  selectCallIndex = 0;
  mocks.selectCalls = [];
});

describe("assignReferee", () => {
  it("happy path slot 1: returns success with refereeName, updates db, publishes event", async () => {
    // selects: game, referee, match (deny check), teams (deny check), rules (deny check)
    mocks.selectCalls = [
      [GAME_ROW],
      [REFEREE_ROW],
      [{ homeTeamApiId: 201, guestTeamApiId: 202 }],
      [{ id: 10 }, { id: 11 }],
      [], // no deny rules
    ];
    mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
    mocks.submitRefereeAssignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await assignReferee(12345, 1, 9001);

    expect(result).toEqual({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Max Muster",
    });

    // Update should be called with sr1 fields
    expect(mocks.updateWhere).toHaveBeenCalledOnce();

    // Intent upsert should happen (matchId is non-null)
    expect(mocks.insertOnConflict).toHaveBeenCalledOnce();

    // Event published
    expect(mocks.publishDomainEvent).toHaveBeenCalledOnce();
    const eventCall = mocks.publishDomainEvent.mock.calls[0]![0];
    expect(eventCall.type).toBe("referee.assigned");
    expect(eventCall.payload.role).toBe("SR1");
    expect(eventCall.payload.refereeName).toBe("Max Muster");
  });

  it("happy path slot 2: returns success with sr2 slot", async () => {
    mocks.selectCalls = [
      [GAME_ROW],
      [REFEREE_ROW],
      [{ homeTeamApiId: 201, guestTeamApiId: 202 }],
      [{ id: 10 }, { id: 11 }],
      [],
    ];
    mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
    mocks.submitRefereeAssignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await assignReferee(12345, 2, 9001);

    expect(result).toEqual({
      success: true,
      slot: "sr2",
      status: "assigned",
      refereeName: "Max Muster",
    });

    // Event role should be SR2
    const eventCall = mocks.publishDomainEvent.mock.calls[0]![0];
    expect(eventCall.payload.role).toBe("SR2");
  });

  it("GAME_NOT_FOUND: throws AssignmentError when game not in refereeGames", async () => {
    mocks.selectCalls = [[]]; // no game found

    await expect(assignReferee(99999, 1, 9001)).rejects.toMatchObject({
      code: "GAME_NOT_FOUND",
      name: "AssignmentError",
    });

    // No SDK call should happen
    expect(mocks.searchRefereesForGame).not.toHaveBeenCalled();
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });

  it("NOT_QUALIFIED (referee not in federation getRefs): throws AssignmentError", async () => {
    mocks.selectCalls = [
      [GAME_ROW],
      [REFEREE_ROW],
      [{ homeTeamApiId: 201, guestTeamApiId: 202 }],
      [{ id: 10 }, { id: 11 }],
      [],
    ];
    // Candidate list doesn't include our referee
    mocks.searchRefereesForGame.mockResolvedValue({ results: [], total: 0 });

    await expect(assignReferee(12345, 1, 9001)).rejects.toMatchObject({
      code: "NOT_QUALIFIED",
      name: "AssignmentError",
    });

    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });

  it("NOT_QUALIFIED: throws when referee not in local referees table", async () => {
    mocks.selectCalls = [
      [GAME_ROW],
      [], // referee not found
    ];

    await expect(assignReferee(12345, 1, 9001)).rejects.toMatchObject({
      code: "NOT_QUALIFIED",
      name: "AssignmentError",
    });

    expect(mocks.searchRefereesForGame).not.toHaveBeenCalled();
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });

  it("DENY_RULE: throws when deny rule found for one of the teams", async () => {
    mocks.selectCalls = [
      [GAME_ROW],
      [REFEREE_ROW],
      [{ homeTeamApiId: 201, guestTeamApiId: 202 }],
      [{ id: 10 }, { id: 11 }],
      [{ id: 99, refereeId: 7, teamId: 10, deny: true }], // deny rule found
    ];

    await expect(assignReferee(12345, 1, 9001)).rejects.toMatchObject({
      code: "DENY_RULE",
      name: "AssignmentError",
    });

    expect(mocks.searchRefereesForGame).not.toHaveBeenCalled();
    expect(mocks.submitRefereeAssignment).not.toHaveBeenCalled();
  });

  it("FEDERATION_ERROR: throws when submit response missing success message", async () => {
    mocks.selectCalls = [
      [GAME_ROW],
      [REFEREE_ROW],
      [{ homeTeamApiId: 201, guestTeamApiId: 202 }],
      [{ id: 10 }, { id: 11 }],
      [],
    ];
    mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
    mocks.submitRefereeAssignment.mockResolvedValue({
      game1: { spielplanId: 12345 },
      gameInfoMessages: ["Fehler: Etwas ging schief"],
      editAnythingPossible: true,
    });

    await expect(assignReferee(12345, 1, 9001)).rejects.toMatchObject({
      code: "FEDERATION_ERROR",
      name: "AssignmentError",
    });

    // No db update or event on federation failure
    expect(mocks.updateWhere).not.toHaveBeenCalled();
    expect(mocks.publishDomainEvent).not.toHaveBeenCalled();
  });

  it("skips deny check when matchId is null", async () => {
    const gameWithNoMatch = { ...GAME_ROW, matchId: null };
    // Only 2 DB selects: game + referee (no deny check queries)
    mocks.selectCalls = [
      [gameWithNoMatch],
      [REFEREE_ROW],
    ];
    mocks.searchRefereesForGame.mockResolvedValue({ results: [CANDIDATE], total: 1 });
    mocks.submitRefereeAssignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await assignReferee(12345, 1, 9001);

    expect(result.success).toBe(true);
    // Only 2 select calls were made (selectCallIndex should be 2)
    expect(selectCallIndex).toBe(2);

    // No intent upsert since matchId is null
    expect(mocks.insertOnConflict).not.toHaveBeenCalled();
  });
});

describe("unassignReferee", () => {
  it("happy path: returns success, clears slot, publishes event", async () => {
    const gameWithSr1 = {
      ...GAME_ROW,
      sr1RefereeApiId: 9001,
      sr1Name: "Max Muster",
      sr1Status: "assigned",
    };
    mocks.selectCalls = [
      [gameWithSr1],
      [REFEREE_ROW], // lookup referee by srApiId for intent deletion
    ];
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await unassignReferee(12345, 1);

    expect(result).toEqual({
      success: true,
      slot: "sr1",
      status: "open",
    });

    expect(mocks.updateWhere).toHaveBeenCalledOnce();
    expect(mocks.deleteWhere).toHaveBeenCalledOnce();
    expect(mocks.publishDomainEvent).toHaveBeenCalledOnce();
    const eventCall = mocks.publishDomainEvent.mock.calls[0]![0];
    expect(eventCall.type).toBe("referee.unassigned");
  });

  it("GAME_NOT_FOUND: throws when game not found", async () => {
    mocks.selectCalls = [[]];

    await expect(unassignReferee(99999, 1)).rejects.toMatchObject({
      code: "GAME_NOT_FOUND",
      name: "AssignmentError",
    });

    expect(mocks.submitRefereeUnassignment).not.toHaveBeenCalled();
  });

  it("FEDERATION_ERROR: throws when submit response missing success message", async () => {
    mocks.selectCalls = [[GAME_ROW]];
    mocks.submitRefereeUnassignment.mockResolvedValue({
      game1: { spielplanId: 12345 },
      gameInfoMessages: ["Fehler beim Aufheben"],
      editAnythingPossible: true,
    });

    await expect(unassignReferee(12345, 1)).rejects.toMatchObject({
      code: "FEDERATION_ERROR",
      name: "AssignmentError",
    });

    expect(mocks.updateWhere).not.toHaveBeenCalled();
    expect(mocks.publishDomainEvent).not.toHaveBeenCalled();
  });

  it("skips intent deletion when matchId is null", async () => {
    const gameNoMatch = { ...GAME_ROW, matchId: null, sr1Name: "Max Muster", sr1RefereeApiId: 9001, sr1Status: "assigned" };
    mocks.selectCalls = [[gameNoMatch]];
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await unassignReferee(12345, 1);

    expect(result).toEqual({ success: true, slot: "sr1", status: "open" });
    expect(mocks.deleteWhere).not.toHaveBeenCalled();
    expect(mocks.publishDomainEvent).toHaveBeenCalled();
  });

  it("skips intent deletion when slot has no refereeApiId", async () => {
    // Slot is open (no referee assigned) but someone calls unassign anyway
    const gameEmptySlot = { ...GAME_ROW, matchId: 100, sr1Name: null, sr1RefereeApiId: null };
    mocks.selectCalls = [[gameEmptySlot]];
    mocks.submitRefereeUnassignment.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await unassignReferee(12345, 1);

    expect(result).toEqual({ success: true, slot: "sr1", status: "open" });
    expect(mocks.deleteWhere).not.toHaveBeenCalled();
  });
});

describe("searchCandidates", () => {
  it("proxies to sdkClient with correct args and returns result", async () => {
    const mockResponse = { results: [CANDIDATE], total: 1 };
    mocks.searchRefereesForGame.mockResolvedValue(mockResponse);

    const result = await searchCandidates(12345, "Max", 0, 15);

    expect(mocks.searchRefereesForGame).toHaveBeenCalledWith(12345, {
      textSearch: "Max",
      pageFrom: 0,
      pageSize: 15,
    });
    expect(result).toBe(mockResponse);
  });

  it("passes null textSearch when search is empty string", async () => {
    const mockResponse = { results: [], total: 0 };
    mocks.searchRefereesForGame.mockResolvedValue(mockResponse);

    await searchCandidates(12345, "", 0, 20);

    expect(mocks.searchRefereesForGame).toHaveBeenCalledWith(12345, {
      textSearch: null,
      pageFrom: 0,
      pageSize: 20,
    });
  });
});
