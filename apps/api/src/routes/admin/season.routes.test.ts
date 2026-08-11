// apps/api/src/routes/admin/season.routes.test.ts
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import type * as SeasonServiceModule from "../../services/admin/season.service";

const mocks = vi.hoisted(() => ({
  listSeasons: vi.fn(),
  createSeason: vi.fn(),
  activateSeason: vi.fn(),
  archiveSeason: vi.fn(),
  browseLeagues: vi.fn(),
  setSeasonLeagues: vi.fn(),
  getTrackedLeagues: vi.fn(),
}));
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

// `getSeasonSummary` is left as the real implementation so it runs against
// the PGlite database below (via the `dbHolder` proxy) instead of a mock —
// its counting logic is exactly what the route's tests need to exercise.
// Every other export stays a plain mock, as before.
vi.mock("../../services/admin/season.service", async (importOriginal) => {
  const actual = await importOriginal<typeof SeasonServiceModule>();
  return {
    ...actual,
    listSeasons: mocks.listSeasons,
    createSeason: mocks.createSeason,
    activateSeason: mocks.activateSeason,
    archiveSeason: mocks.archiveSeason,
  };
});
vi.mock("../../services/admin/league-discovery.service", () => ({
  browseLeagues: mocks.browseLeagues,
  setSeasonLeagues: mocks.setSeasonLeagues,
  getTrackedLeagues: mocks.getTrackedLeagues,
}));
vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}));
vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn(), child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) },
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

import { seasonRoutes } from "./season.routes";
import { SeasonNotFoundError } from "../../services/admin/season.errors";
import { errorHandler } from "../../middleware/error";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";
import { seedActiveSeason } from "../../test/seed-season";
import { invalidateActiveSeasonCache } from "../../services/admin/season.service";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", seasonRoutes);
const json = (r: Response) => r.json();
const request = (path: string, init?: RequestInit) => app.request(path, init);

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  invalidateActiveSeasonCache();
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

describe("GET /seasons", () => {
  it("lists seasons", async () => {
    mocks.listSeasons.mockResolvedValue([{ id: 1, name: "2025/26", status: "active", leagueCount: 3 }]);
    const res = await app.request("/seasons");
    expect(res.status).toBe(200);
    expect(await json(res)).toHaveLength(1);
  });
});

describe("POST /seasons", () => {
  it("creates a season", async () => {
    mocks.createSeason.mockResolvedValue({ id: 2, name: "2026/27", status: "upcoming" });
    const res = await app.request("/seasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "2026/27" }),
    });
    expect(res.status).toBe(200);
    expect(mocks.createSeason).toHaveBeenCalledWith(expect.objectContaining({ name: "2026/27" }));
  });
  it("returns 400 for empty name", async () => {
    const res = await app.request("/seasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("POST /seasons/:id/activate", () => {
  it("activates a season", async () => {
    mocks.activateSeason.mockResolvedValue({ id: 2, name: "2026/27", status: "active" });
    const res = await app.request("/seasons/2/activate", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mocks.activateSeason).toHaveBeenCalledWith(2);
  });
  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/seasons/abc/activate", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

describe("POST /seasons/:id/archive", () => {
  it("archives a season", async () => {
    mocks.archiveSeason.mockResolvedValue({ id: 2, name: "2026/27", status: "archived" });
    const res = await app.request("/seasons/2/archive", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mocks.archiveSeason).toHaveBeenCalledWith(2);
  });
  it("returns 400 for non-numeric id on archive", async () => {
    const res = await app.request("/seasons/abc/archive", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

describe("GET /seasons/browse", () => {
  it("browses leagues without a season scope", async () => {
    mocks.browseLeagues.mockResolvedValue([{ ligaId: 54136, vorabliga: true, alreadyTracked: false }]);
    const res = await app.request("/seasons/browse?vorabligaOnly=true");
    expect(res.status).toBe(200);
    expect(mocks.browseLeagues).toHaveBeenCalledWith({ vorabligaOnly: true });
  });
  it("does not treat 'browse' as a season id", async () => {
    mocks.browseLeagues.mockResolvedValue([]);
    const res = await app.request("/seasons/browse");
    expect(res.status).toBe(200);
    expect(mocks.browseLeagues).toHaveBeenCalledWith({ vorabligaOnly: undefined });
  });
  it("threads the ownClubOnly query flag through to the service", async () => {
    mocks.browseLeagues.mockResolvedValue([]);
    const res = await app.request("/seasons/browse?vorabligaOnly=true&ownClubOnly=true");
    expect(res.status).toBe(200);
    expect(mocks.browseLeagues).toHaveBeenCalledWith({ vorabligaOnly: true, ownClubOnly: true });
  });
});

describe("GET /seasons/:id/discover", () => {
  it("returns browsable leagues", async () => {
    mocks.browseLeagues.mockResolvedValue([{ ligaId: 54136, vorabliga: true, alreadyTracked: false }]);
    const res = await app.request("/seasons/3/discover?vorabligaOnly=true");
    expect(res.status).toBe(200);
    expect(mocks.browseLeagues).toHaveBeenCalledWith({ vorabligaOnly: true, seasonId: 3 });
  });
  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/seasons/abc/discover");
    expect(res.status).toBe(400);
  });
});

describe("GET /seasons/:id/leagues", () => {
  it("returns tracked leagues for a season", async () => {
    mocks.getTrackedLeagues.mockResolvedValue({ leagueNumbers: [54136], leagues: [{ id: 1, ligaNr: 54136, apiLigaId: 54136, name: "Regionalliga West", seasonName: "2025/26", ownClubRefs: false }] });
    const res = await app.request("/seasons/3/leagues");
    expect(res.status).toBe(200);
    expect(mocks.getTrackedLeagues).toHaveBeenCalledWith(3);
  });
  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/seasons/abc/leagues");
    expect(res.status).toBe(400);
  });
});

describe("PUT /seasons/:id/leagues", () => {
  it("sets season leagues", async () => {
    mocks.setSeasonLeagues.mockResolvedValue({ tracked: 1, untracked: 0 });
    const res = await app.request("/seasons/3/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ligaIds: [54136] }),
    });
    expect(res.status).toBe(200);
    expect(mocks.setSeasonLeagues).toHaveBeenCalledWith(3, [54136]);
  });
  it("returns 400 for a non-array ligaIds", async () => {
    const res = await app.request("/seasons/3/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ligaIds: "x" }),
    });
    expect(res.status).toBe(400);
  });
  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/seasons/abc/leagues", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ligaIds: [54136] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("addressing a season that no longer exists", () => {
  // A stale seasons list, or two admins racing on the same row. This used to
  // surface as a 500 because the service threw a bare Error.
  it("answers 404 when activating a missing season", async () => {
    mocks.activateSeason.mockRejectedValue(new SeasonNotFoundError(42));

    const res = await app.request("/seasons/42/activate", { method: "POST" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("answers 404 when archiving a missing season", async () => {
    mocks.archiveSeason.mockRejectedValue(new SeasonNotFoundError(42));

    const res = await app.request("/seasons/42/archive", { method: "POST" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("GET /seasons/:id/summary", () => {
  it("returns the season's counts", async () => {
    const seasonId = await seedActiveSeason(ctx);

    const res = await request(`/seasons/${seasonId}/summary`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      leagueCount: 0,
      gameCount: 0,
      placeholderSlots: 0,
    });
  });

  it("rejects a non-numeric id", async () => {
    const res = await request("/seasons/not-a-number/summary");

    expect(res.status).toBe(400);
  });
});
