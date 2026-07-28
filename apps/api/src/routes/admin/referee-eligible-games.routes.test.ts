import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import type { EligibleOpenGamesResponse, RefereeGameListItem } from "@dragons/shared";

// --- Mocks (hoisted before imports) ---
//
// drizzle-orm, @dragons/db/schema and the eligible-open-games service are all
// deliberately real here (issue #110). The old version mocked the service and
// asserted `body.items[0].apiMatchId === 100` — the very fixture it had just
// handed the mock — so the endpoint's actual response shape was asserted
// nowhere, and the referee lookup ran through identity-stubbed `eq`. This file
// runs the route against a real (in-process PGlite) Postgres and asserts the
// serialized body against the shared `EligibleOpenGamesResponse` type.
//
// Only the federation SDK is mocked: it is the one true external dependency.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  searchRefereesForGame: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock("../../services/sync/sdk-client", () => ({
  sdkClient: {
    searchRefereesForGame: mocks.searchRefereesForGame,
  },
}));

// --- Subject (imported after mocks) ---

import { refereeEligibleGamesRoutes } from "./referee-eligible-games.routes";
import { errorHandler } from "../../middleware/error";
import { referees, refereeGames } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/admin", refereeEligibleGamesRoutes);

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.searchRefereesForGame.mockResolvedValue({ total: 0, results: [] });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Seed helpers ---

async function seedReferee(apiId: number): Promise<number> {
  const [row] = await ctx.db
    .insert(referees)
    .values({ apiId, firstName: "Max", lastName: "Muster", isOwnClub: true })
    .returning({ id: referees.id });
  return row!.id;
}

async function seedGame(
  seed: Partial<typeof refereeGames.$inferInsert> & { apiMatchId: number },
): Promise<number> {
  const [row] = await ctx.db
    .insert(refereeGames)
    .values({
      matchNo: seed.apiMatchId,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      homeTeamName: "Dragons 1",
      guestTeamName: "Titans 1",
      leagueName: "Kreisliga Nord",
      leagueShort: "KLN",
      venueName: "Sporthalle West",
      venueCity: "Berlin",
      sr1OurClub: true,
      sr2OurClub: true,
      sr1Status: "open",
      sr2Status: "assigned",
      sr2RefereeApiId: 4242,
      isHomeGame: true,
      isGuestGame: false,
      ...seed,
    })
    .returning({ id: refereeGames.id });
  return row!.id;
}

function candidate(srId: number, overrides: Record<string, unknown> = {}) {
  return {
    srId,
    vorname: "Max",
    nachName: "Muster",
    lizenznr: 100,
    qualiSr1: true,
    qualiSr2: true,
    srModusMismatchSr1: false,
    srModusMismatchSr2: false,
    blocktermin: false,
    zeitraumBlockiert: null,
    meta: { total: 1 },
    ...overrides,
  };
}

// --- Tests ---

describe("GET /admin/referees/:id/eligible-open-games", () => {
  it("returns 400 for id = 0 (invalid)", async () => {
    const res = await app.request("/admin/referees/0/eligible-open-games");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    // The route used to hand-roll `{ error, code }` with no `details`. Routing
    // the id through the shared validator now produces the same
    // `{ error, code, details }` envelope every validated route emits — this
    // asserts the shape actually changed, not just that it stayed 400.
    expect(body.details).toEqual([{ path: "id", message: expect.any(String) }]);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await app.request("/admin/referees/abc/eligible-open-games");
    expect(res.status).toBe(400);
  });

  it("returns 404 when the referee is not in the DB", async () => {
    const res = await app.request("/admin/referees/999/eligible-open-games");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("resolves the apiId of the requested referee, not another row", async () => {
    await seedReferee(111);
    const wanted = await seedReferee(555);
    await seedGame({ apiMatchId: 900 });

    const res = await app.request(`/admin/referees/${wanted}/eligible-open-games`);

    expect(res.status).toBe(200);
    // The federation is asked about the game; eligibility is then matched on
    // srId === 555, so only that referee's candidacy can produce a hit.
    expect(mocks.searchRefereesForGame).toHaveBeenCalledWith(900, {
      textSearch: null,
      pageFrom: 0,
      pageSize: 100,
    });
  });

  it("returns the eligible game as a fully-shaped RefereeGameListItem", async () => {
    const refereeId = await seedReferee(555);
    const gameId = await seedGame({
      apiMatchId: 900,
      matchNo: 42,
      lastSyncedAt: new Date("2026-04-14T10:00:00Z"),
    });
    mocks.searchRefereesForGame.mockResolvedValue({
      total: 1,
      results: [candidate(555)],
    });

    const res = await app.request(`/admin/referees/${refereeId}/eligible-open-games`);
    const body = (await res.json()) as EligibleOpenGamesResponse;

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);

    // The expected object is typed as the shared contract, so a field the API
    // stops returning (or renames) fails to compile here and fails toEqual at
    // runtime — rather than round-tripping a fixture this test wrote itself.
    const expected: RefereeGameListItem = {
      id: gameId,
      apiMatchId: 900,
      matchId: null,
      matchNo: 42,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      homeTeamName: "Dragons 1",
      guestTeamName: "Titans 1",
      leagueName: "Kreisliga Nord",
      leagueShort: "KLN",
      venueName: "Sporthalle West",
      venueCity: "Berlin",
      homeTeamId: null,
      sr1OurClub: true,
      sr2OurClub: true,
      sr1Name: null,
      sr2Name: null,
      sr1RefereeApiId: null,
      sr2RefereeApiId: 4242,
      sr1Status: "open",
      sr2Status: "assigned",
      isCancelled: false,
      isForfeited: false,
      isTrackedLeague: false,
      isHomeGame: true,
      isGuestGame: false,
      lastSyncedAt: "2026-04-14T10:00:00.000Z",
      mySlot: null,
      claimableSlots: [],
    };
    expect(body.items[0]).toEqual(expected);
  });

  it("excludes a game the referee is not a candidate for", async () => {
    const refereeId = await seedReferee(555);
    await seedGame({ apiMatchId: 900 });
    mocks.searchRefereesForGame.mockResolvedValue({
      total: 1,
      results: [candidate(999)],
    });

    const res = await app.request(`/admin/referees/${refereeId}/eligible-open-games`);
    const body = (await res.json()) as EligibleOpenGamesResponse;

    expect(res.status).toBe(200);
    expect(body.items).toEqual([]);
  });

  it("excludes a game where the referee is blocked", async () => {
    const refereeId = await seedReferee(555);
    await seedGame({ apiMatchId: 900 });
    mocks.searchRefereesForGame.mockResolvedValue({
      total: 1,
      results: [candidate(555, { blocktermin: true })],
    });

    const res = await app.request(`/admin/referees/${refereeId}/eligible-open-games`);
    const body = (await res.json()) as EligibleOpenGamesResponse;

    expect(body.items).toEqual([]);
  });

  it("checks qualification against the slot that is actually open", async () => {
    const refereeId = await seedReferee(555);
    // sr1 taken, sr2 open → eligibility is evaluated for slot 2.
    await seedGame({
      apiMatchId: 900,
      sr1Status: "assigned",
      sr1RefereeApiId: 4242,
      sr2Status: "open",
      sr2RefereeApiId: null,
    });
    mocks.searchRefereesForGame.mockResolvedValue({
      total: 1,
      results: [candidate(555, { qualiSr1: true, qualiSr2: false })],
    });

    const res = await app.request(`/admin/referees/${refereeId}/eligible-open-games`);
    const body = (await res.json()) as EligibleOpenGamesResponse;

    expect(body.items).toEqual([]);
  });

  it("skips games with no open slot without calling the federation", async () => {
    const refereeId = await seedReferee(555);
    await seedGame({
      apiMatchId: 900,
      sr1Status: "assigned",
      sr1RefereeApiId: 4242,
      sr2Status: "assigned",
      sr2RefereeApiId: 4243,
    });

    const res = await app.request(`/admin/referees/${refereeId}/eligible-open-games`);
    const body = (await res.json()) as EligibleOpenGamesResponse;

    expect(body.items).toEqual([]);
    expect(mocks.searchRefereesForGame).not.toHaveBeenCalled();
  });

  it("excludes cancelled, forfeited and withdrawn games", async () => {
    const refereeId = await seedReferee(555);
    await seedGame({ apiMatchId: 900 });
    await seedGame({ apiMatchId: 901, isCancelled: true });
    await seedGame({ apiMatchId: 902, isForfeited: true });
    await seedGame({ apiMatchId: 903, removedAt: new Date("2026-04-01T00:00:00Z") });
    mocks.searchRefereesForGame.mockResolvedValue({
      total: 1,
      results: [candidate(555)],
    });

    const res = await app.request(`/admin/referees/${refereeId}/eligible-open-games`);
    const body = (await res.json()) as EligibleOpenGamesResponse;

    expect(body.items.map((i) => i.apiMatchId)).toEqual([900]);
  });

  it("returns every eligible game, in kickoff order", async () => {
    const refereeId = await seedReferee(555);
    await seedGame({ apiMatchId: 902, kickoffDate: "2026-05-03" });
    await seedGame({ apiMatchId: 900, kickoffDate: "2026-05-01" });
    await seedGame({ apiMatchId: 901, kickoffDate: "2026-05-02" });
    mocks.searchRefereesForGame.mockResolvedValue({
      total: 1,
      results: [candidate(555)],
    });

    const res = await app.request(`/admin/referees/${refereeId}/eligible-open-games`);
    const body = (await res.json()) as EligibleOpenGamesResponse;

    expect(body.items.map((i) => i.apiMatchId)).toEqual([900, 901, 902]);
  });
});
