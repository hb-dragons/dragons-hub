import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getOwnClubTeams: vi.fn(),
  updateTeamEntry: vi.fn(),
  reorderTeamEntries: vi.fn(),
}));

vi.mock("../../services/admin/team-admin.service", () => ({
  getOwnClubTeams: mocks.getOwnClubTeams,
  updateTeamEntry: mocks.updateTeamEntry,
  reorderTeamEntries: mocks.reorderTeamEntries,
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() =>
    async (_c: unknown, next: () => Promise<void>) => next(),
  ),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { teamRoutes } from "./team.routes";
import { errorHandler } from "../../middleware/error";
import { TeamReorderError } from "../../services/admin/team-admin.errors";

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
      { id: 1, name: "Dragons Herren 1", nameShort: "Dragons H1", customName: "Herren 1", leagueName: "Kreisliga A", estimatedGameDuration: 90, badgeColor: null, displayOrder: 0 },
      { id: 2, name: "Dragons Herren 2", nameShort: null, customName: null, leagueName: null, estimatedGameDuration: null, badgeColor: null, displayOrder: 1 },
    ];
    mocks.getOwnClubTeams.mockResolvedValue(teams);

    const res = await app.request("/teams");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(teams);
    // No season named: the service resolves the active one itself.
    expect(mocks.getOwnClubTeams).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("returns empty array when no own club teams", async () => {
    mocks.getOwnClubTeams.mockResolvedValue([]);

    const res = await app.request("/teams");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual([]);
  });

  // The season selector is the feature's headline control; this is its wiring.
  it("forwards ?seasonId= to the service as a number", async () => {
    mocks.getOwnClubTeams.mockResolvedValue([]);

    const res = await app.request("/teams?seasonId=7");

    expect(res.status).toBe(200);
    expect(mocks.getOwnClubTeams).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("returns 400 for a non-numeric seasonId without reaching the service", async () => {
    const res = await app.request("/teams?seasonId=abc");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getOwnClubTeams).not.toHaveBeenCalled();
  });
});

describe("PATCH /teams/:id", () => {
  it("updates custom name and returns team", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: "Dragons H1", customName: "Herren 1", leagueName: "Kreisliga A", estimatedGameDuration: null, badgeColor: null, displayOrder: 0 };
    mocks.updateTeamEntry.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: "Herren 1" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateTeamEntry).toHaveBeenCalledWith(1, { customName: "Herren 1" });
  });

  it("clears custom name with null", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: null, leagueName: null, estimatedGameDuration: null, badgeColor: null, displayOrder: 0 };
    mocks.updateTeamEntry.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: null }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateTeamEntry).toHaveBeenCalledWith(1, { customName: null });
  });

  it("updates estimatedGameDuration", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: null, leagueName: null, estimatedGameDuration: 120, badgeColor: null, displayOrder: 0 };
    mocks.updateTeamEntry.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedGameDuration: 120 }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateTeamEntry).toHaveBeenCalledWith(1, { estimatedGameDuration: 120 });
  });

  it("clears estimatedGameDuration with null", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: null, leagueName: null, estimatedGameDuration: null, badgeColor: null, displayOrder: 0 };
    mocks.updateTeamEntry.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedGameDuration: null }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateTeamEntry).toHaveBeenCalledWith(1, { estimatedGameDuration: null });
  });

  it("updates both customName and estimatedGameDuration", async () => {
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: "H1", leagueName: null, estimatedGameDuration: 90, badgeColor: null, displayOrder: 0 };
    mocks.updateTeamEntry.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: "H1", estimatedGameDuration: 90 }),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateTeamEntry).toHaveBeenCalledWith(1, { customName: "H1", estimatedGameDuration: 90 });
  });

  it("returns 404 for unknown or non-own-club team", async () => {
    mocks.updateTeamEntry.mockResolvedValue(null);

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
    const updated = { id: 1, name: "Dragons Herren 1", nameShort: null, customName: null, leagueName: null, estimatedGameDuration: null, badgeColor: null, displayOrder: 0 };
    mocks.updateTeamEntry.mockResolvedValue(updated);

    const res = await app.request("/teams/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(mocks.updateTeamEntry).toHaveBeenCalledWith(1, {});
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

describe("PUT /teams/order", () => {
  it("returns the reordered list", async () => {
    const reordered = [
      { id: 3, name: "C", displayOrder: 0 },
      { id: 1, name: "A", displayOrder: 1 },
      { id: 2, name: "B", displayOrder: 2 },
    ];
    mocks.reorderTeamEntries.mockResolvedValue(reordered);

    const res = await app.request("/teams/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: [3, 1, 2] }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(reordered);
    expect(mocks.reorderTeamEntries).toHaveBeenCalledWith([3, 1, 2], undefined);
  });

  it("rejects empty entryIds with 400", async () => {
    const res = await app.request("/teams/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: [] }),
    });

    expect(res.status).toBe(400);
    expect(mocks.reorderTeamEntries).not.toHaveBeenCalled();
  });

  it("returns 400 when service throws INVALID_TEAM_SET", async () => {
    mocks.reorderTeamEntries.mockRejectedValue(TeamReorderError.invalidTeamSet());

    const res = await app.request("/teams/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: [1, 2] }),
    });

    expect(res.status).toBe(400);
    const body = (await json(res)) as { code: string; error: string };
    expect(body.code).toBe("INVALID_TEAM_SET");
    // The human-readable field is a sentence, not the code echoed back.
    expect(body.error).toMatch(/own-club team/);
  });

  it("returns 400 when service throws DUPLICATE_TEAM_ID", async () => {
    mocks.reorderTeamEntries.mockRejectedValue(TeamReorderError.duplicateTeamId());

    const res = await app.request("/teams/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: [1, 1] }),
    });

    expect(res.status).toBe(400);
    const body = (await json(res)) as { code: string; error: string };
    expect(body.code).toBe("DUPLICATE_TEAM_ID");
    expect(body.error).toMatch(/more than once/);
  });

  // Regression: the route used to read the code out of `err.message`, so any
  // unrelated failure whose message happened to spell INVALID_TEAM_SET became a
  // 400. Only the typed error may produce one.
  it("does not turn an unrelated error with a matching message into a 400", async () => {
    mocks.reorderTeamEntries.mockRejectedValue(new Error("INVALID_TEAM_SET"));

    const res = await app.request("/teams/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: [1, 2] }),
    });

    expect(res.status).toBe(500);
    const body = (await json(res)) as { code: string };
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});
