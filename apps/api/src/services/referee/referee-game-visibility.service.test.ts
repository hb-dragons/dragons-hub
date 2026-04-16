import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

let selectCallIndex = 0;
const selectReturnValues: unknown[] = [];

const mockSelect = vi.fn().mockImplementation(() => {
  const result = selectReturnValues[selectCallIndex++];
  return buildChain(result);
});

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
    sr1Status: "rg.sr1Status",
    sr2Status: "rg.sr2Status",
    isCancelled: "rg.isCancelled",
    isForfeited: "rg.isForfeited",
    lastSyncedAt: "rg.lastSyncedAt",
    isHomeGame: "rg.isHomeGame",
    isGuestGame: "rg.isGuestGame",
    homeTeamId: "rg.homeTeamId",
    guestTeamId: "rg.guestTeamId",
  },
  referees: {
    id: "ref.id",
    allowAllHomeGames: "ref.allowAllHomeGames",
    allowAwayGames: "ref.allowAwayGames",
  },
  refereeAssignmentRules: {
    refereeId: "rar.refereeId",
    teamId: "rar.teamId",
    deny: "rar.deny",
    allowSr1: "rar.allowSr1",
    allowSr2: "rar.allowSr2",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args.filter(Boolean) })),
  or: vi.fn((...args: unknown[]) => ({ or: args.filter(Boolean) })),
  gte: vi.fn((...args: unknown[]) => ({ gte: args })),
  lte: vi.fn((...args: unknown[]) => ({ lte: args })),
  ilike: vi.fn((...args: unknown[]) => ({ ilike: args })),
  asc: vi.fn((...args: unknown[]) => ({ asc: args })),
  inArray: vi.fn((...args: unknown[]) => ({ inArray: args })),
  isNull: vi.fn((...args: unknown[]) => ({ isNull: args })),
  not: vi.fn((...args: unknown[]) => ({ not: args })),
  sql: Object.assign(
    vi.fn((...args: unknown[]) => ({ sql: args, as: vi.fn().mockReturnValue("sql_aliased") })),
    { raw: vi.fn((s: string) => ({ raw: s })) },
  ),
}));

// --- Imports (after mocks) ---

import { getVisibleRefereeGames } from "./referee-game-visibility.service";

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
    sr1Status: "open",
    sr2Status: "offered",
    isCancelled: false,
    isForfeited: false,
    isHomeGame: true,
    isGuestGame: false,
    lastSyncedAt: new Date("2026-04-14T10:00:00Z"),
    homeTeamId: 10,
    guestTeamId: 20,
    ...overrides,
  };
}

/**
 * Sets up db.select return values in order:
 * 1. Referee lookup
 * 2. Rules lookup
 * 3. Items query (only if visibility produces conditions)
 * 4. Count query (only if visibility produces conditions)
 */
function setupMocks(
  referee: { allowAllHomeGames: boolean; allowAwayGames: boolean } | null,
  rules: Array<{ teamId: number; deny: boolean; allowSr1: boolean; allowSr2: boolean }>,
  items: unknown[] = [],
  count = 0,
) {
  selectReturnValues.length = 0;
  // 1. Referee lookup
  selectReturnValues.push(referee ? [referee] : []);
  if (referee) {
    // 2. Rules lookup
    selectReturnValues.push(rules);
    // 3 & 4. Items + count
    selectReturnValues.push(items);
    selectReturnValues.push([{ count }]);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  selectCallIndex = 0;
  selectReturnValues.length = 0;
});

describe("getVisibleRefereeGames", () => {
  const defaultParams = { limit: 20, offset: 0 };

  it("returns empty when referee not found", async () => {
    setupMocks(null, []);

    const result = await getVisibleRefereeGames(999, defaultParams);

    expect(result).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
  });

  it("returns empty when both flags false and no rules", async () => {
    setupMocks({ allowAllHomeGames: false, allowAwayGames: false }, []);

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
    // Should only have made referee + rules queries (early return)
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("allowAllHomeGames=true returns all home games with open our-club slots", async () => {
    const row = makeGameRow();
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(mockSelect).toHaveBeenCalledTimes(4);
  });

  it("allowAllHomeGames=true with deny rule excludes denied team home games", async () => {
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [{ teamId: 10, deny: true, allowSr1: false, allowSr2: false }],
      [],
      0,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("allowAllHomeGames=true with deny rule still shows games with null homeTeamId", async () => {
    const row = makeGameRow({ homeTeamId: null });
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [{ teamId: 10, deny: true, allowSr1: false, allowSr2: false }],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(1);
  });

  it("allowlist mode returns only home games for allowed teams", async () => {
    const row = makeGameRow({ homeTeamId: 10 });
    setupMocks(
      { allowAllHomeGames: false, allowAwayGames: false },
      [{ teamId: 10, deny: false, allowSr1: true, allowSr2: true }],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("allowlist mode: hides game when open slot does not match allowed slots", async () => {
    // Rule only allows SR1, but only SR2 is open — DB query returns nothing
    setupMocks(
      { allowAllHomeGames: false, allowAwayGames: false },
      [{ teamId: 10, deny: false, allowSr1: true, allowSr2: false }],
      [],
      0,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(0);
  });

  it("allowlist mode: shows game when allowed slot matches open slot", async () => {
    const row = makeGameRow({
      sr1OurClub: true, sr1Status: "open",
      sr2OurClub: true, sr2Status: "assigned",
    });
    setupMocks(
      { allowAllHomeGames: false, allowAwayGames: false },
      [{ teamId: 10, deny: false, allowSr1: true, allowSr2: false }],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(1);
  });

  it("allowlist mode with rule allowing neither slot returns empty (early return)", async () => {
    setupMocks(
      { allowAllHomeGames: false, allowAwayGames: false },
      [{ teamId: 10, deny: false, allowSr1: false, allowSr2: false }],
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
    // Early return: only referee + rules queries
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("allowAwayGames=true shows away games", async () => {
    const row = makeGameRow({ isHomeGame: false, isGuestGame: true });
    setupMocks(
      { allowAllHomeGames: false, allowAwayGames: true },
      [],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.isHomeGame).toBe(false);
  });

  it("allowAwayGames=false hides away games (only home shown)", async () => {
    // allowAllHomeGames=true so home games are visible,
    // but away games hidden because allowAwayGames=false
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      [],
      0,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(0);
  });

  it("excludes cancelled games by default (active status filter)", async () => {
    const row = makeGameRow({ isCancelled: false, isForfeited: false });
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: true },
      [],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.isCancelled).toBe(false);
  });

  it("excludes games with no open our-club slots", async () => {
    // The openOurClubSlot filter is in the WHERE; DB returns nothing
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: true },
      [],
      [],
      0,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(0);
  });

  it("applies search filter on top of visibility", async () => {
    const row = makeGameRow({ homeTeamName: "Dragons U16" });
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, {
      ...defaultParams,
      search: "Dragons",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.homeTeamName).toBe("Dragons U16");
  });

  it("applies league filter on top of visibility", async () => {
    const row = makeGameRow({ leagueShort: "BL" });
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, {
      ...defaultParams,
      league: "BL",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.leagueShort).toBe("BL");
  });

  it("applies date range filters", async () => {
    const row = makeGameRow({ kickoffDate: "2026-05-01" });
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, {
      ...defaultParams,
      dateFrom: "2026-04-01",
      dateTo: "2026-06-01",
    });

    expect(result.items).toHaveLength(1);
  });

  it("returns paginated results with hasMore", async () => {
    const row = makeGameRow();
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      [row],
      5,
    );

    const result = await getVisibleRefereeGames(1, { limit: 1, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(5);
    expect(result.hasMore).toBe(true);
    expect(result.limit).toBe(1);
    expect(result.offset).toBe(0);
  });

  it("returns hasMore=false when on last page", async () => {
    const row = makeGameRow();
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, { limit: 20, offset: 0 });

    expect(result.hasMore).toBe(false);
  });

  it("combines home and away visibility", async () => {
    const homeRow = makeGameRow({ isHomeGame: true });
    const awayRow = makeGameRow({ id: 2, isHomeGame: false, isGuestGame: true });
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: true },
      [],
      [homeRow, awayRow],
      2,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("filters by cancelled status", async () => {
    const row = makeGameRow({ isCancelled: true });
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, {
      ...defaultParams,
      status: "cancelled",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.isCancelled).toBe(true);
  });

  it("filters by forfeited status", async () => {
    const row = makeGameRow({ isForfeited: true });
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, {
      ...defaultParams,
      status: "forfeited",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.isForfeited).toBe(true);
  });

  it("status 'all' does not filter cancelled/forfeited", async () => {
    const rows = [
      makeGameRow(),
      makeGameRow({ id: 2, isCancelled: true }),
    ];
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      rows,
      2,
    );

    const result = await getVisibleRefereeGames(1, {
      ...defaultParams,
      status: "all",
    });

    expect(result.items).toHaveLength(2);
  });

  it("defaults total to 0 when count result is empty", async () => {
    selectReturnValues.push(
      [{ allowAllHomeGames: true, allowAwayGames: false }],
      [],     // rules
      [],     // items
      [],     // empty count
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.total).toBe(0);
  });

  it("allowlist mode with multiple rules combines them with OR", async () => {
    const row1 = makeGameRow({ homeTeamId: 10 });
    const row2 = makeGameRow({ id: 2, homeTeamId: 20 });
    setupMocks(
      { allowAllHomeGames: false, allowAwayGames: false },
      [
        { teamId: 10, deny: false, allowSr1: true, allowSr2: false },
        { teamId: 20, deny: false, allowSr1: false, allowSr2: true },
      ],
      [row1, row2],
      2,
    );

    const result = await getVisibleRefereeGames(1, defaultParams);

    expect(result.items).toHaveLength(2);
  });

  it("multi-word search splits into separate conditions", async () => {
    const row = makeGameRow({ homeTeamName: "Dragons U16", leagueName: "Kreisliga" });
    setupMocks(
      { allowAllHomeGames: true, allowAwayGames: false },
      [],
      [row],
      1,
    );

    const result = await getVisibleRefereeGames(1, {
      ...defaultParams,
      search: "Dragons Kreisliga",
    });

    expect(result.items).toHaveLength(1);
  });
});
