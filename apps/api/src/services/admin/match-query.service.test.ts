import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

vi.mock("../../config/database", () => ({
  db: {},
}));

vi.mock("@dragons/db/schema", () => ({
  matches: {},
  teams: {},
  leagues: {},
  venues: {},
  matchOverrides: {},
  matchRemoteVersions: {
    matchId: "matchId",
    versionNumber: "versionNumber",
    snapshot: "snapshot",
  },
  venueBookingMatches: {},
  venueBookings: {},
  matchReferees: {},
  referees: {},
  refereeRoles: {},
  refereeAssignmentIntents: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: "eq", args })),
  sql: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  or: vi.fn(),
  inArray: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: vi.fn((_table: unknown, name: string) => ({ __alias: name })),
}));

vi.mock("./match-diff.service", () => ({
  computeDiffs: vi.fn(() => []),
}));

// --- Imports (after mocks) ---

import { rowToListItem, rowToDetail, loadRemoteSnapshot } from "./match-query.service";
import type { MatchRow } from "./match-query.service";
import type { OverrideInfo } from "@dragons/shared";

// --- Helpers ---

function makeMatchRow(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    id: 1,
    apiMatchId: 10001,
    matchNo: 42,
    matchDay: 5,
    kickoffDate: "2026-03-20",
    kickoffTime: "19:30",
    homeTeamApiId: 100,
    homeTeamName: "Dragons Home",
    homeTeamNameShort: "DRG",
    homeTeamCustomName: null,
    homeClubId: 500,
    guestTeamApiId: 200,
    guestTeamName: "Visitors Away",
    guestTeamNameShort: "VIS",
    guestTeamCustomName: null,
    guestClubId: 600,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeBadgeColor: "#FF0000",
    guestBadgeColor: "#0000FF",
    homeScore: 78,
    guestScore: 65,
    leagueId: 10,
    leagueName: "Bezirksliga",
    venueId: 5,
    venueName: "Sporthalle Nord",
    venueStreet: "Hauptstr. 1",
    venuePostalCode: "12345",
    venueCity: "Musterstadt",
    venueNameOverride: null,
    isConfirmed: true,
    isForfeited: false,
    isCancelled: false,
    currentLocalVersion: 0,
    currentRemoteVersion: 1,
    homeHalftimeScore: 40,
    guestHalftimeScore: 30,
    periodFormat: "4x10",
    homeQ1: 20,
    guestQ1: 15,
    homeQ2: 20,
    guestQ2: 15,
    homeQ3: 18,
    guestQ3: 17,
    homeQ4: 20,
    guestQ4: 18,
    homeQ5: null,
    guestQ5: null,
    homeQ6: null,
    guestQ6: null,
    homeQ7: null,
    guestQ7: null,
    homeQ8: null,
    guestQ8: null,
    homeOt1: null,
    guestOt1: null,
    homeOt2: null,
    guestOt2: null,
    anschreiber: null,
    zeitnehmer: null,
    shotclock: null,
    internalNotes: null,
    publicComment: null,
    sr1Open: false,
    sr2Open: false,
    sr3Open: false,
    lastRemoteSync: new Date("2026-03-19T10:00:00Z"),
    createdAt: new Date("2026-01-15T08:00:00Z"),
    updatedAt: new Date("2026-03-19T10:00:00Z"),
    ...overrides,
  } as MatchRow;
}

describe("rowToListItem", () => {
  it("maps all fields correctly from a MatchRow", () => {
    const row = makeMatchRow();
    const result = rowToListItem(row, ["kickoffDate"]);

    expect(result.id).toBe(1);
    expect(result.apiMatchId).toBe(10001);
    expect(result.matchNo).toBe(42);
    expect(result.matchDay).toBe(5);
    expect(result.kickoffDate).toBe("2026-03-20");
    expect(result.kickoffTime).toBe("19:30");
    expect(result.homeTeamApiId).toBe(100);
    expect(result.homeTeamName).toBe("Dragons Home");
    expect(result.homeTeamNameShort).toBe("DRG");
    expect(result.homeTeamCustomName).toBeNull();
    expect(result.guestTeamApiId).toBe(200);
    expect(result.guestTeamName).toBe("Visitors Away");
    expect(result.guestTeamNameShort).toBe("VIS");
    expect(result.guestTeamCustomName).toBeNull();
    expect(result.homeIsOwnClub).toBe(true);
    expect(result.guestIsOwnClub).toBe(false);
    expect(result.homeBadgeColor).toBe("#FF0000");
    expect(result.guestBadgeColor).toBe("#0000FF");
    expect(result.homeScore).toBe(78);
    expect(result.guestScore).toBe(65);
    expect(result.leagueId).toBe(10);
    expect(result.leagueName).toBe("Bezirksliga");
    expect(result.venueId).toBe(5);
    expect(result.venueName).toBe("Sporthalle Nord");
    expect(result.venueStreet).toBe("Hauptstr. 1");
    expect(result.venuePostalCode).toBe("12345");
    expect(result.venueCity).toBe("Musterstadt");
    expect(result.venueNameOverride).toBeNull();
    expect(result.isConfirmed).toBe(true);
    expect(result.isForfeited).toBe(false);
    expect(result.isCancelled).toBe(false);
    expect(result.anschreiber).toBeNull();
    expect(result.zeitnehmer).toBeNull();
    expect(result.shotclock).toBeNull();
    expect(result.publicComment).toBeNull();
    expect(result.overriddenFields).toEqual(["kickoffDate"]);
    expect(result.booking).toBeNull();
  });

  it("defaults homeIsOwnClub to false when null", () => {
    const row = makeMatchRow({ homeIsOwnClub: null as unknown as boolean });
    const result = rowToListItem(row, []);
    expect(result.homeIsOwnClub).toBe(false);
  });

  it("defaults guestIsOwnClub to false when null", () => {
    const row = makeMatchRow({ guestIsOwnClub: null as unknown as boolean });
    const result = rowToListItem(row, []);
    expect(result.guestIsOwnClub).toBe(false);
  });

  it("sets hasLocalChanges to true when currentLocalVersion > 0", () => {
    const row = makeMatchRow({ currentLocalVersion: 3 });
    const result = rowToListItem(row, []);
    expect(result.hasLocalChanges).toBe(true);
  });

  it("sets hasLocalChanges to false when currentLocalVersion is 0", () => {
    const row = makeMatchRow({ currentLocalVersion: 0 });
    const result = rowToListItem(row, []);
    expect(result.hasLocalChanges).toBe(false);
  });

  it("always sets booking to null", () => {
    const row = makeMatchRow();
    const result = rowToListItem(row, []);
    expect(result.booking).toBeNull();
  });

  it("passes through overriddenFields array", () => {
    const row = makeMatchRow();
    const fields = ["kickoffDate", "kickoffTime", "homeScore"];
    const result = rowToListItem(row, fields);
    expect(result.overriddenFields).toEqual(fields);
  });

  it("passes empty overriddenFields array", () => {
    const row = makeMatchRow();
    const result = rowToListItem(row, []);
    expect(result.overriddenFields).toEqual([]);
  });
});

describe("rowToDetail", () => {
  it("extends rowToListItem with detail fields", () => {
    const row = makeMatchRow({
      homeHalftimeScore: 40,
      guestHalftimeScore: 30,
      periodFormat: "quarters",
      internalNotes: "Some internal note",
    });
    const overrides: OverrideInfo[] = [
      { fieldName: "kickoffDate", reason: "Weather", changedBy: "admin", createdAt: "2026-03-18T12:00:00.000Z" },
    ];

    const result = rowToDetail(row, ["kickoffDate"], overrides);

    // List item fields
    expect(result.id).toBe(1);
    expect(result.homeTeamName).toBe("Dragons Home");
    expect(result.hasLocalChanges).toBe(false);
    expect(result.booking).toBeNull();

    // Detail-specific fields
    expect(result.homeHalftimeScore).toBe(40);
    expect(result.guestHalftimeScore).toBe(30);
    expect(result.periodFormat).toBe("quarters");
    expect(result.homeQ1).toBe(20);
    expect(result.guestQ1).toBe(15);
    expect(result.homeQ2).toBe(20);
    expect(result.guestQ2).toBe(15);
    expect(result.homeQ3).toBe(18);
    expect(result.guestQ3).toBe(17);
    expect(result.homeQ4).toBe(20);
    expect(result.guestQ4).toBe(18);
    expect(result.homeOt1).toBeNull();
    expect(result.guestOt1).toBeNull();
    expect(result.homeOt2).toBeNull();
    expect(result.guestOt2).toBeNull();
    expect(result.internalNotes).toBe("Some internal note");
  });

  it("converts createdAt to ISO string", () => {
    const row = makeMatchRow({ createdAt: new Date("2026-01-15T08:00:00.000Z") });
    const result = rowToDetail(row, [], []);
    expect(result.createdAt).toBe("2026-01-15T08:00:00.000Z");
  });

  it("converts updatedAt to ISO string", () => {
    const row = makeMatchRow({ updatedAt: new Date("2026-03-19T10:30:00.000Z") });
    const result = rowToDetail(row, [], []);
    expect(result.updatedAt).toBe("2026-03-19T10:30:00.000Z");
  });

  it("includes overrides array in result", () => {
    const overrides: OverrideInfo[] = [
      { fieldName: "kickoffDate", reason: "Weather delay", changedBy: "admin", createdAt: "2026-03-18T12:00:00.000Z" },
      { fieldName: "homeScore", reason: "Correction", changedBy: "scorer", createdAt: "2026-03-19T14:00:00.000Z" },
    ];
    const result = rowToDetail(makeMatchRow(), ["kickoffDate", "homeScore"], overrides);
    expect(result.overrides).toEqual(overrides);
    expect(result.overrides).toHaveLength(2);
  });

  it("includes empty overrides array", () => {
    const result = rowToDetail(makeMatchRow(), [], []);
    expect(result.overrides).toEqual([]);
  });

  it("includes period Q5-Q8 fields", () => {
    const row = makeMatchRow({
      homeQ5: 10,
      guestQ5: 8,
      homeQ6: 12,
      guestQ6: 11,
      homeQ7: null,
      guestQ7: null,
      homeQ8: null,
      guestQ8: null,
    });
    const result = rowToDetail(row, [], []);
    expect(result.homeQ5).toBe(10);
    expect(result.guestQ5).toBe(8);
    expect(result.homeQ6).toBe(12);
    expect(result.guestQ6).toBe(11);
    expect(result.homeQ7).toBeNull();
    expect(result.guestQ7).toBeNull();
    expect(result.homeQ8).toBeNull();
    expect(result.guestQ8).toBeNull();
  });
});

describe("loadRemoteSnapshot", () => {
  it("returns null when remoteVersion is 0", async () => {
    const mockClient = {} as Parameters<typeof loadRemoteSnapshot>[0];
    const result = await loadRemoteSnapshot(mockClient, 1, 0);
    expect(result).toBeNull();
  });

  it("returns null when remoteVersion is negative", async () => {
    const mockClient = {} as Parameters<typeof loadRemoteSnapshot>[0];
    const result = await loadRemoteSnapshot(mockClient, 1, -1);
    expect(result).toBeNull();
  });

  it("returns snapshot when found in database", async () => {
    const snapshotData = { kickoffDate: "2026-03-20", kickoffTime: "19:30" };
    const mockLimit = vi.fn().mockResolvedValue([{ snapshot: snapshotData }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const mockClient = { select: mockSelect } as unknown as Parameters<typeof loadRemoteSnapshot>[0];

    const result = await loadRemoteSnapshot(mockClient, 42, 3);

    expect(result).toEqual(snapshotData);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it("returns null when no snapshot row is found", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const mockClient = { select: mockSelect } as unknown as Parameters<typeof loadRemoteSnapshot>[0];

    const result = await loadRemoteSnapshot(mockClient, 42, 3);

    expect(result).toBeNull();
  });

  it("returns null when snapshot row has undefined snapshot", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ snapshot: undefined }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const mockClient = { select: mockSelect } as unknown as Parameters<typeof loadRemoteSnapshot>[0];

    const result = await loadRemoteSnapshot(mockClient, 42, 3);

    expect(result).toBeNull();
  });
});
