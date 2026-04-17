import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  getRefereeGames: vi.fn(),
  getRefereeGameById: vi.fn(),
  getVisibleRefereeGames: vi.fn(),
  getVisibleRefereeGameById: vi.fn(),
  dbSelect: vi.fn(),
  user: null as { role: string; id: string } | null,
}));

vi.mock("../../middleware/auth", () => ({
  requireReferee: vi.fn(async (c: { set: (k: string, v: unknown) => void; json: (body: unknown, status?: number) => Response }, next: () => Promise<void>) => {
    if (!mocks.user) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    c.set("user", mocks.user);
    await next();
  }),
}));

vi.mock("../../services/referee/referee-games.service", () => ({
  getRefereeGames: mocks.getRefereeGames,
  getRefereeGameById: mocks.getRefereeGameById,
}));

vi.mock("../../services/referee/referee-game-visibility.service", () => ({
  getVisibleRefereeGames: mocks.getVisibleRefereeGames,
  getVisibleRefereeGameById: mocks.getVisibleRefereeGameById,
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.dbSelect }) }) }),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({ eq: [_a, _b] })),
}));

vi.mock("@dragons/db/schema", () => ({
  user: { id: "u.id", refereeId: "u.refereeId" },
}));

import { refereeGamesRoutes } from "./games.routes";

const app = new Hono<AppEnv>();
app.route("/", refereeGamesRoutes);

function json(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
});

describe("GET /games", () => {
  describe("admin user", () => {
    beforeEach(() => {
      mocks.user = { role: "admin", id: "admin-1" };
    });

    it("returns unfiltered games via getRefereeGames", async () => {
      const payload = { items: [], total: 0, limit: 100, offset: 0, hasMore: false };
      mocks.getRefereeGames.mockResolvedValue(payload);

      const res = await app.request("/games");

      expect(res.status).toBe(200);
      expect(await json(res)).toEqual(payload);
      expect(mocks.getRefereeGames).toHaveBeenCalledWith({
        limit: 100,
        offset: 0,
        search: undefined,
        status: "active",
        league: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      });
      expect(mocks.getVisibleRefereeGames).not.toHaveBeenCalled();
      expect(mocks.dbSelect).not.toHaveBeenCalled();
    });

    it("passes query params to getRefereeGames", async () => {
      mocks.getRefereeGames.mockResolvedValue({ items: [], total: 0 });

      await app.request(
        "/games?limit=50&offset=10&search=Dragons&status=cancelled&league=OBL&dateFrom=2026-01-01&dateTo=2026-12-31",
      );

      expect(mocks.getRefereeGames).toHaveBeenCalledWith({
        limit: 50,
        offset: 10,
        search: "Dragons",
        status: "cancelled",
        league: "OBL",
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      });
    });

    it("caps limit at 500", async () => {
      mocks.getRefereeGames.mockResolvedValue({ items: [], total: 0 });

      await app.request("/games?limit=9999");

      expect(mocks.getRefereeGames).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 500 }),
      );
    });

    it("defaults status to 'active'", async () => {
      mocks.getRefereeGames.mockResolvedValue({ items: [], total: 0 });

      await app.request("/games");

      expect(mocks.getRefereeGames).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" }),
      );
    });
  });

  describe("referee user", () => {
    beforeEach(() => {
      mocks.user = { role: "referee", id: "ref-user-1" };
    });

    it("returns filtered games via getVisibleRefereeGames when refereeId is linked", async () => {
      mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 42 }]);
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
      expect(mocks.getRefereeGames).not.toHaveBeenCalled();
    });

    it("passes query params to getVisibleRefereeGames", async () => {
      mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
      mocks.getVisibleRefereeGames.mockResolvedValue({ items: [], total: 0 });

      await app.request(
        "/games?limit=25&offset=5&search=Berlin&status=all&league=BBL&dateFrom=2026-03-01&dateTo=2026-05-31",
      );

      expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(7, {
        limit: 25,
        offset: 5,
        search: "Berlin",
        status: "all",
        league: "BBL",
        dateFrom: "2026-03-01",
        dateTo: "2026-05-31",
      });
    });

    it("returns 403 when referee has no linked refereeId (null)", async () => {
      mocks.dbSelect.mockResolvedValueOnce([{ refereeId: null }]);

      const res = await app.request("/games");

      expect(res.status).toBe(403);
      expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.getVisibleRefereeGames).not.toHaveBeenCalled();
    });

    it("returns 403 when referee user row is not found in DB", async () => {
      mocks.dbSelect.mockResolvedValueOnce([]);

      const res = await app.request("/games");

      expect(res.status).toBe(403);
      expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.getVisibleRefereeGames).not.toHaveBeenCalled();
    });
  });
});

describe("GET /games/:id", () => {
  describe("admin user", () => {
    beforeEach(() => {
      mocks.user = { role: "admin", id: "admin-1" };
    });

    it("returns the game via getRefereeGameById", async () => {
      const row = { id: 42, apiMatchId: 1000, matchId: null };
      mocks.getRefereeGameById.mockResolvedValue(row);

      const res = await app.request("/games/42");

      expect(res.status).toBe(200);
      expect(await json(res)).toEqual(row);
      expect(mocks.getRefereeGameById).toHaveBeenCalledWith(42);
      expect(mocks.getVisibleRefereeGameById).not.toHaveBeenCalled();
    });

    it("returns 404 when row is not found", async () => {
      mocks.getRefereeGameById.mockResolvedValue(null);

      const res = await app.request("/games/999");

      expect(res.status).toBe(404);
      expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns 400 on invalid id", async () => {
      const res = await app.request("/games/abc");
      expect(res.status).toBe(400);
      expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.getRefereeGameById).not.toHaveBeenCalled();
    });

    it("returns 400 on non-positive id", async () => {
      const res = await app.request("/games/0");
      expect(res.status).toBe(400);
      expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    });
  });

  describe("referee user", () => {
    beforeEach(() => {
      mocks.user = { role: "referee", id: "ref-user-1" };
    });

    it("returns visible game via getVisibleRefereeGameById", async () => {
      mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 42 }]);
      const row = { id: 7, apiMatchId: 2000, matchId: null };
      mocks.getVisibleRefereeGameById.mockResolvedValue(row);

      const res = await app.request("/games/7");

      expect(res.status).toBe(200);
      expect(await json(res)).toEqual(row);
      expect(mocks.getVisibleRefereeGameById).toHaveBeenCalledWith(42, 7);
      expect(mocks.getRefereeGameById).not.toHaveBeenCalled();
    });

    it("returns 404 when referee cannot see the game", async () => {
      mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 42 }]);
      mocks.getVisibleRefereeGameById.mockResolvedValue(null);

      const res = await app.request("/games/7");

      expect(res.status).toBe(404);
      expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns 403 when referee is not linked", async () => {
      mocks.dbSelect.mockResolvedValueOnce([{ refereeId: null }]);

      const res = await app.request("/games/7");

      expect(res.status).toBe(403);
      expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.getVisibleRefereeGameById).not.toHaveBeenCalled();
    });
  });
});
