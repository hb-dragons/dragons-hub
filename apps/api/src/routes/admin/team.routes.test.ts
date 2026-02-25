import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getOwnClubTeams: vi.fn(),
  updateTeamCustomName: vi.fn(),
}));

vi.mock("../../services/admin/team-admin.service", () => ({
  getOwnClubTeams: mocks.getOwnClubTeams,
  updateTeamCustomName: mocks.updateTeamCustomName,
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { teamRoutes } from "./team.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", teamRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /teams", () => {
  it("returns list of own club teams", async () => {
    const teams = [
      { id: 1, name: "Dragons Herren 1", nameShort: "Dragons H1", customName: "Herren 1", leagueName: "Kreisliga A" },
      { id: 2, name: "Dragons Herren 2", nameShort: null, customName: null, leagueName: null },
    ];
    mocks.getOwnClubTeams.mockResolvedValue(teams);

    const res = await app.request("/teams");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(teams);
    expect(mocks.getOwnClubTeams).toHaveBeenCalledOnce();
  });

  it("returns empty array when no own club teams", async () => {
    mocks.getOwnClubTeams.mockResolvedValue([]);

    const res = await app.request("/teams");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
  });
});

describe("PATCH /teams/:id", () => {
  it("updates custom name and returns team", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: "Dragons H1", customName: "Herren 1", leagueName: "Kreisliga A" };
    mocks.updateTeamCustomName.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: "Herren 1" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateTeamCustomName).toHaveBeenCalledWith(1, "Herren 1");
  });

  it("clears custom name with null", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: null, leagueName: null };
    mocks.updateTeamCustomName.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: null }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateTeamCustomName).toHaveBeenCalledWith(1, null);
  });

  it("returns 404 for unknown or non-own-club team", async () => {
    mocks.updateTeamCustomName.mockResolvedValue(null);

    const res = await app.request("/teams/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: "Test" }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/teams/0", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: "Test" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/teams/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: "Test" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for name exceeding max length", async () => {
    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: "x".repeat(51) }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when customName field is missing", async () => {
    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
