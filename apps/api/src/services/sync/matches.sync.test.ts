import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SdkSpielplanMatch, SdkGetGameResponse } from "@dragons/sdk";
import type { LeagueFetchedData } from "./data-fetcher";

// --- Mock setup ---

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockTransaction = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  matches: {
    apiMatchId: "apiMatchId",
    id: "id",
    remoteDataHash: "remoteDataHash",
  },
  matchRemoteVersions: Symbol("matchRemoteVersions"),
  matchChanges: Symbol("matchChanges"),
  matchOverrides: {
    matchId: "matchId",
    fieldName: "fieldName",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));

vi.mock("@dragons/sdk", () => ({
  parseResult: vi.fn((result: string | null) => {
    if (!result) return { home: null, guest: null };
    const parts = result.split(":");
    return {
      home: parseInt(parts[0] ?? "", 10) || null,
      guest: parseInt(parts[1] ?? "", 10) || null,
    };
  }),
}));

vi.mock("./hash", () => ({
  computeEntityHash: vi.fn(() => "match-hash"),
}));

import { syncMatchesFromData, extractPeriodScores, extractOvertimeDeltas } from "./matches.sync";
import { computeEntityHash } from "./hash";

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Helpers ---

function makeBasicMatch(overrides: Partial<SdkSpielplanMatch> = {}): SdkSpielplanMatch {
  return {
    ligaData: null,
    matchId: 1000,
    matchDay: 1,
    matchNo: 1,
    kickoffDate: "2025-01-15",
    kickoffTime: "18:00",
    homeTeam: {
      teamPermanentId: 10,
      seasonTeamId: 100,
      teamCompetitionId: 1,
      teamname: "Home",
      teamnameSmall: "H",
      clubId: 1,
      verzicht: false,
    },
    guestTeam: {
      teamPermanentId: 20,
      seasonTeamId: 200,
      teamCompetitionId: 2,
      teamname: "Guest",
      teamnameSmall: "G",
      clubId: 2,
      verzicht: false,
    },
    result: "80:70",
    ergebnisbestaetigt: true,
    statisticType: null,
    verzicht: false,
    abgesagt: false,
    matchResult: null,
    matchInfo: null,
    matchBoxscore: null,
    playByPlay: null,
    hasPlayByPlay: null,
    ...overrides,
  };
}

function makeGameDetails(overrides: Partial<SdkGetGameResponse["game1"]> = {}): SdkGetGameResponse {
  return {
    game1: {
      spielplanId: 1,
      spielnr: 1,
      spieltag: 1,
      spieldatum: Date.now(),
      spielfeldId: 50,
      heimEndstand: 80,
      gastEndstand: 70,
      heimHalbzeitstand: 40,
      gastHalbzeitstand: 35,
      heimV1stand: 20,
      gastV1stand: 18,
      heimV3stand: 60,
      gastV3stand: 55,
      heimV4stand: 80,
      gastV4stand: 70,
      heimOt1stand: -1,
      gastOt1stand: -1,
      heimOt2stand: -1,
      gastOt2stand: -1,
      spielfeld: null,
      heimMannschaftLiga: null as never,
      gastMannschaftLiga: null as never,
      ...overrides,
    },
    sr1: { spielleitung: null, lizenzNr: null, offenAngeboten: false },
    sr2: { spielleitung: null, lizenzNr: null, offenAngeboten: false },
    sr3: { spielleitung: null, lizenzNr: null, offenAngeboten: false },
  };
}

function makeLeagueData(overrides: Partial<LeagueFetchedData> = {}): LeagueFetchedData {
  return {
    leagueApiId: 1,
    leagueDbId: 10,
    spielplan: [makeBasicMatch()],
    tabelle: [],
    gameDetails: new Map([[1000, makeGameDetails()]]),
    ...overrides,
  };
}

/** Helper to create a default locked row with period score fields */
function makeLockedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    currentRemoteVersion: 1,
    matchNo: 1,
    matchDay: 1,
    kickoffDate: "2025-01-15",
    kickoffTime: "18:00",
    homeTeamApiId: 10,
    guestTeamApiId: 20,
    isConfirmed: true,
    isForfeited: false,
    isCancelled: false,
    homeScore: 80,
    guestScore: 70,
    homeHalftimeScore: 40,
    guestHalftimeScore: 35,
    periodFormat: "quarters",
    homeQ1: 20, guestQ1: 18,
    homeQ2: 20, guestQ2: 17,
    homeQ3: 20, guestQ3: 20,
    homeQ4: 20, guestQ4: 15,
    homeOt1: null, guestOt1: null,
    homeOt2: null, guestOt2: null,
    ...overrides,
  };
}

/** Helper to create a mock transaction with override support */
function makeTxMock(lockedRow: Record<string, unknown>, overrides: Array<{ fieldName: string }> = []) {
  const txInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  const txUpdateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
  const txDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const txDelete = vi.fn().mockReturnValue({ where: txDeleteWhere });

  // Build select mock that handles both matches (FOR UPDATE) and matchOverrides
  let selectCallCount = 0;
  const txSelect = vi.fn().mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) {
      // First select: matches FOR UPDATE
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            for: vi.fn().mockResolvedValue([lockedRow]),
          }),
        }),
      };
    }
    // Second select: matchOverrides
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(overrides),
      }),
    };
  });

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    selectCallCount = 0;
    const tx = {
      select: txSelect,
      insert: txInsert,
      update: txUpdate,
      delete: txDelete,
    };
    await fn(tx);
  });

  return { txInsert, txUpdate, txUpdateSet, txDelete, txDeleteWhere, txSelect };
}

describe("syncMatchesFromData", () => {
  it("skips league without leagueDbId", async () => {
    const data = makeLeagueData({ leagueDbId: null });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.total).toBe(0);
    expect(result.errors[0]).toContain("No DB ID");
  });

  it("skips match without matchId", async () => {
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ matchId: 0 })],
    });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.total).toBe(0);
    expect(result.errors[0]).toContain("without matchId");
  });

  it("skips match without home team", async () => {
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ homeTeam: null })],
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.skipped).toBe(1);
  });

  it("skips match without guest team", async () => {
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ guestTeam: null })],
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.skipped).toBe(1);
  });

  it("creates new match with period score columns", async () => {
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await syncMatchesFromData([data], new Map(), 1);

    expect(result.created).toBe(1);
    expect(result.total).toBe(1);

    // Verify period scores are delta values, not cumulative
    const inserted = mockValues.mock.calls[0][0];
    expect(inserted.periodFormat).toBe("quarters");
    expect(inserted.homeQ1).toBe(20);
    expect(inserted.guestQ1).toBe(18);
    // Q2 = halftime(40) - Q1(20) = 20
    expect(inserted.homeQ2).toBe(20);
    // Q3 = V3stand(60) - halftime(40) = 20
    expect(inserted.homeQ3).toBe(20);
    // Q4 = V4stand(80) - V3stand(60) = 20
    expect(inserted.homeQ4).toBe(20);
  });

  it("creates initial remote version for new match", async () => {
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), 1);

    // Should be called twice: once for match, once for version
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it("skips existing match when hash matches", async () => {
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 1, remoteDataHash: "match-hash" }]),
        }),
      }),
    });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.skipped).toBe(1);
  });

  it("updates existing match when hash differs", async () => {
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            remoteDataHash: "old-hash",
          }]),
        }),
      }),
    });
    makeTxMock(makeLockedRow());

    const result = await syncMatchesFromData([data], new Map(), 1);

    expect(result.updated).toBe(1);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("resolves venue ID from lookup", async () => {
    const data = makeLeagueData();
    const venueIdLookup = new Map([[50, 500]]);
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], venueIdLookup, null);

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues.venueId).toBe(500);
  });

  it("handles per-match errors", async () => {
    const data = makeLeagueData();
    mockSelect.mockImplementation(() => {
      throw new Error("DB down");
    });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Failed to sync match");
  });

  it("handles non-Error per-match exception", async () => {
    const data = makeLeagueData();
    mockSelect.mockImplementation(() => {
      throw "string error";
    });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("creates match without game details", async () => {
    const data = makeLeagueData({ gameDetails: new Map() });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.created).toBe(1);
  });

  it("logs to logger on create", async () => {
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), null, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "created", entityType: "match" }),
    );
  });

  it("logs to logger on skip (no teams)", async () => {
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ homeTeam: null })],
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), null, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "skipped", message: "Missing home or guest team" }),
    );
  });

  it("logs to logger on skip (hash match)", async () => {
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 1, remoteDataHash: "match-hash" }]),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), null, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "skipped", message: "No changes detected" }),
    );
  });

  it("logs to logger on update", async () => {
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 1, remoteDataHash: "old-hash" }]),
        }),
      }),
    });
    makeTxMock(makeLockedRow());
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), 1, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "updated" }),
    );
  });

  it("logs to logger on failure", async () => {
    const data = makeLeagueData();
    mockSelect.mockImplementation(() => {
      throw new Error("fail");
    });
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), null, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });

  it("handles overtime delta scores", async () => {
    const details = makeGameDetails({
      heimV4stand: 80,
      gastV4stand: 70,
      heimOt1stand: 90,
      gastOt1stand: 78,
      heimOt2stand: 100,
      gastOt2stand: 85,
    });
    const data = makeLeagueData({
      gameDetails: new Map([[1000, details]]),
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.created).toBe(1);
    const inserted = mockValues.mock.calls[0][0];
    // OT1 delta = 90 - 80 = 10
    expect(inserted.homeOt1).toBe(10);
    // OT1 guest delta = 78 - 70 = 8
    expect(inserted.guestOt1).toBe(8);
    // OT2 delta = 100 - 90 = 10
    expect(inserted.homeOt2).toBe(10);
    // OT2 guest delta = 85 - 78 = 7
    expect(inserted.guestOt2).toBe(7);
  });

  it("handles transaction with null locked row", async () => {
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 1, remoteDataHash: "old-hash" }]),
        }),
      }),
    });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };
      await fn(tx);
    });

    const result = await syncMatchesFromData([data], new Map(), 1);

    expect(result.updated).toBe(1);
  });

  it("handles new match with no returning row", async () => {
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await syncMatchesFromData([data], new Map(), 1);

    expect(result.created).toBe(1);
    // Should not try to insert remote version when no match returned
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("uses result parsing when no game details", async () => {
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ result: "63:61" })],
      gameDetails: new Map(),
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0][0];
    expect(inserted.homeScore).toBe(63);
    expect(inserted.guestScore).toBe(61);
  });

  it("includes durationMs", async () => {
    const result = await syncMatchesFromData([], new Map(), null);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles negative scores as null", async () => {
    const details = makeGameDetails({
      heimEndstand: -1,
      gastEndstand: -1,
      heimHalbzeitstand: -1,
      gastHalbzeitstand: -1,
    });
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ result: null })],
      gameDetails: new Map([[1000, details]]),
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0][0];
    expect(inserted.homeScore).toBeNull();
    expect(inserted.guestScore).toBeNull();
    expect(inserted.homeHalftimeScore).toBeNull();
    expect(inserted.guestHalftimeScore).toBeNull();
  });

  it("detects field changes during update including period scores", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            remoteDataHash: "old-hash",
          }]),
        }),
      }),
    });
    const { txInsert } = makeTxMock(makeLockedRow({
      isConfirmed: false,  // different from snapshot
      homeScore: 70,       // different from snapshot
      guestScore: 60,      // different from snapshot
    }));

    await syncMatchesFromData([data], new Map(), 1);

    // insert called for matchRemoteVersions AND matchChanges
    expect(txInsert).toHaveBeenCalledTimes(2);
  });

  it("preserves existing fields when game details are unavailable", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch()],
      gameDetails: new Map(), // no game details available
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            remoteDataHash: "old-hash",
            venueId: 500,
          }]),
        }),
      }),
    });
    const { txUpdateSet } = makeTxMock(makeLockedRow({ venueId: 500 }));

    await syncMatchesFromData([data], new Map(), 1);

    const updatedFields = txUpdateSet.mock.calls[0][0];
    expect(updatedFields.venueId).toBe(500);
    expect(updatedFields.homeHalftimeScore).toBe(40);
    expect(updatedFields.guestHalftimeScore).toBe(35);
    expect(updatedFields.periodFormat).toBe("quarters");
    expect(updatedFields.homeQ1).toBe(20);
  });

  it("updates venueId when game details are available", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch()],
      gameDetails: new Map([[1000, makeGameDetails({ spielfeldId: 60 })]]),
    });
    const venueIdLookup = new Map([[60, 600]]);
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            remoteDataHash: "old-hash",
            venueId: 500,
          }]),
        }),
      }),
    });
    const { txUpdateSet } = makeTxMock(makeLockedRow({ venueId: 500 }));

    await syncMatchesFromData([data], venueIdLookup, 1);

    const updatedFields = txUpdateSet.mock.calls[0][0];
    expect(updatedFields.venueId).toBe(600);
    expect(updatedFields.homeHalftimeScore).toBe(40);
    expect(updatedFields.guestHalftimeScore).toBe(35);
  });

  it("derives Q4 from endstand when V4stand is -1 and no overtime", async () => {
    const details = makeGameDetails({
      heimEndstand: 60,
      gastEndstand: 80,
      heimHalbzeitstand: 36,
      gastHalbzeitstand: 35,
      heimV1stand: 13,
      gastV1stand: 17,
      heimV3stand: 50,
      gastV3stand: 61,
      heimV4stand: -1,
      gastV4stand: -1,
      heimOt1stand: -1,
      gastOt1stand: -1,
      heimOt2stand: -1,
      gastOt2stand: -1,
    });
    const data = makeLeagueData({
      spielplan: [makeBasicMatch()],
      gameDetails: new Map([[1000, details]]),
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0][0];
    expect(inserted.periodFormat).toBe("quarters");
    // Q1 delta = cumulative first period
    expect(inserted.homeQ1).toBe(13);
    expect(inserted.guestQ1).toBe(17);
    // Q2 = halftime(36) - Q1(13) = 23
    expect(inserted.homeQ2).toBe(23);
    expect(inserted.guestQ2).toBe(18);
    // Q3 = V3(50) - halftime(36) = 14
    expect(inserted.homeQ3).toBe(14);
    expect(inserted.guestQ3).toBe(26);
    // Q4 derived from endstand(60) - V3(50) = 10
    expect(inserted.homeQ4).toBe(10);
    expect(inserted.guestQ4).toBe(19);
  });

  it("does not derive Q4 from endstand when overtime was played", async () => {
    const details = makeGameDetails({
      heimEndstand: 90,
      gastEndstand: 85,
      heimHalbzeitstand: 40,
      gastHalbzeitstand: 38,
      heimV1stand: 20,
      gastV1stand: 18,
      heimV3stand: 60,
      gastV3stand: 58,
      heimV4stand: -1,
      gastV4stand: -1,
      heimOt1stand: 10,
      gastOt1stand: 5,
      heimOt2stand: -1,
      gastOt2stand: -1,
    });
    const data = makeLeagueData({
      spielplan: [makeBasicMatch()],
      gameDetails: new Map([[1000, details]]),
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0][0];
    // Q4 should NOT be derived from endstand since overtime was played
    expect(inserted.homeQ4).toBeNull();
    expect(inserted.guestQ4).toBeNull();
    // Overtime should be extracted as deltas (but Q4 is null so OT delta can't be computed from sum)
    // OT1 cumulative is 10, but regulation end is unknown (Q4 is null) → delta is null
    expect(inserted.homeOt1).toBeNull();
  });

  it("sets venueId to null when details have no venue", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch()],
      gameDetails: new Map([[1000, makeGameDetails({ spielfeldId: 0 })]]),
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            remoteDataHash: "old-hash",
            venueId: 500,
          }]),
        }),
      }),
    });
    const { txUpdateSet } = makeTxMock(makeLockedRow({ venueId: 500 }));

    await syncMatchesFromData([data], new Map(), 1);

    // When details ARE available but spielfeldId is 0, venueId should be null
    const updatedFields = txUpdateSet.mock.calls[0][0];
    expect(updatedFields.venueId).toBeNull();
  });

  it("skips overridden fields during update", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            remoteDataHash: "old-hash",
          }]),
        }),
      }),
    });
    // Match has an override on kickoffDate
    const { txUpdateSet } = makeTxMock(
      makeLockedRow({ kickoffDate: "2025-02-01" }),
      [{ fieldName: "kickoffDate" }],
    );

    await syncMatchesFromData([data], new Map(), 1);

    const updatedFields = txUpdateSet.mock.calls[0][0];
    // kickoffDate should NOT be in update set (it's overridden)
    expect(updatedFields.kickoffDate).toBeUndefined();
    // Other fields should still be updated
    expect(updatedFields.matchNo).toBe(1);
  });

  it("uses 0 as fallback when matchDay is falsy", async () => {
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ matchDay: null as unknown as number })],
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0][0];
    expect(inserted.matchDay).toBe(0);
  });

  it("does not preserve halftime scores when remote has non-null values without details", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    // Build a match where the BASIC match data has a result (which gives homeScore/guestScore)
    // but no game details. The snapshot will have halftime scores from parseResult.
    // We need to make the remote snapshot have non-null halftimeScores.
    // Since no game details → homeHalftimeScore/guestHalftimeScore will be null in the new snapshot.
    // So this path tests when the remote snapshot HAS null halftime and preservation kicks in.
    // To test when remote is NON-null, we need game details that provide halftime scores.
    // Instead, test the specific case where guestHalftimeScore is overridden:
    const data = makeLeagueData({
      spielplan: [makeBasicMatch()],
      gameDetails: new Map(), // no details → halftime scores null in snapshot
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            remoteDataHash: "old-hash",
          }]),
        }),
      }),
    });
    const { txUpdateSet } = makeTxMock(
      makeLockedRow({ guestHalftimeScore: 38 }),
      [{ fieldName: "guestHalftimeScore" }],
    );

    await syncMatchesFromData([data], new Map(), 1);

    const updatedFields = txUpdateSet.mock.calls[0][0];
    // guestHalftimeScore is overridden, so should NOT be preserved
    expect(updatedFields.guestHalftimeScore).toBeUndefined();
    // homeHalftimeScore is NOT overridden and remote is null → should be preserved
    expect(updatedFields.homeHalftimeScore).toBe(40);
  });

  it("does not auto-release override when remote differs from effective value", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            remoteDataHash: "old-hash",
          }]),
        }),
      }),
    });
    // Override on kickoffDate, but remote ("2025-01-15") != locked ("2025-02-01")
    const { txDelete } = makeTxMock(
      makeLockedRow({ kickoffDate: "2025-02-01" }),
      [{ fieldName: "kickoffDate" }],
    );

    await syncMatchesFromData([data], new Map(), 1);

    // Should NOT auto-release because values differ
    expect(txDelete).not.toHaveBeenCalled();
  });

  it("does not preserve fields when overridden even if details unavailable", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch()],
      gameDetails: new Map(), // no details
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            remoteDataHash: "old-hash",
          }]),
        }),
      }),
    });
    // homeHalftimeScore and homeQ1 are overridden
    const { txUpdateSet } = makeTxMock(
      makeLockedRow({ homeHalftimeScore: 45, homeQ1: 25, periodFormat: "quarters" }),
      [{ fieldName: "homeHalftimeScore" }, { fieldName: "homeQ1" }, { fieldName: "periodFormat" }],
    );

    await syncMatchesFromData([data], new Map(), 1);

    const updatedFields = txUpdateSet.mock.calls[0][0];
    // Overridden fields should NOT be preserved (skipped from update entirely)
    expect(updatedFields.homeHalftimeScore).toBeUndefined();
    expect(updatedFields.homeQ1).toBeUndefined();
    expect(updatedFields.periodFormat).toBeUndefined();
    // Non-overridden fields should still be preserved
    expect(updatedFields.guestHalftimeScore).toBe(35);
    expect(updatedFields.guestQ1).toBe(18);
  });

  it("auto-releases override when remote matches effective value", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            remoteDataHash: "old-hash",
          }]),
        }),
      }),
    });
    // Match has override on kickoffDate, but remote now matches
    const { txDelete } = makeTxMock(
      makeLockedRow({ kickoffDate: "2025-01-15" }), // matches remote
      [{ fieldName: "kickoffDate" }],
    );

    await syncMatchesFromData([data], new Map(), 1);

    // Should have called delete to auto-release the override
    expect(txDelete).toHaveBeenCalled();
  });
});

describe("extractPeriodScores", () => {
  it("returns null scores for undefined game", () => {
    const scores = extractPeriodScores(undefined);
    expect(scores.periodFormat).toBeNull();
    expect(scores.homeQ1).toBeNull();
  });

  it("returns null periodFormat when all quarter values are invalid", () => {
    const game = makeGameDetails({
      heimV1stand: -1,
      gastV1stand: -1,
      heimHalbzeitstand: -1,
      gastHalbzeitstand: -1,
      heimV3stand: -1,
      gastV3stand: -1,
      heimV4stand: -1,
      gastV4stand: -1,
      heimEndstand: -1,
      gastEndstand: -1,
      heimOt1stand: -1,
      gastOt1stand: -1,
    }).game1;

    const scores = extractPeriodScores(game);
    expect(scores.periodFormat).toBeNull();
    expect(scores.homeQ1).toBeNull();
    expect(scores.guestQ4).toBeNull();
  });

  it("extracts standard quarter deltas", () => {
    const game = makeGameDetails({
      heimV1stand: 20,
      gastV1stand: 18,
      heimHalbzeitstand: 40,
      gastHalbzeitstand: 35,
      heimV3stand: 60,
      gastV3stand: 55,
      heimV4stand: 80,
      gastV4stand: 70,
    }).game1;

    const scores = extractPeriodScores(game);

    expect(scores.periodFormat).toBe("quarters");
    expect(scores.homeQ1).toBe(20);
    expect(scores.homeQ2).toBe(20); // 40 - 20
    expect(scores.homeQ3).toBe(20); // 60 - 40
    expect(scores.homeQ4).toBe(20); // 80 - 60
  });

  it("does not detect achtel when V4stand equals Endstand", () => {
    const game = makeGameDetails({
      heimV1stand: 20,
      gastV1stand: 18,
      heimHalbzeitstand: 40,
      gastHalbzeitstand: 35,
      heimV3stand: 60,
      gastV3stand: 55,
      heimV4stand: 80,
      gastV4stand: 70,
      heimEndstand: 80,
      gastEndstand: 70,
    }).game1;

    const scores = extractPeriodScores(game);
    expect(scores.periodFormat).toBe("quarters");
  });

  it("returns null period scores when V5-V8 are present (achtel game)", () => {
    const game = makeGameDetails({
      heimV1stand: 10,
      gastV1stand: 8,
      heimV2stand: 20,
      gastV2stand: 18,
      heimV3stand: 30,
      gastV3stand: 28,
      heimV4stand: 40,
      gastV4stand: 38,
      heimV5stand: 50,
      gastV5stand: 48,
      heimV6stand: 60,
      gastV6stand: 58,
      heimV7stand: 70,
      gastV7stand: 68,
      heimV8stand: 80,
      gastV8stand: 78,
    }).game1;

    const scores = extractPeriodScores(game);
    expect(scores.periodFormat).toBeNull();
    expect(scores.homeQ1).toBeNull();
    expect(scores.guestQ1).toBeNull();
    expect(scores.homeQ4).toBeNull();
    expect(scores.guestQ4).toBeNull();
  });

  it("treats V4 != Endstand as quarters when overtime is present", () => {
    const game = makeGameDetails({
      heimV1stand: 20,
      gastV1stand: 18,
      heimHalbzeitstand: 40,
      gastHalbzeitstand: 35,
      heimV3stand: 60,
      gastV3stand: 55,
      heimV4stand: 80,
      gastV4stand: 80,
      heimEndstand: 90,
      gastEndstand: 85,
      heimOt1stand: 90,
      gastOt1stand: 85,
    }).game1;

    const scores = extractPeriodScores(game);
    expect(scores.periodFormat).toBe("quarters");
    expect(scores.homeQ1).toBe(20);
    expect(scores.homeQ4).toBe(20); // 80 - 60
    expect(scores.guestQ4).toBe(25); // 80 - 55
  });
});

describe("extractOvertimeDeltas", () => {
  it("returns null deltas for undefined game", () => {
    const periodScores = extractPeriodScores(undefined);
    const deltas = extractOvertimeDeltas(undefined, periodScores);
    expect(deltas.homeOt1).toBeNull();
    expect(deltas.guestOt1).toBeNull();
  });

  it("computes OT deltas from regulation end", () => {
    const game = makeGameDetails({
      heimV4stand: 80,
      gastV4stand: 70,
      heimOt1stand: 90,
      gastOt1stand: 78,
      heimOt2stand: -1,
      gastOt2stand: -1,
    }).game1;

    const periodScores = extractPeriodScores(game);
    const deltas = extractOvertimeDeltas(game, periodScores);

    // OT1 delta = 90 - 80 = 10
    expect(deltas.homeOt1).toBe(10);
    expect(deltas.guestOt1).toBe(8);
    expect(deltas.homeOt2).toBeNull();
  });

  it("returns null when no overtime", () => {
    const game = makeGameDetails().game1;

    const periodScores = extractPeriodScores(game);
    const deltas = extractOvertimeDeltas(game, periodScores);

    expect(deltas.homeOt1).toBeNull();
    expect(deltas.guestOt1).toBeNull();
  });

  it("returns null OT when period scores are null (achtel game skipped)", () => {
    const game = makeGameDetails({
      heimV5stand: 50,
      gastV5stand: 48,
      heimOt1stand: 90,
      gastOt1stand: 86,
    }).game1;

    const periodScores = extractPeriodScores(game);
    expect(periodScores.periodFormat).toBeNull();

    const deltas = extractOvertimeDeltas(game, periodScores);
    expect(deltas.homeOt1).toBeNull();
    expect(deltas.guestOt1).toBeNull();
  });
});
