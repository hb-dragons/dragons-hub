import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  getVisibleRefereeGames: vi.fn(),
  getVisibleRefereeGameById: vi.fn(),
  getVisibleRefereeGameByMatchId: vi.fn(),
  getVisibleRefereeGameByApiMatchId: vi.fn(),
  refereeId: 42 as number | undefined,
  allowedByPermission: false,
}));

vi.mock("../../middleware/rbac", () => ({
  requireRefereeSelfOrAdminRole: vi.fn(
    () =>
      async (
        c: { set: (k: string, v: unknown) => void; json: (body: unknown, status: number) => unknown },
        next: () => Promise<void>,
      ) => {
        const linked = mocks.refereeId !== undefined;
        if (!linked && !mocks.allowedByPermission) {
          return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
        }
        c.set("user", { id: "u1", refereeId: mocks.refereeId });
        c.set("session", { id: "s1" });
        if (linked) {
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
  getVisibleRefereeGameByApiMatchId: mocks.getVisibleRefereeGameByApiMatchId,
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
  mocks.allowedByPermission = false;
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
      gameType: undefined,
      assignedRefereeApiId: undefined,
      slotStatus: undefined,
    });
  });

  it("splits comma-separated league param into an array", async () => {
    mocks.getVisibleRefereeGames.mockResolvedValue({ items: [], total: 0 });

    await app.request("/games?league=101,202,303");

    expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ league: ["101", "202", "303"] }),
    );
  });

  it("passes single league as a one-element array", async () => {
    mocks.getVisibleRefereeGames.mockResolvedValue({ items: [], total: 0 });

    await app.request("/games?league=101");

    expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ league: ["101"] }),
    );
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
      league: ["BBL"],
      dateFrom: "2026-03-01",
      dateTo: "2026-05-31",
      gameType: undefined,
      assignedRefereeApiId: undefined,
      slotStatus: undefined,
    });
  });

  it("rejects limit > 500 with 400", async () => {
    const res = await app.request("/games?limit=9999");
    expect(res.status).toBe(400);
    expect(mocks.getVisibleRefereeGames).not.toHaveBeenCalled();
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

  it("admin (no refereeId, has permission) invokes service with refereeId=null", async () => {
    mocks.refereeId = undefined;
    mocks.allowedByPermission = true;
    mocks.getVisibleRefereeGames.mockResolvedValue({ items: [], total: 0 });

    const res = await app.request("/games");

    expect(res.status).toBe(200);
    expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ limit: 100, offset: 0, status: "active" }),
    );
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

  it("admin (no refereeId, has permission) invokes service with refereeId=null", async () => {
    mocks.refereeId = undefined;
    mocks.allowedByPermission = true;
    mocks.getVisibleRefereeGameById.mockResolvedValue({ id: 7 });

    const res = await app.request("/games/7");

    expect(res.status).toBe(200);
    expect(mocks.getVisibleRefereeGameById).toHaveBeenCalledWith(null, 7);
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

  it("admin (no refereeId, has permission) invokes service with refereeId=null", async () => {
    mocks.refereeId = undefined;
    mocks.allowedByPermission = true;
    mocks.getVisibleRefereeGameByMatchId.mockResolvedValue({ id: 7, matchId: 500 });

    const res = await app.request("/matches/500");

    expect(res.status).toBe(200);
    expect(mocks.getVisibleRefereeGameByMatchId).toHaveBeenCalledWith(null, 500);
  });
});

describe("GET /games/by-api-match/:apiMatchId", () => {
  it("returns visible row via getVisibleRefereeGameByApiMatchId", async () => {
    const row = { id: 5, apiMatchId: 4711, matchId: null };
    mocks.getVisibleRefereeGameByApiMatchId.mockResolvedValue(row);

    const res = await app.request("/games/by-api-match/4711");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(row);
    expect(mocks.getVisibleRefereeGameByApiMatchId).toHaveBeenCalledWith(42, 4711);
  });

  it("returns 404 when not found", async () => {
    mocks.getVisibleRefereeGameByApiMatchId.mockResolvedValue(null);

    const res = await app.request("/games/by-api-match/4711");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 on invalid apiMatchId", async () => {
    const res = await app.request("/games/by-api-match/abc");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getVisibleRefereeGameByApiMatchId).not.toHaveBeenCalled();
  });

  it("returns 400 on non-positive apiMatchId", async () => {
    const res = await app.request("/games/by-api-match/0");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("admin (no refereeId, has permission) invokes service with refereeId=null", async () => {
    mocks.refereeId = undefined;
    mocks.allowedByPermission = true;
    mocks.getVisibleRefereeGameByApiMatchId.mockResolvedValue({ id: 5, apiMatchId: 4711 });

    const res = await app.request("/games/by-api-match/4711");

    expect(res.status).toBe(200);
    expect(mocks.getVisibleRefereeGameByApiMatchId).toHaveBeenCalledWith(null, 4711);
  });
});

describe("GET /referee/games new query params", () => {
  it("passes gameType to the service", async () => {
    mocks.getVisibleRefereeGames.mockResolvedValueOnce({
      items: [], total: 0, limit: 100, offset: 0, hasMore: false,
    });
    await app.request("/games?gameType=home");
    expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ gameType: "home" }),
    );
  });

  it("passes assignedRefereeApiId to the service", async () => {
    mocks.getVisibleRefereeGames.mockResolvedValueOnce({
      items: [], total: 0, limit: 100, offset: 0, hasMore: false,
    });
    await app.request("/games?assignedRefereeApiId=12345");
    expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assignedRefereeApiId: 12345 }),
    );
  });
});

describe("GET /games Zod query validation", () => {
  it("rejects gameType outside enum with 400", async () => {
    const res = await app.request("/games?gameType=invalid", { method: "GET" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects slotStatus outside enum with 400", async () => {
    const res = await app.request("/games?slotStatus=bogus", { method: "GET" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects limit=9999 with 400 and VALIDATION_ERROR code", async () => {
    const res = await app.request("/games?limit=9999", { method: "GET" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("accepts default values and returns 200", async () => {
    mocks.getVisibleRefereeGames.mockResolvedValueOnce({
      items: [], total: 0, limit: 100, offset: 0, hasMore: false,
    });
    const res = await app.request("/games", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("propagates slotStatus to the service", async () => {
    mocks.getVisibleRefereeGames.mockResolvedValueOnce({
      items: [], total: 0, limit: 100, offset: 0, hasMore: false,
    });
    await app.request("/games?slotStatus=offered", { method: "GET" });
    expect(mocks.getVisibleRefereeGames).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slotStatus: "offered" }),
    );
  });
});
