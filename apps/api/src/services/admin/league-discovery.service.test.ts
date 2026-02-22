import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  leagues: {
    id: "id",
    apiLigaId: "apiLigaId",
    ligaNr: "ligaNr",
    name: "name",
    seasonId: "seasonId",
    seasonName: "seasonName",
    skName: "skName",
    akName: "akName",
    geschlecht: "geschlecht",
    isTracked: "isTracked",
    discoveredAt: "discoveredAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  notInArray: vi.fn((...args: unknown[]) => ({ notInArray: args })),
}));

const mockGetAllLigen = vi.fn();
vi.mock("../sync/sdk-client", () => ({
  sdkClient: {
    getAllLigen: (...args: unknown[]) => mockGetAllLigen(...args),
  },
}));

import { resolveAndSaveLeagues, getTrackedLeagues } from "./league-discovery.service";

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Helpers ---

function makeLiga(overrides: Record<string, unknown> = {}) {
  return {
    ligaId: 58001,
    liganr: 4102,
    liganame: "Regionalliga West",
    seasonId: 2025,
    seasonName: "2025/26",
    skName: "RL",
    akName: "Herren",
    geschlecht: "m",
    verbandId: 7,
    verbandName: "DBB",
    ...overrides,
  };
}

function mockSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function mockSelectTrackedChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function mockUpdateChain(returningRows: unknown[] = []) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returningRows),
      }),
    }),
  };
}

function mockUpdateSimpleChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function mockInsertChain() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

describe("resolveAndSaveLeagues", () => {
  it("resolves matching leagues and creates new DB entries", async () => {
    mockGetAllLigen.mockResolvedValue([makeLiga()]);

    // First call: select for upsert check (no existing)
    // Second call: update for untracking
    let selectCallCount = 0;
    mockSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return mockSelectChain([]);
      }
      return mockSelectChain([]);
    });
    mockInsert.mockReturnValue(mockInsertChain());
    mockUpdate.mockReturnValue(mockUpdateChain([]));

    const result = await resolveAndSaveLeagues([4102]);

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]).toMatchObject({
      ligaNr: 4102,
      ligaId: 58001,
      name: "Regionalliga West",
      seasonName: "2025/26",
    });
    expect(result.notFound).toHaveLength(0);
    expect(result.tracked).toBe(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("updates existing leagues instead of inserting", async () => {
    mockGetAllLigen.mockResolvedValue([makeLiga()]);
    mockSelect.mockReturnValue(mockSelectChain([{ id: 10, apiLigaId: 58001 }]));
    mockUpdate
      .mockReturnValueOnce(mockUpdateSimpleChain()) // upsert update
      .mockReturnValueOnce(mockUpdateChain([])); // untrack update

    const result = await resolveAndSaveLeagues([4102]);

    expect(result.resolved).toHaveLength(1);
    expect(result.tracked).toBe(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(2); // upsert + untrack
  });

  it("reports not-found league numbers", async () => {
    mockGetAllLigen.mockResolvedValue([makeLiga()]);
    mockSelect.mockReturnValue(mockSelectChain([]));
    mockInsert.mockReturnValue(mockInsertChain());
    mockUpdate.mockReturnValue(mockUpdateChain([]));

    const result = await resolveAndSaveLeagues([4102, 9999]);

    expect(result.resolved).toHaveLength(1);
    expect(result.notFound).toEqual([9999]);
    expect(result.tracked).toBe(1);
  });

  it("handles all not-found league numbers", async () => {
    mockGetAllLigen.mockResolvedValue([makeLiga()]);
    mockUpdate.mockReturnValue(mockUpdateChain([{ id: 5 }]));

    const result = await resolveAndSaveLeagues([9999, 8888]);

    expect(result.resolved).toHaveLength(0);
    expect(result.notFound).toEqual([9999, 8888]);
    expect(result.tracked).toBe(0);
    expect(result.untracked).toBe(1);
  });

  it("untracks previously tracked leagues not in new set", async () => {
    mockGetAllLigen.mockResolvedValue([makeLiga()]);
    mockSelect.mockReturnValue(mockSelectChain([]));
    mockInsert.mockReturnValue(mockInsertChain());
    mockUpdate.mockReturnValue(mockUpdateChain([{ id: 3 }, { id: 7 }]));

    const result = await resolveAndSaveLeagues([4102]);

    expect(result.untracked).toBe(2);
  });

  it("untracks all when empty array is passed", async () => {
    mockGetAllLigen.mockResolvedValue([makeLiga()]);
    mockUpdate.mockReturnValue(mockUpdateChain([{ id: 1 }]));

    const result = await resolveAndSaveLeagues([]);

    expect(result.resolved).toHaveLength(0);
    expect(result.tracked).toBe(0);
    expect(result.untracked).toBe(1);
  });

  it("handles empty SDK response", async () => {
    mockGetAllLigen.mockResolvedValue([]);
    mockUpdate.mockReturnValue(mockUpdateChain([]));

    const result = await resolveAndSaveLeagues([4102]);

    expect(result.resolved).toHaveLength(0);
    expect(result.notFound).toEqual([4102]);
    expect(result.tracked).toBe(0);
  });

  it("handles null optional fields from SDK", async () => {
    mockGetAllLigen.mockResolvedValue([
      makeLiga({
        seasonId: null,
        seasonName: null,
        skName: null,
        akName: null,
        geschlecht: null,
        verbandId: null,
        verbandName: null,
      }),
    ]);
    mockSelect.mockReturnValue(mockSelectChain([]));
    mockInsert.mockReturnValue(mockInsertChain());
    mockUpdate.mockReturnValue(mockUpdateChain([]));

    const result = await resolveAndSaveLeagues([4102]);

    expect(result.resolved[0]).toMatchObject({
      ligaNr: 4102,
      seasonName: "",
    });
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("resolves multiple leagues from different liganr values", async () => {
    mockGetAllLigen.mockResolvedValue([
      makeLiga({ ligaId: 58001, liganr: 4102, liganame: "Liga A" }),
      makeLiga({ ligaId: 58002, liganr: 4105, liganame: "Liga B" }),
      makeLiga({ ligaId: 58003, liganr: 4003, liganame: "Liga C" }),
    ]);
    mockSelect.mockReturnValue(mockSelectChain([]));
    mockInsert.mockReturnValue(mockInsertChain());
    mockUpdate.mockReturnValue(mockUpdateChain([]));

    const result = await resolveAndSaveLeagues([4102, 4105]);

    expect(result.resolved).toHaveLength(2);
    expect(result.notFound).toHaveLength(0);
    expect(result.tracked).toBe(2);
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });
});

describe("getTrackedLeagues", () => {
  it("returns tracked leagues with league numbers", async () => {
    mockSelect.mockReturnValue(
      mockSelectTrackedChain([
        { id: 1, ligaNr: 4102, apiLigaId: 58001, name: "Regionalliga West", seasonName: "2025/26" },
        { id: 2, ligaNr: 4105, apiLigaId: 58002, name: "Oberliga", seasonName: "2025/26" },
      ]),
    );

    const result = await getTrackedLeagues();

    expect(result.leagueNumbers).toEqual([4102, 4105]);
    expect(result.leagues).toHaveLength(2);
    expect(result.leagues[0]).toMatchObject({ id: 1, ligaNr: 4102, name: "Regionalliga West" });
  });

  it("returns empty state when no tracked leagues", async () => {
    mockSelect.mockReturnValue(mockSelectTrackedChain([]));

    const result = await getTrackedLeagues();

    expect(result.leagueNumbers).toEqual([]);
    expect(result.leagues).toHaveLength(0);
  });
});
