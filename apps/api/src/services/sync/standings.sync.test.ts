import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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
vi.mock("../../config/database", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  standings: {
    leagueId: "leagueId",
    teamApiId: "teamApiId",
    id: "id",
    dataHash: "dataHash",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: (...args: unknown[]) => args,
}));

vi.mock("./hash", () => ({
  computeEntityHash: vi.fn(() => "standing-hash"),
}));

import { syncStandingsFromData } from "./standings.sync";

const FROZEN_TIME = new Date("2025-06-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

function makeLeagueData(overrides: Partial<LeagueFetchedData> = {}): LeagueFetchedData {
  return {
    leagueApiId: 1,
    leagueDbId: 10,
    spielplan: [],
    tabelle: [
      {
        rang: 1,
        team: {
          teamPermanentId: 100,
          seasonTeamId: 10,
          teamCompetitionId: 1,
          teamname: "Team A",
          teamnameSmall: "TA",
          clubId: 1,
          verzicht: false,
        },
        anzspiele: 20,
        anzGewinnpunkte: 30,
        anzVerlustpunkte: 10,
        s: 15,
        n: 5,
        koerbe: 1500,
        gegenKoerbe: 1300,
        korbdiff: 200,
      },
    ],
    gameDetails: new Map(),
    ...overrides,
  };
}

describe("syncStandingsFromData", () => {
  it("returns empty result for empty input", async () => {
    const result = await syncStandingsFromData([]);

    expect(result.total).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("skips league without leagueDbId", async () => {
    const data = makeLeagueData({ leagueDbId: null });

    const result = await syncStandingsFromData([data]);

    expect(result.total).toBe(0);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining("No DB ID")]));
  });

  it("skips entries without teamPermanentId", async () => {
    const data = makeLeagueData({
      tabelle: [
        {
          rang: 1,
          team: null as never,
          anzspiele: 10,
          anzGewinnpunkte: 20,
          anzVerlustpunkte: 10,
          s: 10,
          n: 0,
          koerbe: 800,
          gegenKoerbe: 600,
          korbdiff: 200,
        },
      ],
    });

    const result = await syncStandingsFromData([data]);

    expect(result.total).toBe(0);
  });

  it("creates standings", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1, createdAt: FROZEN_TIME }]),
        }),
      }),
    });

    const result = await syncStandingsFromData([makeLeagueData()]);

    expect(result.total).toBe(1);
    expect(result.created).toBe(1);
  });

  it("detects updated standings", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1, createdAt: oldDate }]),
        }),
      }),
    });

    const result = await syncStandingsFromData([makeLeagueData()]);

    expect(result.updated).toBe(1);
  });

  it("calculates skipped count", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await syncStandingsFromData([makeLeagueData()]);

    expect(result.skipped).toBe(1);
  });

  it("handles batch error", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      }),
    });

    const result = await syncStandingsFromData([makeLeagueData()]);

    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it("handles non-Error exception", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(42),
        }),
      }),
    });

    const result = await syncStandingsFromData([makeLeagueData()]);

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("logs success to logger", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncStandingsFromData([makeLeagueData()], mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "standing", action: "updated" }),
    );
  });

  it("logs failure to logger", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("fail")),
        }),
      }),
    });
    const mockLogger = { log: vi.fn() };

    await syncStandingsFromData([makeLeagueData()], mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });

  it("includes durationMs", async () => {
    const result = await syncStandingsFromData([]);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("processes multiple leagues", async () => {
    const league1 = makeLeagueData({ leagueDbId: 1 });
    const league2 = makeLeagueData({ leagueApiId: 2, leagueDbId: 2 });
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 1, createdAt: FROZEN_TIME },
            { id: 2, createdAt: FROZEN_TIME },
          ]),
        }),
      }),
    });

    const result = await syncStandingsFromData([league1, league2]);

    expect(result.total).toBe(2);
  });
});
