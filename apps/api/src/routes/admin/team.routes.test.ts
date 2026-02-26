import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getOwnClubTeams: vi.fn(),
  updateTeam: vi.fn(),
}));

vi.mock("../../services/admin/team-admin.service", () => ({
  getOwnClubTeams: mocks.getOwnClubTeams,
  updateTeam: mocks.updateTeam,
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
      { id: 1, name: "Dragons Herren 1", nameShort: "Dragons H1", customName: "Herren 1", leagueName: "Kreisliga A", estimatedGameDuration: 90 },
      { id: 2, name: "Dragons Herren 2", nameShort: null, customName: null, leagueName: null, estimatedGameDuration: null },
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
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: "Dragons H1", customName: "Herren 1", leagueName: "Kreisliga A", estimatedGameDuration: null };
    mocks.updateTeam.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: "Herren 1" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateTeam).toHaveBeenCalledWith(1, { customName: "Herren 1" });
  });

  it("clears custom name with null", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: null, leagueName: null, estimatedGameDuration: null };
    mocks.updateTeam.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: null }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateTeam).toHaveBeenCalledWith(1, { customName: null });
  });

  it("updates estimatedGameDuration", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: null, leagueName: null, estimatedGameDuration: 120 };
    mocks.updateTeam.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedGameDuration: 120 }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateTeam).toHaveBeenCalledWith(1, { estimatedGameDuration: 120 });
  });

  it("clears estimatedGameDuration with null", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: null, leagueName: null, estimatedGameDuration: null };
    mocks.updateTeam.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedGameDuration: null }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateTeam).toHaveBeenCalledWith(1, { estimatedGameDuration: null });
  });

  it("updates both customName and estimatedGameDuration", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: "H1", leagueName: null, estimatedGameDuration: 90 };
    mocks.updateTeam.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: "H1", estimatedGameDuration: 90 }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateTeam).toHaveBeenCalledWith(1, { customName: "H1", estimatedGameDuration: 90 });
  });

  it("returns 404 for unknown or non-own-club team", async () => {
    mocks.updateTeam.mockResolvedValue(null);

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

  it("accepts empty object (no fields to update)", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: null, leagueName: null, estimatedGameDuration: null };
    mocks.updateTeam.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateTeam).toHaveBeenCalledWith(1, {});
  });

  it("returns 400 for non-integer estimatedGameDuration", async () => {
    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedGameDuration: 90.5 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for zero estimatedGameDuration", async () => {
    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedGameDuration: 0 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative estimatedGameDuration", async () => {
    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedGameDuration: -1 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
