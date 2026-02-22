import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  leagues: {
    apiLigaId: "apiLigaId",
    id: "id",
    isTracked: "isTracked",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
}));

const mockGetTabelleResponse = vi.fn();
vi.mock("./sdk-client", () => ({
  sdkClient: { getTabelleResponse: (...args: unknown[]) => mockGetTabelleResponse(...args) },
}));

vi.mock("./hash", () => ({
  computeEntityHash: vi.fn(() => "hash-abc"),
}));

import { syncLeagues } from "./leagues.sync";
import { computeEntityHash } from "./hash";

// --- Helpers ---

function makeLigaData(overrides: Record<string, unknown> = {}) {
  return {
    ligaId: 1,
    liganr: 100,
    liganame: "Test League",
    seasonId: 2025,
    seasonName: "2025/26",
    skName: "OL",
    akName: "Herren",
    geschlecht: "m",
    verbandId: 7,
    verbandName: "DBB",
    ...overrides,
  };
}

function makeTrackedLeague(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    apiLigaId: 1,
    ligaNr: 100,
    name: "Test League",
    seasonId: 0,
    seasonName: "2024",
    dataHash: "old-hash",
    isTracked: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncLeagues", () => {
  it("returns empty result when no tracked leagues in DB", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await syncLeagues();

    expect(result.total).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("updates league metadata from tabelle response", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague()]),
      }),
    });
    mockGetTabelleResponse.mockResolvedValue({
      ligaData: makeLigaData(),
      tabelle: { entries: [] },
    });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await syncLeagues();

    expect(result.updated).toBe(1);
    expect(result.total).toBe(1);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("skips league when hash matches", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague({ dataHash: "hash-abc" })]),
      }),
    });
    mockGetTabelleResponse.mockResolvedValue({
      ligaData: makeLigaData(),
      tabelle: { entries: [] },
    });

    const result = await syncLeagues();

    expect(result.skipped).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("skips league when no ligaData in response", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague()]),
      }),
    });
    mockGetTabelleResponse.mockResolvedValue({
      ligaData: null,
      tabelle: { entries: [] },
    });

    const result = await syncLeagues();

    expect(result.skipped).toBe(1);
  });

  it("skips league when tabelle response is null", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague()]),
      }),
    });
    mockGetTabelleResponse.mockResolvedValue(null);

    const result = await syncLeagues();

    expect(result.skipped).toBe(1);
  });

  it("handles per-league errors gracefully", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague()]),
      }),
    });
    mockGetTabelleResponse.mockRejectedValue(new Error("API error"));

    const result = await syncLeagues();

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Failed to sync league");
  });

  it("handles non-Error thrown objects", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague()]),
      }),
    });
    mockGetTabelleResponse.mockRejectedValue("string error");

    const result = await syncLeagues();

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("handles DB query error", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("DB down");
    });

    const result = await syncLeagues();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Failed to fetch tracked leagues");
  });

  it("handles non-Error DB query error", async () => {
    mockSelect.mockImplementation(() => {
      throw "string error";
    });

    const result = await syncLeagues();

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("passes logger on update", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague()]),
      }),
    });
    mockGetTabelleResponse.mockResolvedValue({
      ligaData: makeLigaData(),
      tabelle: { entries: [] },
    });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const mockLogger = { log: vi.fn() };
    await syncLeagues(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "updated", entityType: "league" }),
    );
  });

  it("passes logger on skip (hash match)", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague({ dataHash: "hash-abc" })]),
      }),
    });
    mockGetTabelleResponse.mockResolvedValue({
      ligaData: makeLigaData(),
      tabelle: { entries: [] },
    });

    const mockLogger = { log: vi.fn() };
    await syncLeagues(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "skipped", message: "No changes detected" }),
    );
  });

  it("passes logger on skip (no ligaData)", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague()]),
      }),
    });
    mockGetTabelleResponse.mockResolvedValue({ ligaData: null });

    const mockLogger = { log: vi.fn() };
    await syncLeagues(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "skipped", message: "No ligaData in tabelle response" }),
    );
  });

  it("passes logger on error", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague()]),
      }),
    });
    mockGetTabelleResponse.mockRejectedValue(new Error("fail"));

    const mockLogger = { log: vi.fn() };
    await syncLeagues(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });

  it("includes durationMs in result", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await syncLeagues();

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles multiple tracked leagues", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          makeTrackedLeague({ id: 10, apiLigaId: 1 }),
          makeTrackedLeague({ id: 20, apiLigaId: 2, dataHash: "hash-abc" }),
        ]),
      }),
    });
    mockGetTabelleResponse.mockResolvedValue({
      ligaData: makeLigaData(),
      tabelle: { entries: [] },
    });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await syncLeagues();

    expect(result.total).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("uses fallback name when ligaData.liganame is empty", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague({ name: "Original Name" })]),
      }),
    });
    mockGetTabelleResponse.mockResolvedValue({
      ligaData: makeLigaData({ liganame: "" }),
      tabelle: { entries: [] },
    });
    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockUpdate.mockReturnValue({ set: mockSet });

    await syncLeagues();

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Original Name" }),
    );
  });

  it("uses fallback seasonName when ligaData.seasonName is empty", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague({ seasonName: "2024" })]),
      }),
    });
    vi.mocked(computeEntityHash).mockReturnValue("different-hash");
    mockGetTabelleResponse.mockResolvedValue({
      ligaData: makeLigaData({ seasonName: "" }),
      tabelle: { entries: [] },
    });
    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockUpdate.mockReturnValue({ set: mockSet });

    await syncLeagues();

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ seasonName: "2024" }),
    );
  });

  it("handles null optional fields in ligaData", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeTrackedLeague()]),
      }),
    });
    mockGetTabelleResponse.mockResolvedValue({
      ligaData: makeLigaData({
        skName: null,
        akName: null,
        geschlecht: null,
        verbandId: null,
        verbandName: null,
      }),
      tabelle: { entries: [] },
    });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await syncLeagues();

    expect(result.updated).toBe(1);
  });
});
