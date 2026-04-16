import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getOwnClubMatches: vi.fn(),
  getMatchDetail: vi.fn(),
  getMatchChangeHistory: vi.fn(),
  updateMatchLocal: vi.fn(),
  releaseOverride: vi.fn(),
  reconcileMatch: vi.fn(),
}));

vi.mock("../../services/admin/match-admin.service", () => ({
  getOwnClubMatches: mocks.getOwnClubMatches,
  getMatchDetail: mocks.getMatchDetail,
  getMatchChangeHistory: mocks.getMatchChangeHistory,
  updateMatchLocal: mocks.updateMatchLocal,
  releaseOverride: mocks.releaseOverride,
}));

vi.mock("../../services/venue-booking/venue-booking.service", () => ({
  reconcileMatch: mocks.reconcileMatch,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { matchRoutes } from "./match.routes";
import { errorHandler } from "../../middleware/error";

// Test app with mock auth middleware
const app = new Hono<AppEnv>();
app.use("/*", async (c, next) => {
  c.set("user", { id: "user-123", role: "admin", name: "Test Admin", email: "admin@test.com", emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() } as AppEnv["Variables"]["user"]);
  c.set("logger", { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as AppEnv["Variables"]["logger"]);
  await next();
});
app.onError(errorHandler);
app.route("/", matchRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reconcileMatch.mockResolvedValue(undefined);
});

describe("GET /matches", () => {
  it("returns match list with default limit of 1000", async () => {
    const listResult = { items: [], total: 0, limit: 1000, offset: 0, hasMore: false };
    mocks.getOwnClubMatches.mockResolvedValue(listResult);

    const res = await app.request("/matches");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(listResult);
    expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(expect.objectContaining({ limit: 1000, offset: 0, sort: "asc" }));
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

describe("GET /matches/:id/history", () => {
  it("returns match change history", async () => {
    const history = {
      items: [{ id: 1, field: "kickoffDate", oldValue: "2025-03-01", newValue: "2025-04-01" }],
      total: 1,
    };
    mocks.getMatchChangeHistory.mockResolvedValue(history);

    const res = await app.request("/matches/1/history");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(history);
    expect(mocks.getMatchChangeHistory).toHaveBeenCalledWith(1, { limit: 50, offset: 0 });
  });

  it("passes limit and offset to service", async () => {
    mocks.getMatchChangeHistory.mockResolvedValue({ items: [], total: 0 });

    await app.request("/matches/1/history?limit=10&offset=5");

    expect(mocks.getMatchChangeHistory).toHaveBeenCalledWith(1, { limit: 10, offset: 5 });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/matches/abc/history");

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
      "user-123",
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
      "user-123",
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
      "user-123",
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
      "user-123",
    );
  });

  it("fires venue booking reconciliation after successful update", async () => {
    mocks.updateMatchLocal.mockResolvedValue({
      match: { id: 1, kickoffDate: "2025-04-01" },
      diffs: [],
    });

    await app.request("/matches/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kickoffDate: "2025-04-01" }),
    });

    // Flush microtasks so the dynamic import promise chain resolves
    await vi.dynamicImportSettled();

    expect(mocks.reconcileMatch).toHaveBeenCalledWith(1);
  });

  it("does not fire booking reconciliation when match not found", async () => {
    mocks.updateMatchLocal.mockResolvedValue(null);

    await app.request("/matches/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anschreiber: "Max" }),
    });

    await vi.dynamicImportSettled();

    expect(mocks.reconcileMatch).not.toHaveBeenCalled();
  });

  it("logs booking reconciliation errors without affecting response", async () => {
    mocks.updateMatchLocal.mockResolvedValue({
      match: { id: 1, kickoffDate: "2025-04-01" },
      diffs: [],
    });
    mocks.reconcileMatch.mockRejectedValue(new Error("DB down"));

    const res = await app.request("/matches/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kickoffDate: "2025-04-01" }),
    });

    // Should still return success despite booking failure
    expect(res.status).toBe(200);

    await vi.dynamicImportSettled();
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
    expect(mocks.releaseOverride).toHaveBeenCalledWith(1, "kickoffDate", "user-123");
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
