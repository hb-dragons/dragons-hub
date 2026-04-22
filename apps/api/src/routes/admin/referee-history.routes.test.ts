import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getRefereeHistorySummary: vi.fn(),
  getRefereeHistoryGames: vi.fn(),
}));

vi.mock("../../services/admin/referee-history.service", () => ({
  getRefereeHistorySummary: mocks.getRefereeHistorySummary,
  getRefereeHistoryGames: mocks.getRefereeHistoryGames,
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(
    () =>
      async (_c: unknown, next: () => Promise<void>) =>
        next(),
  ),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { adminRefereeHistoryRoutes } from "./referee-history.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", adminRefereeHistoryRoutes);

function json(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /referee/history/summary", () => {
  it("parses defaults and calls service", async () => {
    const summary = {
      range: { from: "2025-08-01", to: "2026-07-31", source: "default" },
      kpis: {
        games: 0, obligatedSlots: 0, filledSlots: 0, unfilledSlots: 0,
        cancelled: 0, forfeited: 0, distinctReferees: 0,
      },
      leaderboard: [],
      availableLeagues: [],
    };
    mocks.getRefereeHistorySummary.mockResolvedValue(summary);

    const res = await app.request("/referee/history/summary");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(summary);
    expect(mocks.getRefereeHistorySummary).toHaveBeenCalledWith(
      expect.objectContaining({ status: [] }),
    );
  });

  it("returns 400 on invalid status", async () => {
    const res = await app.request("/referee/history/summary?status=bogus");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 on invalid date format", async () => {
    const res = await app.request(
      "/referee/history/summary?dateFrom=not-a-date",
    );
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("forwards explicit filters", async () => {
    mocks.getRefereeHistorySummary.mockResolvedValue({
      range: { from: "2024-08-01", to: "2025-07-31", source: "user" },
      kpis: {
        games: 1, obligatedSlots: 0, filledSlots: 0, unfilledSlots: 0,
        cancelled: 0, forfeited: 0, distinctReferees: 0,
      },
      leaderboard: [],
      availableLeagues: [],
    });
    const res = await app.request(
      "/referee/history/summary?dateFrom=2024-08-01&dateTo=2025-07-31&league=RLW&status=all",
    );
    expect(res.status).toBe(200);
    expect(mocks.getRefereeHistorySummary).toHaveBeenCalledWith({
      dateFrom: "2024-08-01",
      dateTo: "2025-07-31",
      league: "RLW",
      status: [],
    });
  });

  it("legacy status=active maps to ['played']", async () => {
    mocks.getRefereeHistorySummary.mockResolvedValue({
      range: { from: "2025-08-01", to: "2026-07-31", source: "user" },
      kpis: {
        games: 0, obligatedSlots: 0, filledSlots: 0, unfilledSlots: 0,
        cancelled: 0, forfeited: 0, distinctReferees: 0,
      },
      leaderboard: [],
      availableLeagues: [],
    });
    const res = await app.request(
      "/referee/history/summary?status=active",
    );
    expect(res.status).toBe(200);
    expect(mocks.getRefereeHistorySummary).toHaveBeenCalledWith(
      expect.objectContaining({ status: ["played"] }),
    );
  });
});

describe("GET /referee/history/games", () => {
  it("applies default limit/offset", async () => {
    const page = { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
    mocks.getRefereeHistoryGames.mockResolvedValue(page);

    const res = await app.request("/referee/history/games");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(page);
    expect(mocks.getRefereeHistoryGames).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
        offset: 0,
        status: [],
      }),
    );
  });

  it("returns 400 on invalid date", async () => {
    const res = await app.request(
      "/referee/history/games?dateFrom=not-a-date",
    );
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 on limit exceeding max", async () => {
    const res = await app.request("/referee/history/games?limit=501");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("forwards explicit filters and pagination", async () => {
    mocks.getRefereeHistoryGames.mockResolvedValue({
      items: [],
      total: 0,
      limit: 25,
      offset: 10,
      hasMore: false,
    });

    const res = await app.request(
      "/referee/history/games?dateFrom=2024-08-01&dateTo=2025-07-31&league=RLW&status=cancelled&search=Mueller&limit=25&offset=10",
    );

    expect(res.status).toBe(200);
    expect(mocks.getRefereeHistoryGames).toHaveBeenCalledWith({
      dateFrom: "2024-08-01",
      dateTo: "2025-07-31",
      league: "RLW",
      status: ["cancelled"],
      search: "Mueller",
      limit: 25,
      offset: 10,
    });
  });

  it("forwards refereeApiId", async () => {
    mocks.getRefereeHistoryGames.mockResolvedValue({
      items: [], total: 0, limit: 50, offset: 0, hasMore: false,
    });
    const res = await app.request(
      "/referee/history/games?refereeApiId=42",
    );
    expect(res.status).toBe(200);
    expect(mocks.getRefereeHistoryGames).toHaveBeenCalledWith(
      expect.objectContaining({ refereeApiId: 42 }),
    );
  });
});
