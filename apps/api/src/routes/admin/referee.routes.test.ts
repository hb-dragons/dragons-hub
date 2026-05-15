import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => {
  class RefereeSettingsError extends Error {
    constructor(
      message: string,
      public readonly code: "NOT_FOUND" | "NOT_OWN_CLUB" | "VALIDATION_ERROR",
    ) {
      super(message);
      this.name = "RefereeSettingsError";
    }
  }
  return {
    getReferees: vi.fn(),
    updateRefereeVisibility: vi.fn(),
    updateRefereeSettings: vi.fn(),
    RefereeSettingsError,
  };
});

vi.mock("../../services/admin/referee-admin.service", () => ({
  getReferees: mocks.getReferees,
  updateRefereeVisibility: mocks.updateRefereeVisibility,
  updateRefereeSettings: mocks.updateRefereeSettings,
  RefereeSettingsError: mocks.RefereeSettingsError,
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

describe("GET /referees", () => {
  it("returns referee list with default limit of 1000", async () => {
    const listResult = { items: [], total: 0, limit: 1000, offset: 0, hasMore: false };
    mocks.getReferees.mockResolvedValue(listResult);

    const res = await app.request("/referees");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(listResult);
    expect(mocks.getReferees).toHaveBeenCalledWith({ limit: 1000, offset: 0, ownClub: true });
  });

  it("passes query params to service", async () => {
    mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 5, hasMore: false });

    await app.request("/referees?limit=10&offset=5&search=Mueller");

    expect(mocks.getReferees).toHaveBeenCalledWith({
      limit: 10,
      offset: 5,
      search: "Mueller",
      ownClub: true,
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
      limit: 1000,
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
    mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });

    await app.request("/referees");

    expect(mocks.getReferees).toHaveBeenCalledWith({ limit: 1000, offset: 0, ownClub: true });
  });

  it("defaults ownClub to true and passes to service", async () => {
    mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    await app.request("/referees");
    expect(mocks.getReferees).toHaveBeenCalledWith({ limit: 1000, offset: 0, ownClub: true });
  });

  it("passes ownClub=false when specified", async () => {
    mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });
    await app.request("/referees?ownClub=false");
    expect(mocks.getReferees).toHaveBeenCalledWith({ limit: 1000, offset: 0, ownClub: false });
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
      body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for negative referee ID", async () => {
    const res = await app.request("/referees/-1/visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
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

  it("returns 404 for non-existent referee", async () => {
    mocks.updateRefereeVisibility.mockRejectedValue(
      new Error("Referee 999 not found"),
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

describe("PATCH /referees/:id (combined settings)", () => {
  const fullVisibility = {
    allowAllHomeGames: true,
    allowAwayGames: false,
    isOwnClub: true,
  };
  const sampleRule = { teamId: 10, deny: false, allowSr1: true, allowSr2: true };

  it("returns 200 and updates both visibility and rules atomically", async () => {
    const result = {
      visibility: fullVisibility,
      rules: [{ id: 1, teamId: 10, teamName: "Team A", deny: false, allowSr1: true, allowSr2: true }],
    };
    mocks.updateRefereeSettings.mockResolvedValue(result);

    const res = await app.request("/referees/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: fullVisibility, rules: [sampleRule] }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(result);
    expect(mocks.updateRefereeSettings).toHaveBeenCalledWith(1, {
      visibility: fullVisibility,
      rules: [sampleRule],
    });
  });

  it("accepts visibility-only payload", async () => {
    mocks.updateRefereeSettings.mockResolvedValue({ visibility: fullVisibility, rules: [] });
    const res = await app.request("/referees/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: fullVisibility }),
    });
    expect(res.status).toBe(200);
    expect(mocks.updateRefereeSettings).toHaveBeenCalledWith(1, { visibility: fullVisibility });
  });

  it("accepts rules-only payload", async () => {
    mocks.updateRefereeSettings.mockResolvedValue({ visibility: fullVisibility, rules: [] });
    const res = await app.request("/referees/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [sampleRule] }),
    });
    expect(res.status).toBe(200);
    expect(mocks.updateRefereeSettings).toHaveBeenCalledWith(1, { rules: [sampleRule] });
  });

  it("accepts empty rules array (clears all rules)", async () => {
    mocks.updateRefereeSettings.mockResolvedValue({ visibility: fullVisibility, rules: [] });
    const res = await app.request("/referees/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [] }),
    });
    expect(res.status).toBe(200);
    expect(mocks.updateRefereeSettings).toHaveBeenCalledWith(1, { rules: [] });
  });

  it("returns 400 for invalid referee ID", async () => {
    const res = await app.request("/referees/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: fullVisibility }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for rule with no allow flags and not denied", async () => {
    const res = await app.request("/referees/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rules: [{ teamId: 10, deny: false, allowSr1: false, allowSr2: false }],
      }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for duplicate teamIds", async () => {
    const res = await app.request("/referees/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rules: [sampleRule, { ...sampleRule, allowSr1: false }],
      }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 when service throws RefereeSettingsError NOT_FOUND", async () => {
    mocks.updateRefereeSettings.mockRejectedValue(
      new mocks.RefereeSettingsError("Referee 999 not found", "NOT_FOUND"),
    );
    const res = await app.request("/referees/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: fullVisibility }),
    });
    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 when service throws NOT_OWN_CLUB (race regression test)", async () => {
    mocks.updateRefereeSettings.mockRejectedValue(
      new mocks.RefereeSettingsError("Referee is not an own-club referee", "NOT_OWN_CLUB"),
    );
    const res = await app.request("/referees/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visibility: { allowAllHomeGames: false, allowAwayGames: false, isOwnClub: false },
        rules: [sampleRule],
      }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
  });

  it("returns 400 when service throws VALIDATION_ERROR for invalid teamIds", async () => {
    mocks.updateRefereeSettings.mockRejectedValue(
      new mocks.RefereeSettingsError("Invalid or non-own-club team IDs: 99", "VALIDATION_ERROR"),
    );
    const res = await app.request("/referees/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [{ ...sampleRule, teamId: 99 }] }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rethrows unexpected errors as 500", async () => {
    mocks.updateRefereeSettings.mockRejectedValue(new Error("database connection lost"));
    const res = await app.request("/referees/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: fullVisibility }),
    });
    expect(res.status).toBe(500);
  });
});
