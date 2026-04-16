import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mockSelect = vi.fn();
const mockFrom = vi.fn();

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  getTeamStats: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return { from: (...fArgs: unknown[]) => {
        mockFrom(...fArgs);
        return mocks.from();
      }};
    },
  },
}));

vi.mock("../../services/public/team-stats.service", () => ({
  getTeamStats: mocks.getTeamStats,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { publicTeamRoutes } from "./team.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", publicTeamRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /teams (public)", () => {
  it("returns 200 with team list", async () => {
    const teamList = [
      { id: 1, name: "Dragons Herren 1", nameShort: "Dragons H1", isOwnClub: true },
      { id: 2, name: "Dragons Herren 2", nameShort: null, isOwnClub: true },
    ];
    mocks.from.mockResolvedValue(teamList);

    const res = await app.request("/teams");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(teamList);
  });

  it("returns 200 with empty array when no teams exist", async () => {
    mocks.from.mockResolvedValue([]);

    const res = await app.request("/teams");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
  });
});

describe("GET /teams/:id/stats (public)", () => {
  const statsFixture = {
    teamId: 1,
    leagueName: "Kreisliga A",
    position: 3,
    played: 10,
    wins: 7,
    losses: 3,
    pointsFor: 820,
    pointsAgainst: 750,
    pointsDiff: 70,
    form: [
      { result: "W", matchId: 101 },
      { result: "L", matchId: 100 },
    ],
  };

  it("returns 200 with stats when team exists", async () => {
    mocks.getTeamStats.mockResolvedValue(statsFixture);

    const res = await app.request("/teams/1/stats");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(statsFixture);
    expect(mocks.getTeamStats).toHaveBeenCalledWith(1);
  });

  it("returns 404 when team not found", async () => {
    mocks.getTeamStats.mockResolvedValue(null);

    const res = await app.request("/teams/99/stats");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ error: "Team not found" });
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/teams/abc/stats");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "Invalid team id" });
    expect(mocks.getTeamStats).not.toHaveBeenCalled();
  });

  it("returns 400 for id of zero", async () => {
    const res = await app.request("/teams/0/stats");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "Invalid team id" });
    expect(mocks.getTeamStats).not.toHaveBeenCalled();
  });

  it("returns 400 for negative id", async () => {
    const res = await app.request("/teams/-5/stats");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "Invalid team id" });
  });
});
