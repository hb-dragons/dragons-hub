import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  getRefereeGames: vi.fn(),
}));

vi.mock("../../middleware/auth", () => ({
  requireReferee: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock("../../services/referee/referee-games.service", () => ({
  getRefereeGames: mocks.getRefereeGames,
}));

import { refereeGamesRoutes } from "./games.routes";

const app = new Hono<AppEnv>();
app.route("/", refereeGamesRoutes);

function json(response: Response) {
  return response.json();
}

beforeEach(() => vi.clearAllMocks());

describe("GET /games", () => {
  it("returns games with default params", async () => {
    const payload = { data: [], total: 0 };
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
  });

  it("passes query params to service", async () => {
    mocks.getRefereeGames.mockResolvedValue({ data: [], total: 0 });

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
    mocks.getRefereeGames.mockResolvedValue({ data: [], total: 0 });

    await app.request("/games?limit=9999");

    expect(mocks.getRefereeGames).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
    );
  });

  it("defaults status to 'active'", async () => {
    mocks.getRefereeGames.mockResolvedValue({ data: [], total: 0 });

    await app.request("/games");

    expect(mocks.getRefereeGames).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
  });
});
