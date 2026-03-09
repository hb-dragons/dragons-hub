import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getOwnClubMatches: vi.fn(),
}));

vi.mock("../../services/admin/match-admin.service", () => ({
  getOwnClubMatches: mocks.getOwnClubMatches,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { publicMatchRoutes } from "./match.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", publicMatchRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /matches (public)", () => {
  it("returns 200 with match list", async () => {
    const listResult = { items: [], total: 0, limit: 1000, offset: 0, hasMore: false };
    mocks.getOwnClubMatches.mockResolvedValue(listResult);

    const res = await app.request("/matches");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(listResult);
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(expect.objectContaining({ limit: 1000, offset: 0, sort: "asc" }));
  });

  it("returns match list with items", async () => {
    const listResult = {
      items: [
        { id: 1, homeTeamName: "Dragons", guestTeamName: "Visitors" },
        { id: 2, homeTeamName: "Away", guestTeamName: "Dragons" },
      ],
      total: 2,
      limit: 1000,
      offset: 0,
      hasMore: false,
    };
    mocks.getOwnClubMatches.mockResolvedValue(listResult);

    const res = await app.request("/matches");

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("passes query params to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 5, hasMore: false });

    await app.request("/matches?limit=10&offset=5&leagueId=3&dateFrom=2025-01-01&dateTo=2025-12-31");

    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(expect.objectContaining({
      limit: 10,
      offset: 5,
      leagueId: 3,
      dateFrom: "2025-01-01",
      dateTo: "2025-12-31",
      sort: "asc",
    }));
  });

  it("returns 400 for invalid date format", async () => {
    const res = await app.request("/matches?dateFrom=bad-date");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid leagueId", async () => {
    const res = await app.request("/matches?leagueId=abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative limit", async () => {
    const res = await app.request("/matches?limit=-1");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("passes sort param to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    await app.request("/matches?sort=desc");
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "desc" }),
    );
  });

  it("passes hasScore param to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    await app.request("/matches?hasScore=true");
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({ hasScore: true }),
    );
  });

  it("passes teamApiId param to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    await app.request("/matches?teamApiId=42");
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
      expect.objectContaining({ teamApiId: 42 }),
    );
  });

  it("returns 400 for invalid sort value", async () => {
    const res = await app.request("/matches?sort=invalid");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid teamApiId", async () => {
    const res = await app.request("/matches?teamApiId=abc");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
