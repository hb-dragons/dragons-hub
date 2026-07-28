import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { getEligibleOpenGames, getEligibleOpenGamesForReferee } from "./eligible-open-games.service";

// --- Mocks (hoisted before imports) ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked — the new
// getEligibleOpenGamesForReferee wrapper runs a real referee lookup, and this
// runs it against a real (in-process PGlite) Postgres rather than a stubbed
// `eq`. referee-assignment.service and referee-games.service stay mocked: they
// are what getEligibleOpenGames itself calls out to (the federation-backed
// candidate search and the open-games list), unrelated to the wrapper's own
// referee lookup.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("./referee-assignment.service", () => ({
  searchCandidates: vi.fn(),
}));
vi.mock("./referee-games.service", () => ({
  getRefereeGames: vi.fn(),
}));

import { searchCandidates } from "./referee-assignment.service";
import { getRefereeGames } from "./referee-games.service";
import { referees } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

const mockedSearch = vi.mocked(searchCandidates);
const mockedGames = vi.mocked(getRefereeGames);

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// Minimal SdkRefCandidate fixture — fields required by isRefereeEligibleForGame
// plus srId for identification. Other SdkRefCandidate fields are cast via `as any`.
const makeCandidate = (srId: number, overrides: {
  qualiSr1?: boolean;
  qualiSr2?: boolean;
  srModusMismatchSr1?: boolean;
  srModusMismatchSr2?: boolean;
  blocktermin?: boolean;
  zeitraumBlockiert?: string | null;
} = {}) => ({
  srId,
  qualiSr1: true,
  qualiSr2: true,
  srModusMismatchSr1: false,
  srModusMismatchSr2: false,
  blocktermin: false,
  zeitraumBlockiert: null,
  // required SdkRefCandidate fields not used by eligibility logic
  vorname: "Test",
  nachName: "User",
  email: "test@example.com",
  lizenznr: 1000,
  strasse: "Teststr. 1",
  plz: "10115",
  ort: "Berlin",
  distanceKm: "10.0",
  qmaxSr1: null,
  qmaxSr2: null,
  warning: [],
  meta: { total: 5 } as any,
  qualiSr3: false,
  qualiCoa: false,
  qualiKom: false,
  ansetzungAmTag: false,
  srGruppen: [],
  ...overrides,
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

describe("getEligibleOpenGames", () => {
  it("returns games where the referee is eligible for at least one open slot", async () => {
    mockedGames.mockResolvedValueOnce({
      items: [
        // Game 100: SR1 open, ref eligible for slot 1
        {
          id: 1, apiMatchId: 100,
          sr1Status: "open", sr2Status: "assigned",
          sr1RefereeApiId: null, sr2RefereeApiId: 999,
        } as any,
        // Game 200: SR2 open, ref ineligible for slot 2 (modus mismatch)
        {
          id: 2, apiMatchId: 200,
          sr1Status: "assigned", sr2Status: "open",
          sr1RefereeApiId: 888, sr2RefereeApiId: null,
        } as any,
      ],
      total: 2, limit: 500, offset: 0, hasMore: false,
    });

    mockedSearch
      // for game 100 slot 1: ref srId=555 is eligible
      .mockResolvedValueOnce({
        results: [makeCandidate(555, { qualiSr1: true, srModusMismatchSr1: false })],
        total: 1,
      } as any)
      // for game 200 slot 2: ref srId=555 has modus mismatch → ineligible
      .mockResolvedValueOnce({
        results: [makeCandidate(555, { qualiSr2: true, srModusMismatchSr2: true })],
        total: 1,
      } as any);

    const result = await getEligibleOpenGames(555);

    expect(result.items.map((g) => g.apiMatchId)).toEqual([100]);
  });

  it("returns empty when no open games exist", async () => {
    mockedGames.mockResolvedValueOnce({
      items: [], total: 0, limit: 500, offset: 0, hasMore: false,
    });

    const result = await getEligibleOpenGames(555);

    expect(result.items).toEqual([]);
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("excludes games where both slots are assigned (no open slot to check)", async () => {
    mockedGames.mockResolvedValueOnce({
      items: [
        {
          id: 3, apiMatchId: 300,
          sr1Status: "assigned", sr2Status: "assigned",
          sr1RefereeApiId: 100, sr2RefereeApiId: 200,
        } as any,
      ],
      total: 1, limit: 500, offset: 0, hasMore: false,
    });

    const result = await getEligibleOpenGames(555);

    expect(result.items).toEqual([]);
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("excludes games where the referee is not in the federation candidate list", async () => {
    mockedGames.mockResolvedValueOnce({
      items: [
        {
          id: 4, apiMatchId: 400,
          sr1Status: "open", sr2Status: "assigned",
          sr1RefereeApiId: null, sr2RefereeApiId: 999,
        } as any,
      ],
      total: 1, limit: 500, offset: 0, hasMore: false,
    });

    // Candidate list returns different referee, not srId=555
    mockedSearch.mockResolvedValueOnce({
      results: [makeCandidate(777)],
      total: 1,
    } as any);

    const result = await getEligibleOpenGames(555);

    expect(result.items).toEqual([]);
  });

  it("calls searchCandidates with correct spielplanId and open slot number", async () => {
    mockedGames.mockResolvedValueOnce({
      items: [
        {
          id: 5, apiMatchId: 500,
          sr1Status: "assigned", sr2Status: "open",
          sr1RefereeApiId: 100, sr2RefereeApiId: null,
        } as any,
      ],
      total: 1, limit: 500, offset: 0, hasMore: false,
    });

    mockedSearch.mockResolvedValueOnce({
      results: [makeCandidate(555)],
      total: 1,
    } as any);

    await getEligibleOpenGames(555);

    // Should call with spielplanId=500 and slot=2 (SR2 is open)
    expect(mockedSearch).toHaveBeenCalledWith(500, "", 0, 100, 2);
  });

  it("calls getRefereeGames with status=active to exclude cancelled/forfeited games", async () => {
    mockedGames.mockResolvedValueOnce({
      items: [], total: 0, limit: 500, offset: 0, hasMore: false,
    });

    await getEligibleOpenGames(555);

    expect(mockedGames).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
  });

  it("processes candidates with bounded concurrency, preserving game order", async () => {
    // 12 open games, each with SR1 open and no assigned referee
    const GAME_COUNT = 12;
    const gameItems = Array.from({ length: GAME_COUNT }, (_, i) => ({
      id: i + 1,
      apiMatchId: (i + 1) * 100, // 100, 200, ..., 1200
      sr1Status: "open",
      sr2Status: "assigned",
      sr1RefereeApiId: null,
      sr2RefereeApiId: 999,
    }));

    mockedGames.mockResolvedValueOnce({
      items: gameItems as any,
      total: GAME_COUNT,
      limit: 500,
      offset: 0,
      hasMore: false,
    });

    // Each searchCandidates call takes ~10ms; sequential would be ~120ms
    mockedSearch.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return {
        results: [makeCandidate(42)],
        total: 1,
      } as any;
    });

    const start = Date.now();
    const result = await getEligibleOpenGames(42);
    const elapsed = Date.now() - start;

    // Sequential (12 × 10ms) ≈ 120ms; concurrency-5 should finish well under 80ms
    expect(elapsed).toBeLessThan(80);

    // Promise.all preserves input order, so output apiMatchIds should match input order
    const expectedIds = gameItems.map((g) => g.apiMatchId);
    expect(result.items.map((g) => g.apiMatchId)).toEqual(expectedIds);
  });
});

describe("getEligibleOpenGamesForReferee", () => {
  it("throws NOT_FOUND for an unknown referee id", async () => {
    await expect(getEligibleOpenGamesForReferee(999999)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("resolves the requested referee's apiId, not another row's", async () => {
    // Two referees, two different apiIds. The federation candidate list below
    // only names apiId 3131 as eligible, so this can only pass if the wrapper
    // looked up the apiId that belongs to the referee id it was actually
    // called with — a wrapper that resolved the wrong row (e.g. always the
    // first referee inserted) would flip which of these two calls comes back
    // empty.
    mockedGames.mockResolvedValue({
      items: [
        {
          id: 1,
          apiMatchId: 700,
          sr1Status: "open",
          sr2Status: "assigned",
          sr1RefereeApiId: null,
          sr2RefereeApiId: 999,
        } as any,
      ],
      total: 1,
      limit: 500,
      offset: 0,
      hasMore: false,
    });
    mockedSearch.mockResolvedValue({
      results: [makeCandidate(3131)],
      total: 1,
    } as any);

    const [decoy] = await ctx.db
      .insert(referees)
      .values({ apiId: 4242, firstName: "Decoy", lastName: "Ref", isOwnClub: true })
      .returning({ id: referees.id });
    const [target] = await ctx.db
      .insert(referees)
      .values({ apiId: 3131, firstName: "Ref", lastName: "Target", isOwnClub: true })
      .returning({ id: referees.id });

    const decoyResult = await getEligibleOpenGamesForReferee(decoy!.id);
    expect(decoyResult.items).toEqual([]);

    const targetResult = await getEligibleOpenGamesForReferee(target!.id);
    expect(targetResult.items.map((g) => g.apiMatchId)).toEqual([700]);
  });
});
