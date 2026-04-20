import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getStandings: vi.fn(),
}));

vi.mock("../../services/admin/standings-admin.service", () => ({
  getStandings: mocks.getStandings,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { standingsRoutes } from "./standings.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", standingsRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /standings", () => {
  it("returns empty array when no standings exist", async () => {
    mocks.getStandings.mockResolvedValue([]);

    const res = await app.request("/standings");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
    expect(mocks.getStandings).toHaveBeenCalledOnce();
  });

  it("returns standings grouped by league", async () => {
    const data = [
      {
        leagueId: 1,
        leagueName: "Kreisliga A",
        seasonName: "2025/26",
        standings: [
          {
            position: 1,
            teamApiId: 42,
            clubId: 500,
            teamName: "Dragons Herren 1",
            teamNameShort: "Dragons H1",
            isOwnClub: true,
            played: 10,
            won: 8,
            lost: 2,
            pointsFor: 800,
            pointsAgainst: 700,
            pointsDiff: 100,
            leaguePoints: 16,
          },
        ],
      },
    ];
    mocks.getStandings.mockResolvedValue(data);

    const res = await app.request("/standings");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(data);
  });
});
