import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getReferees: vi.fn(),
  getRefereeCounts: vi.fn(),
  getRefereeById: vi.fn(),
  updateRefereeVisibility: vi.fn(),
  updateRefereeRules: vi.fn(),
}));

vi.mock("../../services/admin/referee-admin.service", () => ({
  getReferees: mocks.getReferees,
  getRefereeCounts: mocks.getRefereeCounts,
  getRefereeById: mocks.getRefereeById,
  updateRefereeVisibility: mocks.updateRefereeVisibility,
  updateRefereeRules: mocks.updateRefereeRules,
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

import { refereeRoutes } from "./referee.routes";
import { errorHandler } from "../../middleware/error";
// The real class, deliberately not mocked: errorHandler maps it by
// `instanceof AppError`, so a stand-in `extends Error` double would fall
// through to a 500 and these status assertions would test nothing. The errors
// module is a leaf with no database imports, so using it here is free.
import { RefereeSettingsError } from "../../services/admin/referee-admin.errors";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", refereeRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("id param validation (shared envelope)", () => {
  // Paths are relative to this file's mount point ("/"), not the app's
  // "/admin" prefix in routes/index.ts — this test app mounts refereeRoutes
  // at "/" directly, matching every other test in this file.
  //
  // Bodies must satisfy each PATCH handler's own body schema (both
  // z.strictObject with required fields). An empty `{}` would fail body
  // validation before the handler's id guard ever runs, and the JSON
  // validator's rejection shape happens to also be
  // { code: "VALIDATION_ERROR", details: [...] } — so the test would pass
  // without ever exercising the id param, for the wrong reason.
  it.each([
    ["PATCH", "/referees/abc/visibility", { allowAllHomeGames: true, allowAwayGames: false, isOwnClub: true }],
    ["PATCH", "/referees/abc/rules", { rules: [] }],
    ["GET", "/referees/abc", undefined],
  ])("%s %s rejects a non-numeric id with the shared envelope", async (method, path, body) => {
    const res = await app.request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      details: expect.any(Array),
    });
  });
});

describe("GET /referees", () => {
  it("defaults scope to 'own' and sort to 'name'", async () => {
    const listResult = { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
    mocks.getReferees.mockResolvedValue(listResult);

    const res = await app.request("/referees");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(listResult);
    expect(mocks.getReferees).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "own", sort: "name" }),
    );
  });

  it("accepts scope=all", async () => {
    mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0, hasMore: false });
    await app.request("/referees?scope=all");
    expect(mocks.getReferees).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "all" }),
    );
  });

  it("rejects invalid sort", async () => {
    const res = await app.request("/referees?sort=banana");
    expect(res.status).toBe(400);
  });

  it("rejects invalid scope", async () => {
    const res = await app.request("/referees?scope=mine");
    expect(res.status).toBe(400);
  });

  it("passes query params to service", async () => {
    mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 5, hasMore: false });

    await app.request("/referees?limit=10&offset=5&search=Mueller&scope=all&sort=workloadDesc");

    expect(mocks.getReferees).toHaveBeenCalledWith({
      limit: 10,
      offset: 5,
      search: "Mueller",
      scope: "all",
      sort: "workloadDesc",
    });
  });

  it("returns referees with all fields", async () => {
    const listResult = {
      items: [
        {
          id: 1,
          apiId: 100,
          firstName: "Max",
          lastName: "Mustermann",
          licenseNumber: 12345,
          matchCount: 5,
          roles: ["1. Schiedsrichter"],
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-15T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
      hasMore: false,
    };
    mocks.getReferees.mockResolvedValue(listResult);

    const res = await app.request("/referees");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(listResult);
  });

  it("returns 400 for negative limit", async () => {
    const res = await app.request("/referees?limit=-1");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for limit exceeding max", async () => {
    const res = await app.request("/referees?limit=1001");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative offset", async () => {
    const res = await app.request("/referees?offset=-1");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for non-numeric limit", async () => {
    const res = await app.request("/referees?limit=abc");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for empty search string", async () => {
    const res = await app.request("/referees?search=");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("omits search when not provided", async () => {
    mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0, hasMore: false });

    await app.request("/referees");

    expect(mocks.getReferees).toHaveBeenCalledWith({ limit: 50, offset: 0, scope: "own", sort: "name" });
  });
});

describe("GET /referees/counts", () => {
  it("returns own and all counts", async () => {
    mocks.getRefereeCounts.mockResolvedValue({ own: 5, all: 30 });

    const res = await app.request("/referees/counts");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ own: 5, all: 30 });
  });

  it("returns zero counts when no referees", async () => {
    mocks.getRefereeCounts.mockResolvedValue({ own: 0, all: 0 });

    const res = await app.request("/referees/counts");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ own: 0, all: 0 });
  });
});

describe("PATCH /referees/:id (combined)", () => {
  it("no longer exists — returns 404", async () => {
    const res = await app.request("/referees/1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibility: { isOwnClub: true, allowAllHomeGames: false, allowAwayGames: false } }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /referees/:id/visibility", () => {
  it("returns 200 and updates visibility flags", async () => {
    const updated = { id: 1, allowAllHomeGames: true, allowAwayGames: false, isOwnClub: false };
    mocks.updateRefereeVisibility.mockResolvedValue(updated);

    const res = await app.request("/referees/1/visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: false }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateRefereeVisibility).toHaveBeenCalledWith(1, {
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: false,
    });
  });

  it("returns 400 for invalid referee ID", async () => {
    const res = await app.request("/referees/abc/visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: true }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toMatchObject({ code: "VALIDATION_ERROR", details: expect.any(Array) });
  });

  it("returns 400 for negative referee ID", async () => {
    const res = await app.request("/referees/-1/visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: true }),
    });

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toMatchObject({ code: "VALIDATION_ERROR", details: expect.any(Array) });
  });

  it("returns 400 for invalid body", async () => {
    const res = await app.request("/referees/1/visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowAllHomeGames: "yes" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 for non-existent referee via RefereeSettingsError", async () => {
    mocks.updateRefereeVisibility.mockRejectedValue(
      new RefereeSettingsError("Referee 999 not found", "NOT_FOUND"),
    );

    const res = await app.request("/referees/999/visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: false }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("rethrows unexpected errors", async () => {
    mocks.updateRefereeVisibility.mockRejectedValue(
      new Error("database connection lost"),
    );

    const res = await app.request("/referees/1/visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: false }),
    });

    expect(res.status).toBe(500);
  });

  it("passes isOwnClub in visibility update", async () => {
    const updated = { id: 1, allowAllHomeGames: true, allowAwayGames: false, isOwnClub: true };
    mocks.updateRefereeVisibility.mockResolvedValue(updated);
    const res = await app.request("/referees/1/visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: true }),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.updateRefereeVisibility).toHaveBeenCalledWith(1, {
      allowAllHomeGames: true, allowAwayGames: false, isOwnClub: true,
    });
  });
});

describe("PATCH /referees/:id/rules", () => {
  const sampleRule = { teamId: 10, deny: false, allowSr1: true, allowSr2: true };

  it("returns 200 and updates rules", async () => {
    const result = {
      rules: [{ id: 1, teamId: 10, teamName: "Team A", deny: false, allowSr1: true, allowSr2: true }],
    };
    mocks.updateRefereeRules.mockResolvedValue(result);

    const res = await app.request("/referees/1/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [sampleRule] }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(result);
    expect(mocks.updateRefereeRules).toHaveBeenCalledWith(1, { rules: [sampleRule] });
  });

  it("accepts empty rules array (clears all rules)", async () => {
    mocks.updateRefereeRules.mockResolvedValue({ rules: [] });
    const res = await app.request("/referees/1/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [] }),
    });
    expect(res.status).toBe(200);
    expect(mocks.updateRefereeRules).toHaveBeenCalledWith(1, { rules: [] });
  });

  it("returns 400 for invalid referee ID", async () => {
    const res = await app.request("/referees/abc/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [sampleRule] }),
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toMatchObject({ code: "VALIDATION_ERROR", details: expect.any(Array) });
  });

  it("returns 404 when service throws NOT_FOUND", async () => {
    mocks.updateRefereeRules.mockRejectedValue(
      new RefereeSettingsError("Referee 999 not found", "NOT_FOUND"),
    );
    const res = await app.request("/referees/999/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [sampleRule] }),
    });
    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 when service throws NOT_OWN_CLUB", async () => {
    mocks.updateRefereeRules.mockRejectedValue(
      new RefereeSettingsError("Referee is not an own-club referee", "NOT_OWN_CLUB"),
    );
    const res = await app.request("/referees/1/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [sampleRule] }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
  });

  it("returns 400 when service throws VALIDATION_ERROR for invalid teamIds", async () => {
    mocks.updateRefereeRules.mockRejectedValue(
      new RefereeSettingsError("Invalid or non-own-club team IDs: 99", "VALIDATION_ERROR"),
    );
    const res = await app.request("/referees/1/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [{ ...sampleRule, teamId: 99 }] }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rethrows unexpected errors as 500", async () => {
    mocks.updateRefereeRules.mockRejectedValue(new Error("database connection lost"));
    const res = await app.request("/referees/1/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [sampleRule] }),
    });
    expect(res.status).toBe(500);
  });
});

describe("GET /referees/:id", () => {
  it("returns 200 with referee on hit", async () => {
    mocks.getRefereeById.mockImplementation((id: number) =>
      id === 1 ? Promise.resolve({ id: 1, firstName: "Max", lastName: "Mustermann" }) : Promise.resolve(null),
    );

    const res = await app.request("/referees/1", { method: "GET" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 1 });
  });

  it("returns 404 when not found", async () => {
    mocks.getRefereeById.mockResolvedValue(null);

    const res = await app.request("/referees/9999999", { method: "GET" });
    expect(res.status).toBe(404);
  });

  it("returns 400 on non-numeric id", async () => {
    const res = await app.request("/referees/abc", { method: "GET" });
    expect(res.status).toBe(400);
  });
});
