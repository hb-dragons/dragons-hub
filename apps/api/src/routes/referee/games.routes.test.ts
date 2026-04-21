import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  getVisibleRefereeGames: vi.fn(),
  getVisibleRefereeGameById: vi.fn(),
  getVisibleRefereeGameByMatchId: vi.fn(),
  refereeId: 42 as number | undefined,
}));

vi.mock("../../middleware/rbac", () => ({
  requireRefereeSelf: vi.fn(
    async (
      c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("user", { id: "u1", refereeId: mocks.refereeId });
      c.set("session", { id: "s1" });
      if (mocks.refereeId !== undefined) {
        c.set("refereeId", mocks.refereeId);
      }
      await next();
    },
  ),
}));

vi.mock("../../services/referee/referee-game-visibility.service", () => ({
  getVisibleRefereeGames: mocks.getVisibleRefereeGames,
  getVisibleRefereeGameById: mocks.getVisibleRefereeGameById,
  getVisibleRefereeGameByMatchId: mocks.getVisibleRefereeGameByMatchId,
}));

import { refereeGamesRoutes } from "./games.routes";

const app = new Hono<AppEnv>();
app.route("/", refereeGamesRoutes);

function json(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refereeId = 42;
});

describe("GET /games", () => {
  it("returns filtered games via getVisibleRefereeGames", async () => {
    const payload = { items: [], total: 0, limit: 100, offset: 0, hasMore: false };
    mocks.getVisibleRefereeGames.mockResolvedValue(payload);

    const res = await app.request("/games");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(payload);
    expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(42, {
      limit: 100,
      offset: 0,
      search: undefined,
      status: "active",
      league: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it("passes query params to getVisibleRefereeGames", async () => {
    mocks.getVisibleRefereeGames.mockResolvedValue({ items: [], total: 0 });

    await app.request(
      "/games?limit=25&offset=5&search=Berlin&status=all&league=BBL&dateFrom=2026-03-01&dateTo=2026-05-31",
    );

    expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(42, {
      limit: 25,
      offset: 5,
      search: "Berlin",
      status: "all",
      league: "BBL",
      dateFrom: "2026-03-01",
      dateTo: "2026-05-31",
    });
  });

  it("caps limit at 500", async () => {
    mocks.getVisibleRefereeGames.mockResolvedValue({ items: [], total: 0 });

    await app.request("/games?limit=9999");

    expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ limit: 500 }),
    );
  });

  it("defaults status to 'active'", async () => {
    mocks.getVisibleRefereeGames.mockResolvedValue({ items: [], total: 0 });

    await app.request("/games");

    expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: "active" }),
    );
  });

  it("returns 403 when refereeId is missing from context", async () => {
    mocks.refereeId = undefined;

    const res = await app.request("/games");

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getVisibleRefereeGames).not.toHaveBeenCalled();
  });
});

describe("GET /games/:id", () => {
  it("returns visible game via getVisibleRefereeGameById", async () => {
    const row = { id: 7, apiMatchId: 2000, matchId: null };
    mocks.getVisibleRefereeGameById.mockResolvedValue(row);

    const res = await app.request("/games/7");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(row);
    expect(mocks.getVisibleRefereeGameById).toHaveBeenCalledWith(42, 7);
  });

  it("returns 404 when referee cannot see the game", async () => {
    mocks.getVisibleRefereeGameById.mockResolvedValue(null);

    const res = await app.request("/games/7");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 on invalid id", async () => {
    const res = await app.request("/games/abc");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getVisibleRefereeGameById).not.toHaveBeenCalled();
  });

  it("returns 400 on non-positive id", async () => {
    const res = await app.request("/games/0");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 403 when refereeId is missing", async () => {
    mocks.refereeId = undefined;

    const res = await app.request("/games/7");

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getVisibleRefereeGameById).not.toHaveBeenCalled();
  });
});

describe("GET /matches/:matchId", () => {
  it("returns visible row via getVisibleRefereeGameByMatchId", async () => {
    const row = { id: 7, matchId: 500, mySlot: null };
    mocks.getVisibleRefereeGameByMatchId.mockResolvedValue(row);

    const res = await app.request("/matches/500");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(row);
    expect(mocks.getVisibleRefereeGameByMatchId).toHaveBeenCalledWith(42, 500);
  });

  it("returns 404 when referee cannot see match", async () => {
    mocks.getVisibleRefereeGameByMatchId.mockResolvedValue(null);

    const res = await app.request("/matches/500");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 on non-integer matchId", async () => {
    const res = await app.request("/matches/abc");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getVisibleRefereeGameByMatchId).not.toHaveBeenCalled();
  });

  it("returns 400 on non-positive matchId", async () => {
    const res = await app.request("/matches/0");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 403 when refereeId is missing", async () => {
    mocks.refereeId = undefined;

    const res = await app.request("/matches/500");

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getVisibleRefereeGameByMatchId).not.toHaveBeenCalled();
  });
});
