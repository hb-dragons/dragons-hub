import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SdkSpielplanMatch, SdkGetGameResponse } from "@dragons/sdk";
import type { LeagueFetchedData } from "./data-fetcher";

// --- Mock setup ---

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

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
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
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

const mockPublishDomainEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: (...args: unknown[]) => mockPublishDomainEvent(...args),
}));

vi.mock("@dragons/shared", () => ({
  EVENT_TYPES: {
    MATCH_CREATED: "match.created",
    MATCH_SCHEDULE_CHANGED: "match.schedule.changed",
    MATCH_VENUE_CHANGED: "match.venue.changed",
    MATCH_CANCELLED: "match.cancelled",
    MATCH_FORFEITED: "match.forfeited",
    MATCH_RESULT_ENTERED: "match.result_entered",
    MATCH_RESULT_CHANGED: "match.result_changed",
    OVERRIDE_CONFLICT: "override.conflict",
  },
}));

import { syncMatchesFromData, extractPeriodScores, extractOvertimeDeltas, buildMatchEntityName } from "./matches.sync";
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

function makeGameDetails(
  overrides: Partial<SdkGetGameResponse["game1"]> = {},
  refereeOverrides: { sr1?: Partial<SdkGetGameResponse["sr1"]>; sr2?: Partial<SdkGetGameResponse["sr2"]>; sr3?: Partial<SdkGetGameResponse["sr3"]> } = {},
): SdkGetGameResponse {
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
    sr1: { spielleitung: null, lizenzNr: null, offenAngeboten: false, ...refereeOverrides.sr1 },
    sr2: { spielleitung: null, lizenzNr: null, offenAngeboten: false, ...refereeOverrides.sr2 },
    sr3: { spielleitung: null, lizenzNr: null, offenAngeboten: false, ...refereeOverrides.sr3 },
  };
}

function makeLeagueData(overrides: Partial<LeagueFetchedData> = {}): LeagueFetchedData {
  return {
    leagueApiId: 1,
    leagueDbId: 10,
    leagueName: "Bezirksliga",
    spielplan: [makeBasicMatch()],
    tabelle: [],
    gameDetails: new Map([[1000, makeGameDetails()]]),
    ...overrides,
  };
}

/** Helper to set up the batch-load mock for existing matches */
function setupBatchSelect(existingMatches: Record<string, unknown>[] = []) {
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(existingMatches),
    }),
  });
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
    sr1Open: false, sr2Open: false, sr3Open: false,
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

  let lastEffectiveChanges: unknown[] = [];
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    selectCallCount = 0;
    const tx = {
      select: txSelect,
      insert: txInsert,
      update: txUpdate,
      delete: txDelete,
    };
    lastEffectiveChanges = (await fn(tx)) as unknown[] ?? [];
    return lastEffectiveChanges;
  });

  return { txInsert, txUpdate, txUpdateSet, txDelete, txDeleteWhere, txSelect, getEffectiveChanges: () => lastEffectiveChanges };
}

describe("syncMatchesFromData", () => {
  it("skips league without leagueDbId", async () => {
    const data = makeLeagueData({ leagueDbId: null });
    setupBatchSelect([]);

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
    setupBatchSelect([]);

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.skipped).toBe(1);
  });

  it("skips match without guest team", async () => {
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ guestTeam: null })],
    });
    setupBatchSelect([]);

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.skipped).toBe(1);
  });

  it("creates new match with period score columns", async () => {
    const data = makeLeagueData();
    setupBatchSelect([]);
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await syncMatchesFromData([data], new Map(), 1);

    expect(result.created).toBe(1);
    expect(result.total).toBe(1);

    // Verify period scores are delta values, not cumulative
    const inserted = mockValues.mock.calls[0]![0];
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
    setupBatchSelect([]);
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
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "match-hash" }]);

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.skipped).toBe(1);
  });

  it("updates existing match when hash differs and effective changes exist", async () => {
    const data = makeLeagueData();
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    // Locked row has different homeScore, so effective changes will be detected
    makeTxMock(makeLockedRow({ homeScore: 70 }));

    const result = await syncMatchesFromData([data], new Map(), 1);

    expect(result.updated).toBe(1);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("skips match when hash differs but no effective field changes", async () => {
    const data = makeLeagueData();
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    // Locked row matches the snapshot exactly — no effective changes
    makeTxMock(makeLockedRow());

    const result = await syncMatchesFromData([data], new Map(), 1);

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("resolves venue ID from lookup", async () => {
    const data = makeLeagueData();
    const venueIdLookup = new Map([[50, 500]]);
    setupBatchSelect([]);
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], venueIdLookup, null);

    const insertedValues = mockValues.mock.calls[0]![0];
    expect(insertedValues.venueId).toBe(500);
  });

  it("handles per-match errors", async () => {
    const data = makeLeagueData();
    setupBatchSelect([]);
    mockInsert.mockImplementation(() => {
      throw new Error("DB down");
    });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Failed to sync match");
  });

  it("handles non-Error per-match exception", async () => {
    const data = makeLeagueData();
    setupBatchSelect([]);
    mockInsert.mockImplementation(() => {
      throw "string error";
    });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("creates match without game details", async () => {
    const data = makeLeagueData({ gameDetails: new Map() });
    setupBatchSelect([]);
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
    setupBatchSelect([]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), null, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "created", entityType: "match", entityName: "#1 Home vs Guest (Bezirksliga)" }),
    );
  });

  it("logs to logger on skip (no teams)", async () => {
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ homeTeam: null })],
    });
    setupBatchSelect([]);
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), null, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "skipped", entityName: "#1 (Bezirksliga)", message: "Missing home or guest team" }),
    );
  });

  it("logs to logger on skip (hash match)", async () => {
    const data = makeLeagueData();
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "match-hash" }]);
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), null, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "skipped", entityName: "#1 Home vs Guest (Bezirksliga)", message: "No changes detected" }),
    );
  });

  it("logs to logger on update when effective changes exist", async () => {
    const data = makeLeagueData();
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    makeTxMock(makeLockedRow({ homeScore: 70 }));
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), 1, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "updated", entityName: "#1 Home vs Guest (Bezirksliga)" }),
    );
  });

  it("logs to logger on skip when hash changed but no effective changes", async () => {
    const data = makeLeagueData();
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    makeTxMock(makeLockedRow());
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), 1, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "skipped", entityName: "#1 Home vs Guest (Bezirksliga)", message: "Hash updated, no effective data changes" }),
    );
  });

  it("logs to logger on failure", async () => {
    const data = makeLeagueData();
    setupBatchSelect([]);
    mockInsert.mockImplementation(() => {
      throw new Error("fail");
    });
    const mockLogger = { log: vi.fn() };

    await syncMatchesFromData([data], new Map(), null, mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed", entityName: "#1 Home vs Guest (Bezirksliga)" }),
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
    setupBatchSelect([]);
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.created).toBe(1);
    const inserted = mockValues.mock.calls[0]![0];
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
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };
      return await fn(tx);
    });

    const result = await syncMatchesFromData([data], new Map(), 1);

    // No locked row → empty effective changes → skipped
    expect(result.skipped).toBe(1);
  });

  it("handles new match with no returning row", async () => {
    const data = makeLeagueData();
    setupBatchSelect([]);
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
    setupBatchSelect([]);
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0]![0];
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
    setupBatchSelect([]);
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0]![0];
    expect(inserted.homeScore).toBeNull();
    expect(inserted.guestScore).toBeNull();
    expect(inserted.homeHalftimeScore).toBeNull();
    expect(inserted.guestHalftimeScore).toBeNull();
  });

  it("detects field changes during update including period scores", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData();
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    const { txInsert } = makeTxMock(makeLockedRow({
      isConfirmed: false,  // different from snapshot
      homeScore: 70,       // different from snapshot
      guestScore: 60,      // different from snapshot
    }));

    const result = await syncMatchesFromData([data], new Map(), 1);

    // insert called for matchRemoteVersions AND matchChanges
    expect(txInsert).toHaveBeenCalledTimes(2);
    // Effective changes exist, so it should be counted as updated
    expect(result.updated).toBe(1);
  });

  it("does not report kickoffTime change when only seconds suffix differs", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    // SDK sends "18:00", DB stores "18:00:00" — these are the same time
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ kickoffTime: "18:00" })],
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    const { txInsert } = makeTxMock(makeLockedRow({
      kickoffTime: "18:00:00", // DB returns with seconds
    }));

    await syncMatchesFromData([data], new Map(), 1);

    // Only matchRemoteVersions insert, NO matchChanges insert
    expect(txInsert).toHaveBeenCalledTimes(1);
  });

  it("preserves existing fields when game details are unavailable", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch()],
      gameDetails: new Map(), // no game details available
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash", venueId: 500 }]);
    const { txUpdateSet } = makeTxMock(makeLockedRow({ venueId: 500 }));

    await syncMatchesFromData([data], new Map(), 1);

    const updatedFields = txUpdateSet.mock.calls[0]![0];
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
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash", venueId: 500 }]);
    const { txUpdateSet } = makeTxMock(makeLockedRow({ venueId: 500 }));

    await syncMatchesFromData([data], venueIdLookup, 1);

    const updatedFields = txUpdateSet.mock.calls[0]![0];
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
    setupBatchSelect([]);
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0]![0];
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
    setupBatchSelect([]);
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0]![0];
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
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash", venueId: 500 }]);
    const { txUpdateSet } = makeTxMock(makeLockedRow({ venueId: 500 }));

    await syncMatchesFromData([data], new Map(), 1);

    // When details ARE available but spielfeldId is 0, venueId should be null
    const updatedFields = txUpdateSet.mock.calls[0]![0];
    expect(updatedFields.venueId).toBeNull();
  });

  it("skips overridden fields during update", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData();
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    // Match has an override on kickoffDate
    const { txUpdateSet } = makeTxMock(
      makeLockedRow({ kickoffDate: "2025-02-01" }),
      [{ fieldName: "kickoffDate" }],
    );

    await syncMatchesFromData([data], new Map(), 1);

    const updatedFields = txUpdateSet.mock.calls[0]![0];
    // kickoffDate should NOT be in update set (it's overridden)
    expect(updatedFields.kickoffDate).toBeUndefined();
    // Other fields should still be updated
    expect(updatedFields.matchNo).toBe(1);
  });

  it("uses 0 as fallback when matchDay is falsy", async () => {
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ matchDay: null as unknown as number })],
    });
    setupBatchSelect([]);
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0]![0];
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
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    const { txUpdateSet } = makeTxMock(
      makeLockedRow({ guestHalftimeScore: 38 }),
      [{ fieldName: "guestHalftimeScore" }],
    );

    await syncMatchesFromData([data], new Map(), 1);

    const updatedFields = txUpdateSet.mock.calls[0]![0];
    // guestHalftimeScore is overridden, so should NOT be preserved
    expect(updatedFields.guestHalftimeScore).toBeUndefined();
    // homeHalftimeScore is NOT overridden and remote is null → should be preserved
    expect(updatedFields.homeHalftimeScore).toBe(40);
  });

  it("does not auto-release override when remote differs from effective value", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData();
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
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
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    // homeHalftimeScore and homeQ1 are overridden
    const { txUpdateSet } = makeTxMock(
      makeLockedRow({ homeHalftimeScore: 45, homeQ1: 25, periodFormat: "quarters" }),
      [{ fieldName: "homeHalftimeScore" }, { fieldName: "homeQ1" }, { fieldName: "periodFormat" }],
    );

    await syncMatchesFromData([data], new Map(), 1);

    const updatedFields = txUpdateSet.mock.calls[0]![0];
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
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    // Match has override on kickoffDate, but remote now matches
    const { txDelete } = makeTxMock(
      makeLockedRow({ kickoffDate: "2025-01-15" }), // matches remote
      [{ fieldName: "kickoffDate" }],
    );

    await syncMatchesFromData([data], new Map(), 1);

    // Should have called delete to auto-release the override
    expect(txDelete).toHaveBeenCalled();
  });

  it("creates new match with sr1Open/sr2Open/sr3Open from offenAngeboten", async () => {
    const details = makeGameDetails({}, {
      sr1: { offenAngeboten: true },
      sr3: { offenAngeboten: true },
    });
    const data = makeLeagueData({
      gameDetails: new Map([[1000, details]]),
    });
    setupBatchSelect([]);
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await syncMatchesFromData([data], new Map(), null);

    expect(result.created).toBe(1);
    const inserted = mockValues.mock.calls[0]![0];
    expect(inserted.sr1Open).toBe(true);
    expect(inserted.sr2Open).toBe(false);
    expect(inserted.sr3Open).toBe(true);
  });

  it("defaults sr1Open/sr2Open/sr3Open to false when no game details", async () => {
    const data = makeLeagueData({ gameDetails: new Map() });
    setupBatchSelect([]);
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncMatchesFromData([data], new Map(), null);

    const inserted = mockValues.mock.calls[0]![0];
    expect(inserted.sr1Open).toBe(false);
    expect(inserted.sr2Open).toBe(false);
    expect(inserted.sr3Open).toBe(false);
  });

  it("updates match when offenAngeboten changes", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const details = makeGameDetails({}, {
      sr1: { offenAngeboten: true },
    });
    const data = makeLeagueData({
      gameDetails: new Map([[1000, details]]),
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    // Locked row has sr1Open: false, but remote has true
    const { txUpdateSet } = makeTxMock(makeLockedRow({ sr1Open: false }));

    const result = await syncMatchesFromData([data], new Map(), 1);

    expect(result.updated).toBe(1);
    const updatedFields = txUpdateSet.mock.calls[0]![0];
    expect(updatedFields.sr1Open).toBe(true);
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

describe("buildMatchEntityName", () => {
  it("includes match number and full team names", () => {
    const match = makeBasicMatch({ matchNo: 42 });
    expect(buildMatchEntityName(match)).toBe("#42 Home vs Guest");
  });

  it("includes league name from parameter", () => {
    const match = makeBasicMatch({ matchNo: 7 });
    expect(buildMatchEntityName(match, "Bezirksliga")).toBe("#7 Home vs Guest (Bezirksliga)");
  });

  it("falls back to ligaData when league name parameter is null", () => {
    const match = makeBasicMatch({
      matchNo: 7,
      ligaData: {
        seasonId: 1, seasonName: "2024/25", actualMatchDay: null,
        ligaId: 100, liganame: "Kreisliga", liganr: 1,
        skName: "", skNameSmall: "", skEbeneId: 1, skEbeneName: "",
        akName: "", geschlechtId: 1, geschlecht: "", verbandId: 1, verbandName: "",
        bezirknr: null, bezirkName: null, kreisnr: null, kreisname: null,
        statisticType: null, vorabliga: false, tableExists: false, crossTableExists: false,
      },
    });
    expect(buildMatchEntityName(match, null)).toBe("#7 Home vs Guest (Kreisliga)");
  });

  it("omits teams when both are null", () => {
    const match = makeBasicMatch({ matchNo: 3, homeTeam: null, guestTeam: null });
    expect(buildMatchEntityName(match)).toBe("#3");
  });

  it("omits teams when one is null", () => {
    const match = makeBasicMatch({ matchNo: 3, homeTeam: null });
    expect(buildMatchEntityName(match)).toBe("#3");
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

describe("extractPeriodScores - V2stand fallback", () => {
  it("uses V2stand instead of halftime when V2stand is available", () => {
    const game = makeGameDetails({
      heimV1stand: 15,
      gastV1stand: 12,
      heimV2stand: 30,
      gastV2stand: 25,
      heimHalbzeitstand: 30,
      gastHalbzeitstand: 25,
      heimV3stand: 50,
      gastV3stand: 40,
      heimV4stand: 70,
      gastV4stand: 55,
    }).game1;

    const scores = extractPeriodScores(game);

    expect(scores.periodFormat).toBe("quarters");
    expect(scores.homeQ1).toBe(15);
    expect(scores.guestQ1).toBe(12);
    // Q2 uses V2stand (30) - V1stand (15) = 15
    expect(scores.homeQ2).toBe(15);
    expect(scores.guestQ2).toBe(13);
  });

  it("prefers V2stand over halftime when both differ", () => {
    // If V2stand is present it takes priority over Halbzeitstand
    const game = makeGameDetails({
      heimV1stand: 10,
      gastV1stand: 8,
      heimV2stand: 22,
      gastV2stand: 20,
      heimHalbzeitstand: 25, // different from V2stand
      gastHalbzeitstand: 22,
      heimV3stand: 40,
      gastV3stand: 35,
      heimV4stand: 60,
      gastV4stand: 50,
    }).game1;

    const scores = extractPeriodScores(game);

    // Q2 = V2stand(22) - V1stand(10) = 12 (not 25 - 10 = 15)
    expect(scores.homeQ2).toBe(12);
    // Q3 = V3stand(40) - V2stand(22) = 18 (not 40 - 25 = 15)
    expect(scores.homeQ3).toBe(18);
  });
});

describe("classifyMatchChanges via syncMatchesFromData", () => {
  it("emits MATCH_SCHEDULE_CHANGED when kickoffDate changes", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ kickoffDate: "2025-02-20" })],
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    makeTxMock(makeLockedRow({ kickoffDate: "2025-01-15" }));

    await syncMatchesFromData([data], new Map(), 1);

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "match.schedule.changed" }),
    );
  });

  it("emits MATCH_SCHEDULE_CHANGED when kickoffTime changes", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ kickoffTime: "20:00" })],
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    makeTxMock(makeLockedRow({ kickoffTime: "18:00" }));

    await syncMatchesFromData([data], new Map(), 1);

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "match.schedule.changed" }),
    );
  });

  it("emits MATCH_RESULT_ENTERED when score changes from null to value", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ result: "80:70" })],
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    makeTxMock(makeLockedRow({ homeScore: null, guestScore: null }));

    await syncMatchesFromData([data], new Map(), 1);

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "match.result_entered" }),
    );
  });

  it("emits MATCH_RESULT_CHANGED when score changes from one value to another", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const details = makeGameDetails({
      heimEndstand: 90,
      gastEndstand: 85,
    });
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ result: "90:85" })],
      gameDetails: new Map([[1000, details]]),
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    makeTxMock(makeLockedRow({ homeScore: 80, guestScore: 70 }));

    await syncMatchesFromData([data], new Map(), 1);

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "match.result_changed" }),
    );
  });

  it("emits MATCH_CANCELLED when isCancelled changes to true", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ abgesagt: true })],
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    makeTxMock(makeLockedRow({ isCancelled: false }));

    await syncMatchesFromData([data], new Map(), 1);

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "match.cancelled" }),
    );
  });

  it("emits MATCH_FORFEITED when isForfeited changes to true", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ verzicht: true })],
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    makeTxMock(makeLockedRow({ isForfeited: false }));

    await syncMatchesFromData([data], new Map(), 1);

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "match.forfeited" }),
    );
  });

  it("does not emit score event when isCancelled is the only change", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ abgesagt: true })],
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    makeTxMock(makeLockedRow({ isCancelled: false }));

    await syncMatchesFromData([data], new Map(), 1);

    const eventTypes = mockPublishDomainEvent.mock.calls.map(
      (call: unknown[]) => (call[0] as Record<string, unknown>).type,
    );
    expect(eventTypes).not.toContain("match.result_entered");
    expect(eventTypes).not.toContain("match.result_changed");
  });

  it("emits multiple events when schedule and result change together", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    const details = makeGameDetails({
      heimEndstand: 90,
      gastEndstand: 85,
    });
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ kickoffDate: "2025-03-01", result: "90:85" })],
      gameDetails: new Map([[1000, details]]),
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    makeTxMock(makeLockedRow({
      kickoffDate: "2025-01-15",
      homeScore: null,
      guestScore: null,
    }));

    await syncMatchesFromData([data], new Map(), 1);

    const eventTypes = mockPublishDomainEvent.mock.calls.map(
      (call: unknown[]) => (call[0] as Record<string, unknown>).type,
    );
    expect(eventTypes).toContain("match.schedule.changed");
    expect(eventTypes).toContain("match.result_entered");
  });
});

describe("computeEffectiveChanges kickoffTime normalization in update", () => {
  it("treats '10:30:00' and '10:30' as equal in effective changes", async () => {
    vi.mocked(computeEntityHash).mockReturnValueOnce("new-hash");
    // Remote sends "10:30", DB has "10:30:00" — should NOT count as a change
    const data = makeLeagueData({
      spielplan: [makeBasicMatch({ kickoffTime: "10:30" })],
    });
    setupBatchSelect([{ apiMatchId: 1000, id: 1, remoteDataHash: "old-hash" }]);
    // Locked row has "10:30:00" (DB format) and everything else matches
    const { txInsert } = makeTxMock(makeLockedRow({ kickoffTime: "10:30:00" }));

    const result = await syncMatchesFromData([data], new Map(), 1);

    // Should be skipped since kickoffTime "10:30:00" == "10:30" after normalization
    // and no other fields changed
    expect(result.skipped).toBe(1);
    // Only matchRemoteVersions insert, NO matchChanges
    expect(txInsert).toHaveBeenCalledTimes(1);
  });
});
