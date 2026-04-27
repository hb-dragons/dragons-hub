import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SdkTeamRef } from "@dragons/sdk";

// --- Mock setup ---

const mockLogInfo = vi.fn();
vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: (...args: unknown[]) => mockLogInfo(...args),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const mockGetClubConfig = vi.fn();
vi.mock("../admin/settings.service", () => ({
  getClubConfig: (...args: unknown[]) => mockGetClubConfig(...args),
}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  teams: {
    apiTeamPermanentId: "apiTeamPermanentId",
    id: "id",
    dataHash: "dataHash",
    createdAt: "createdAt",
    clubId: "clubId",
    isOwnClub: "isOwnClub",
    displayOrder: "displayOrder",
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: (...args: unknown[]) => args,
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  ne: vi.fn((...args: unknown[]) => ({ ne: args })),
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
}));

vi.mock("./hash", () => ({
  computeEntityHash: vi.fn(() => "hash-123"),
}));

import { syncTeamsFromData, buildTeamIdLookup } from "./teams.sync";

const FROZEN_TIME = new Date("2025-06-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_TIME);
  mockGetClubConfig.mockResolvedValue({ clubId: 4121, clubName: "Dragons" });
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Helpers ---

/**
 * Returns a mock chain for db.select(...).from(...).where(...) → resolves to `rows`.
 * Used because the new sync calls db.select multiple times (existingIds, getMaxOwnDisplayOrder,
 * toMarkOwn, flippedViaUpsert).
 */
function mockSelectChain(rows: unknown[] = []) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  return { from };
}

/** Default select mock: no existing rows, maxOrder = -1 (no own teams yet). */
function setupDefaultSelectMock() {
  mockSelect
    // existingIds lookup → no existing rows
    .mockReturnValueOnce(mockSelectChain([]))
    // getMaxOwnDisplayOrder → -1
    .mockReturnValueOnce(mockSelectChain([{ maxOrder: null }]))
    // toMarkOwn → no rows
    .mockReturnValueOnce(mockSelectChain([]))
    // getMaxOwnDisplayOrder (corrective pass) → -1
    .mockReturnValueOnce(mockSelectChain([{ maxOrder: null }]));
  // flippedViaUpsert is only called when flippingToOwnIds.size > 0 → not needed in default
  // After all .mockReturnValueOnce exhausted, falls back to default (unconfigured) — tests
  // that need more calls must set up their own chain.
}

function makeTeamRef(overrides: Partial<SdkTeamRef> = {}): SdkTeamRef {
  return {
    teamPermanentId: 1,
    seasonTeamId: 10,
    teamCompetitionId: 100,
    teamname: "Test Team",
    teamnameSmall: "TT",
    clubId: 4121,
    verzicht: false,
    ...overrides,
  };
}

function mockInsertChain(returningRows: unknown[] = []) {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returningRows),
      }),
    }),
  };
}

function mockUpdateReturningChain(returningRows: unknown[] = []) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returningRows),
      }),
    }),
  };
}

describe("syncTeamsFromData", () => {
  it("returns early for empty map", async () => {
    const result = await syncTeamsFromData(new Map());

    expect(result.total).toBe(0);
    expect(result.created).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates new teams", async () => {
    setupDefaultSelectMock();
    const teamsMap = new Map([[1, makeTeamRef()]]);
    mockInsert.mockReturnValue(mockInsertChain([{ id: 1, createdAt: FROZEN_TIME }]));
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));

    const result = await syncTeamsFromData(teamsMap);

    expect(result.total).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it("detects updated teams by createdAt mismatch", async () => {
    setupDefaultSelectMock();
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const teamsMap = new Map([[1, makeTeamRef()]]);
    mockInsert.mockReturnValue(mockInsertChain([{ id: 1, createdAt: oldDate }]));
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));

    const result = await syncTeamsFromData(teamsMap);

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
  });

  it("calculates skipped count correctly", async () => {
    setupDefaultSelectMock();
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const teamsMap = new Map([
      [1, makeTeamRef({ teamPermanentId: 1 })],
      [2, makeTeamRef({ teamPermanentId: 2 })],
      [3, makeTeamRef({ teamPermanentId: 3 })],
    ]);
    // Only 1 returned = 2 skipped
    mockInsert.mockReturnValue(mockInsertChain([{ id: 1, createdAt: oldDate }]));
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));

    const result = await syncTeamsFromData(teamsMap);

    expect(result.total).toBe(3);
    expect(result.skipped).toBe(2);
  });

  it("handles batch error", async () => {
    setupDefaultSelectMock();
    const teamsMap = new Map([[1, makeTeamRef()]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("Batch failed")),
        }),
      }),
    });
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));

    const result = await syncTeamsFromData(teamsMap);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Batch team sync failed");
  });

  it("handles non-Error batch failure", async () => {
    setupDefaultSelectMock();
    const teamsMap = new Map([[1, makeTeamRef()]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue("string error"),
        }),
      }),
    });
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));

    const result = await syncTeamsFromData(teamsMap);

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("logs batch result to logger with 'updated' action when changes exist", async () => {
    setupDefaultSelectMock();
    const teamsMap = new Map([[1, makeTeamRef()]]);
    mockInsert.mockReturnValue(mockInsertChain([{ id: 1, createdAt: FROZEN_TIME }]));
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));
    const mockLogger = { log: vi.fn() };

    await syncTeamsFromData(teamsMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "team", entityId: "batch", action: "updated" }),
    );
  });

  it("logs batch result with 'skipped' action when all entries are skipped", async () => {
    setupDefaultSelectMock();
    const teamsMap = new Map([[1, makeTeamRef()]]);
    mockInsert.mockReturnValue(mockInsertChain([]));
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));
    const mockLogger = { log: vi.fn() };

    await syncTeamsFromData(teamsMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "team", entityId: "batch", action: "skipped" }),
    );
  });

  it("logs failure to logger", async () => {
    setupDefaultSelectMock();
    const teamsMap = new Map([[1, makeTeamRef()]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("fail")),
        }),
      }),
    });
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));
    const mockLogger = { log: vi.fn() };

    await syncTeamsFromData(teamsMap, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });

  it("sets isOwnClub based on club config", async () => {
    setupDefaultSelectMock();
    const teamsMap = new Map([
      [1, makeTeamRef({ clubId: 4121 })],
      [2, makeTeamRef({ teamPermanentId: 2, clubId: 9999 })],
    ]);
    const chain = mockInsertChain([]);
    mockInsert.mockReturnValue(chain);
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));

    await syncTeamsFromData(teamsMap);

    const records = chain.values.mock.calls[0]![0];
    const ownTeam = records.find((r: { apiTeamPermanentId: number }) => r.apiTeamPermanentId === 1);
    const otherTeam = records.find((r: { apiTeamPermanentId: number }) => r.apiTeamPermanentId === 2);
    expect(ownTeam.isOwnClub).toBe(true);
    expect(otherTeam.isOwnClub).toBe(false);
  });

  it("defaults ownClubId to 0 when no club config", async () => {
    mockGetClubConfig.mockResolvedValue(null);
    // No corrective pass when ownClubId=0, but existingIds + getMaxOwnDisplayOrder still called
    mockSelect
      .mockReturnValueOnce(mockSelectChain([]))  // existingIds
      .mockReturnValueOnce(mockSelectChain([{ maxOrder: null }])); // getMaxOwnDisplayOrder
    const teamsMap = new Map([[1, makeTeamRef({ clubId: 4121 })]]);
    const chain = mockInsertChain([]);
    mockInsert.mockReturnValue(chain);

    await syncTeamsFromData(teamsMap);

    const records = chain.values.mock.calls[0]![0];
    expect(records[0].isOwnClub).toBe(false);
    // Should not call update when ownClubId is 0
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("includes durationMs", async () => {
    const result = await syncTeamsFromData(new Map());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles empty teamnameSmall", async () => {
    setupDefaultSelectMock();
    const teamsMap = new Map([[1, makeTeamRef({ teamnameSmall: "" })]]);
    const chain = mockInsertChain([]);
    mockInsert.mockReturnValue(chain);
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));

    await syncTeamsFromData(teamsMap);

    const records = chain.values.mock.calls[0]![0];
    expect(records[0].nameShort).toBeNull();
  });

  it("corrective pass marks own-club teams", async () => {
    // toMarkOwn returns 1 row (hash-skipped flip-to-true), unmarkOwn returns 0
    mockSelect
      .mockReturnValueOnce(mockSelectChain([]))               // existingIds
      .mockReturnValueOnce(mockSelectChain([{ maxOrder: null }])) // getMaxOwnDisplayOrder (pre-upsert)
      .mockReturnValueOnce(mockSelectChain([{ id: 5 }]))      // toMarkOwn → 1 row
      .mockReturnValueOnce(mockSelectChain([{ maxOrder: null }])); // getMaxOwnDisplayOrder (corrective)
    const teamsMap = new Map([[1, makeTeamRef()]]);
    mockInsert.mockReturnValue(mockInsertChain([]));
    // per-row update for toMarkOwn[0], then bulk unmarkOwn
    mockUpdate
      .mockReturnValueOnce({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }) // per-row update
      .mockReturnValueOnce(mockUpdateReturningChain([])); // unmarkOwn

    mockLogInfo.mockClear();
    await syncTeamsFromData(teamsMap);

    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.objectContaining({ marked: 1, unmarked: 0 }),
      "Corrected isOwnClub",
    );
  });

  it("corrective pass unmarks non-own-club teams", async () => {
    // toMarkOwn returns 0, unmarkOwn returns 2
    mockSelect
      .mockReturnValueOnce(mockSelectChain([]))               // existingIds
      .mockReturnValueOnce(mockSelectChain([{ maxOrder: null }])) // getMaxOwnDisplayOrder (pre-upsert)
      .mockReturnValueOnce(mockSelectChain([]))               // toMarkOwn → 0 rows
      .mockReturnValueOnce(mockSelectChain([{ maxOrder: null }])); // getMaxOwnDisplayOrder (corrective)
    const teamsMap = new Map([[1, makeTeamRef()]]);
    mockInsert.mockReturnValue(mockInsertChain([]));
    mockUpdate.mockReturnValue(mockUpdateReturningChain([{ id: 3 }, { id: 7 }])); // unmarkOwn

    mockLogInfo.mockClear();
    await syncTeamsFromData(teamsMap);

    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.objectContaining({ marked: 0, unmarked: 2 }),
      "Corrected isOwnClub",
    );
  });

  it("corrective pass skips logging when no corrections needed", async () => {
    setupDefaultSelectMock();
    const teamsMap = new Map([[1, makeTeamRef()]]);
    mockInsert.mockReturnValue(mockInsertChain([]));
    mockUpdate.mockReturnValue(mockUpdateReturningChain([]));

    mockLogInfo.mockClear();
    await syncTeamsFromData(teamsMap);

    const correctionLogs = mockLogInfo.mock.calls.filter(
      (call: unknown[]) => call[1] === "Corrected isOwnClub",
    );
    expect(correctionLogs).toHaveLength(0);
  });

  it("skips corrective pass when no club config", async () => {
    mockGetClubConfig.mockResolvedValue(null);
    mockSelect
      .mockReturnValueOnce(mockSelectChain([]))              // existingIds
      .mockReturnValueOnce(mockSelectChain([{ maxOrder: null }])); // getMaxOwnDisplayOrder
    const teamsMap = new Map([[1, makeTeamRef({ clubId: 4121 })]]);
    mockInsert.mockReturnValue(mockInsertChain([]));

    await syncTeamsFromData(teamsMap);

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("buildTeamIdLookup", () => {
  it("returns a map from apiTeamPermanentId to id", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockResolvedValue([
        { id: 1, apiTeamPermanentId: 100 },
        { id: 2, apiTeamPermanentId: 200 },
      ]),
    });

    const lookup = await buildTeamIdLookup();

    expect(lookup.get(100)).toBe(1);
    expect(lookup.get(200)).toBe(2);
  });
});
