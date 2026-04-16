import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getHomeDashboard: vi.fn(),
}));

vi.mock("../../services/public/home-dashboard.service", () => ({
  getHomeDashboard: mocks.getHomeDashboard,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { publicHomeRoutes } from "./home.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", publicHomeRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

const dashboardFixture = {
  nextGame: {
    id: 42,
    homeTeamName: "Dragons",
    guestTeamName: "Visitors",
    kickoffDate: "2026-05-10",
    kickoffTime: "18:00",
  },
  recentResults: [
    { id: 41, homeTeamName: "Dragons", guestTeamName: "Opponents", homeScore: 85, guestScore: 70 },
  ],
  upcomingGames: [
    { id: 42, homeTeamName: "Dragons", guestTeamName: "Visitors", kickoffDate: "2026-05-10" },
    { id: 43, homeTeamName: "Away", guestTeamName: "Dragons", kickoffDate: "2026-05-17" },
  ],
  clubStats: {
    teamCount: 3,
    totalWins: 20,
    totalLosses: 10,
    winPercentage: 67,
  },
};

describe("GET /home/dashboard (public)", () => {
  it("returns 200 with dashboard data", async () => {
    mocks.getHomeDashboard.mockResolvedValue(dashboardFixture);

    const res = await app.request("/home/dashboard");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(dashboardFixture);
    expect(mocks.getHomeDashboard).toHaveBeenCalledOnce();
  });

  it("returns null nextGame when no upcoming games", async () => {
    const payload = { ...dashboardFixture, nextGame: null };
    mocks.getHomeDashboard.mockResolvedValue(payload);

    const res = await app.request("/home/dashboard");

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.nextGame).toBeNull();
  });

  it("returns empty arrays when no results or upcoming games", async () => {
    const payload = {
      ...dashboardFixture,
      recentResults: [],
      upcomingGames: [],
    };
    mocks.getHomeDashboard.mockResolvedValue(payload);

    const res = await app.request("/home/dashboard");

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.recentResults).toEqual([]);
    expect(body.upcomingGames).toEqual([]);
  });

  it("returns clubStats with all required fields", async () => {
    mocks.getHomeDashboard.mockResolvedValue(dashboardFixture);

    const res = await app.request("/home/dashboard");

    const body = await json(res);
    expect(body.clubStats).toMatchObject({
      teamCount: expect.any(Number),
      totalWins: expect.any(Number),
      totalLosses: expect.any(Number),
      winPercentage: expect.any(Number),
    });
  });

  it("returns 500 when service throws", async () => {
    mocks.getHomeDashboard.mockRejectedValue(new Error("DB error"));

    const res = await app.request("/home/dashboard");

    expect(res.status).toBe(500);
  });
});
