import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  listPublicTeams: vi.fn(),
  getTeamStats: vi.fn(),
  getPublicStaffPortrait: vi.fn(),
}));

vi.mock("../../services/public/team-list.service", () => ({
  listPublicTeams: mocks.listPublicTeams,
}));

vi.mock("../../services/public/team-stats.service", () => ({
  getTeamStats: mocks.getTeamStats,
}));

vi.mock("../../services/public/staff-portrait.service", () => ({
  getPublicStaffPortrait: mocks.getPublicStaffPortrait,
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
    mocks.listPublicTeams.mockResolvedValue(teamList);

    const res = await app.request("/teams");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(teamList);
  });

  it("returns 200 with empty array when no teams exist", async () => {
    mocks.listPublicTeams.mockResolvedValue([]);

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

  it("returns 404 with a NOT_FOUND code when team not found", async () => {
    mocks.getTeamStats.mockResolvedValue(null);

    const res = await app.request("/teams/99/stats");

    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "Team not found", code: "NOT_FOUND" });
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/teams/abc/stats");

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(mocks.getTeamStats).not.toHaveBeenCalled();
  });

  it("returns 400 for id of zero", async () => {
    const res = await app.request("/teams/0/stats");

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(mocks.getTeamStats).not.toHaveBeenCalled();
  });

  it("returns 400 for negative id", async () => {
    const res = await app.request("/teams/-5/stats");

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /staff/:id/photo (public)", () => {
  it("serves the stored bytes with a public, immutable cache header", async () => {
    mocks.getPublicStaffPortrait.mockResolvedValue({
      buffer: Buffer.from([1, 2, 3]),
      contentType: "image/webp",
    });

    const res = await app.request("/staff/12/photo");

    expect(res.status).toBe(200);
    expect(mocks.getPublicStaffPortrait).toHaveBeenCalledWith(12);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Content-Length")).toBe("3");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400, immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns 404 when the member has no portrait", async () => {
    mocks.getPublicStaffPortrait.mockResolvedValue(null);

    const res = await app.request("/staff/12/photo");

    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "Portrait not found", code: "NOT_FOUND" });
  });

  it("rejects a non-numeric staff id", async () => {
    const res = await app.request("/staff/abc/photo");

    expect(res.status).toBe(400);
    expect(mocks.getPublicStaffPortrait).not.toHaveBeenCalled();
  });
});
