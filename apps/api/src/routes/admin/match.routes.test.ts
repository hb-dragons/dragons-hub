import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getOwnClubMatches: vi.fn(),
  getMatchDetail: vi.fn(),
  updateMatchLocal: vi.fn(),
  releaseOverride: vi.fn(),
}));

vi.mock("../../services/admin/match-admin.service", () => ({
  getOwnClubMatches: mocks.getOwnClubMatches,
  getMatchDetail: mocks.getMatchDetail,
  updateMatchLocal: mocks.updateMatchLocal,
  releaseOverride: mocks.releaseOverride,
}));

// --- Imports (after mocks) ---

import { matchRoutes } from "./match.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono();
app.onError(errorHandler);
app.route("/", matchRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /matches", () => {
  it("returns match list with default limit of 1000", async () => {
    const listResult = { items: [], total: 0, limit: 1000, offset: 0, hasMore: false };
    mocks.getOwnClubMatches.mockResolvedValue(listResult);

    const res = await app.request("/matches");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(listResult);
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith({ limit: 1000, offset: 0 });
  });

  it("passes query params to service", async () => {
    mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 5, hasMore: false });

    await app.request("/matches?limit=10&offset=5&leagueId=3&dateFrom=2025-01-01&dateTo=2025-12-31");

    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith({
      limit: 10,
      offset: 5,
      leagueId: 3,
      dateFrom: "2025-01-01",
      dateTo: "2025-12-31",
    });
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
});

describe("GET /matches/:id", () => {
  it("returns match detail with diffs", async () => {
    const detail = {
      match: { id: 1, homeTeamName: "Dragons" },
      diffs: [{ field: "kickoffDate", status: "diverged" }],
    };
    mocks.getMatchDetail.mockResolvedValue(detail);

    const res = await app.request("/matches/1");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(detail);
    expect(mocks.getMatchDetail).toHaveBeenCalledWith(1);
  });

  it("returns 404 when match not found", async () => {
    mocks.getMatchDetail.mockResolvedValue(null);

    const res = await app.request("/matches/999");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/matches/0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/matches/abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("PATCH /matches/:id", () => {
  it("updates match and returns detail", async () => {
    const updated = {
      match: { id: 1, kickoffDate: "2025-04-01" },
      diffs: [{ field: "kickoffDate", status: "diverged" }],
    };
    mocks.updateMatchLocal.mockResolvedValue(updated);

    const res = await app.request("/matches/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kickoffDate: "2025-04-01",
        changeReason: "Rescheduled",
      }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateMatchLocal).toHaveBeenCalledWith(
      1,
      { kickoffDate: "2025-04-01", changeReason: "Rescheduled" },
      "admin",
    );
  });

  it("returns 404 when match not found", async () => {
    mocks.updateMatchLocal.mockResolvedValue(null);

    const res = await app.request("/matches/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anschreiber: "Max" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid date in body", async () => {
    const res = await app.request("/matches/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kickoffDate: "not-a-date" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid time in body", async () => {
    const res = await app.request("/matches/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kickoffTime: "not-a-time" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts null values to clear overrides", async () => {
    mocks.updateMatchLocal.mockResolvedValue({
      match: { id: 1, kickoffDate: null },
      diffs: [],
    });

    const res = await app.request("/matches/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kickoffDate: null }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateMatchLocal).toHaveBeenCalledWith(
      1,
      { kickoffDate: null },
      "admin",
    );
  });

  it("returns 400 for invalid id param", async () => {
    const res = await app.request("/matches/0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anschreiber: "Max" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts boolean overrides", async () => {
    mocks.updateMatchLocal.mockResolvedValue({
      match: { id: 1, isForfeited: true },
      diffs: [],
    });

    const res = await app.request("/matches/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isForfeited: true, isCancelled: false }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateMatchLocal).toHaveBeenCalledWith(
      1,
      { isForfeited: true, isCancelled: false },
      "admin",
    );
  });

  it("returns 400 for venue override exceeding max length", async () => {
    const res = await app.request("/matches/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueNameOverride: "x".repeat(201) }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts score overrides", async () => {
    mocks.updateMatchLocal.mockResolvedValue({
      match: { id: 1, homeScore: 85 },
      diffs: [],
    });

    const res = await app.request("/matches/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeScore: 85, homeQ1: 20 }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateMatchLocal).toHaveBeenCalledWith(
      1,
      { homeScore: 85, homeQ1: 20 },
      "admin",
    );
  });
});

describe("DELETE /matches/:id/overrides/:fieldName", () => {
  it("releases override and returns detail", async () => {
    const detail = {
      match: { id: 1, kickoffDate: "2025-03-15" },
      diffs: [],
    };
    mocks.releaseOverride.mockResolvedValue(detail);

    const res = await app.request("/matches/1/overrides/kickoffDate", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(detail);
    expect(mocks.releaseOverride).toHaveBeenCalledWith(1, "kickoffDate", "admin");
  });

  it("returns 404 when override not found", async () => {
    mocks.releaseOverride.mockResolvedValue(null);

    const res = await app.request("/matches/1/overrides/kickoffDate", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/matches/0/overrides/kickoffDate", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
