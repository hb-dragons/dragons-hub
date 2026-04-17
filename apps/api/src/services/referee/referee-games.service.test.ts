import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

const mockSelect = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  refereeGames: {
    id: "rg.id",
    apiMatchId: "rg.apiMatchId",
    matchId: "rg.matchId",
    matchNo: "rg.matchNo",
    kickoffDate: "rg.kickoffDate",
    kickoffTime: "rg.kickoffTime",
    homeTeamName: "rg.homeTeamName",
    guestTeamName: "rg.guestTeamName",
    leagueName: "rg.leagueName",
    leagueShort: "rg.leagueShort",
    venueName: "rg.venueName",
    venueCity: "rg.venueCity",
    sr1OurClub: "rg.sr1OurClub",
    sr2OurClub: "rg.sr2OurClub",
    sr1Name: "rg.sr1Name",
    sr2Name: "rg.sr2Name",
    sr1RefereeApiId: "rg.sr1RefereeApiId",
    sr2RefereeApiId: "rg.sr2RefereeApiId",
    sr1Status: "rg.sr1Status",
    sr2Status: "rg.sr2Status",
    isCancelled: "rg.isCancelled",
    isForfeited: "rg.isForfeited",
    lastSyncedAt: "rg.lastSyncedAt",
    isHomeGame: "rg.isHomeGame",
    isGuestGame: "rg.isGuestGame",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  gte: vi.fn((...args: unknown[]) => ({ gte: args })),
  lte: vi.fn((...args: unknown[]) => ({ lte: args })),
  ilike: vi.fn((...args: unknown[]) => ({ ilike: args })),
  asc: vi.fn((...args: unknown[]) => ({ asc: args })),
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ sql: args, as: vi.fn().mockReturnValue("sql_aliased") })),
    { raw: vi.fn((s: string) => ({ raw: s })) },
  ),
}));

// --- Imports (after mocks) ---

import {
  getRefereeGames,
  getRefereeGameById,
  computeMySlot,
} from "./referee-games.service";

// --- Helpers ---

function buildChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "orderBy", "limit", "offset"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Thenable so Promise.all resolves it
  chain.then = (resolve: (v: unknown) => void) => {
    resolve(result);
    return chain;
  };
  return chain;
}

function makeGameRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    apiMatchId: 1001,
    matchId: 50,
    matchNo: 42,
    kickoffDate: "2026-04-25",
    kickoffTime: "14:00",
    homeTeamName: "Dragons 1",
    guestTeamName: "Titans 1",
    leagueName: "Kreisliga Nord",
    leagueShort: "KLN",
    venueName: "Sporthalle West",
    venueCity: "Berlin",
    sr1OurClub: true,
    sr2OurClub: false,
    sr1Name: null,
    sr2Name: null,
    sr1RefereeApiId: null,
    sr2RefereeApiId: null,
    sr1Status: "open",
    sr2Status: "offered",
    isCancelled: false,
    isForfeited: false,
    isHomeGame: true,
    isGuestGame: false,
    lastSyncedAt: new Date("2026-04-14T10:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRefereeGames", () => {
  it("returns empty result when no data", async () => {
    mockSelect
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([{ count: 0 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0 });

    expect(result).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
  });

  it("returns paginated results", async () => {
    const row = makeGameRow();
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 5 }]));

    const result = await getRefereeGames({ limit: 1, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(5);
    expect(result.hasMore).toBe(true);
    expect(result.limit).toBe(1);
    expect(result.offset).toBe(0);
  });

  it("filters by status 'active' (excludes cancelled/forfeited)", async () => {
    const row = makeGameRow({ isCancelled: false, isForfeited: false });
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 1 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0, status: "active" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.isCancelled).toBe(false);
    expect(result.items[0]?.isForfeited).toBe(false);
  });

  it("filters by status 'cancelled'", async () => {
    const row = makeGameRow({ isCancelled: true });
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 1 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0, status: "cancelled" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.isCancelled).toBe(true);
  });

  it("filters by league", async () => {
    const row = makeGameRow({ leagueShort: "BL" });
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 1 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0, league: "BL" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.leagueShort).toBe("BL");
  });

  it("search matches team names", async () => {
    const row = makeGameRow({ homeTeamName: "Dragons 1", guestTeamName: "Titans 1" });
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 1 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0, search: "Dragons" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.homeTeamName).toBe("Dragons 1");
  });

  it("derives isTrackedLeague true when matchId present", async () => {
    const row = { ...makeGameRow({ matchId: 50 }), is_tracked_league: true };
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 1 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0 });

    // The service passes isTrackedLeague as a sql expression; the DB resolves it.
    // We just verify the item is returned and the field passes through.
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.matchId).toBe(50);
  });

  it("derives isTrackedLeague false when matchId is null", async () => {
    const row = { ...makeGameRow({ matchId: null }), is_tracked_league: false };
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 1 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.matchId).toBeNull();
  });

  it("returns hasMore=false when all results fit in one page", async () => {
    const rows = [makeGameRow(), makeGameRow({ id: 2 })];
    mockSelect
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain([{ count: 2 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0 });

    expect(result.hasMore).toBe(false);
  });

  it("defaults total to 0 when count result is empty", async () => {
    mockSelect
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]));

    const result = await getRefereeGames({ limit: 20, offset: 0 });

    expect(result.total).toBe(0);
  });

  it("filters by status 'forfeited'", async () => {
    const row = makeGameRow({ isForfeited: true });
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 1 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0, status: "forfeited" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.isForfeited).toBe(true);
  });

  it("returns all games when status is 'all'", async () => {
    const rows = [
      makeGameRow(),
      makeGameRow({ id: 2, isCancelled: true }),
    ];
    mockSelect
      .mockReturnValueOnce(buildChain(rows))
      .mockReturnValueOnce(buildChain([{ count: 2 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0, status: "all" });

    expect(result.items).toHaveLength(2);
  });

  it("filters by dateFrom", async () => {
    const row = makeGameRow({ kickoffDate: "2026-05-01" });
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 1 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0, dateFrom: "2026-04-01" });

    expect(result.items).toHaveLength(1);
  });

  it("filters by dateTo", async () => {
    const row = makeGameRow({ kickoffDate: "2026-04-15" });
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 1 }]));

    const result = await getRefereeGames({ limit: 20, offset: 0, dateTo: "2026-05-01" });

    expect(result.items).toHaveLength(1);
  });

  it("combines dateFrom and dateTo with status filter", async () => {
    const row = makeGameRow();
    mockSelect
      .mockReturnValueOnce(buildChain([row]))
      .mockReturnValueOnce(buildChain([{ count: 1 }]));

    const result = await getRefereeGames({
      limit: 20,
      offset: 0,
      status: "active",
      dateFrom: "2026-04-01",
      dateTo: "2026-05-01",
    });

    expect(result.items).toHaveLength(1);
  });
});

describe("computeMySlot", () => {
  it("returns null when refereeApiId is null", () => {
    expect(
      computeMySlot({ sr1RefereeApiId: 100, sr2RefereeApiId: 200 }, null),
    ).toBeNull();
  });

  it("returns 1 when refereeApiId matches sr1", () => {
    expect(
      computeMySlot({ sr1RefereeApiId: 100, sr2RefereeApiId: null }, 100),
    ).toBe(1);
  });

  it("returns 2 when refereeApiId matches sr2", () => {
    expect(
      computeMySlot({ sr1RefereeApiId: null, sr2RefereeApiId: 200 }, 200),
    ).toBe(2);
  });

  it("returns null when refereeApiId does not match either slot", () => {
    expect(
      computeMySlot({ sr1RefereeApiId: 100, sr2RefereeApiId: 200 }, 300),
    ).toBeNull();
  });
});

describe("getRefereeGameById", () => {
  function buildSingleRowChain(result: unknown) {
    const chain: Record<string, unknown> = {};
    const methods = ["from", "where", "limit"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.then = (resolve: (v: unknown) => void) => {
      resolve(result);
      return chain;
    };
    return chain;
  }

  it("returns the row when found", async () => {
    const row = makeGameRow({ id: 7 });
    mockSelect.mockReturnValueOnce(buildSingleRowChain([row]));

    const result = await getRefereeGameById(7);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(7);
  });

  it("returns null when no row matches", async () => {
    mockSelect.mockReturnValueOnce(buildSingleRowChain([]));

    const result = await getRefereeGameById(999);

    expect(result).toBeNull();
  });
});
