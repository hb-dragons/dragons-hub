import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  assignReferee: vi.fn(),
  claimRefereeGame: vi.fn(),
  unclaimRefereeGame: vi.fn(),
  dbSelect: vi.fn(),
  // gate: "allow" | "unauthorized" | "forbidden" — controls requireRefereeSelf response.
  gate: "allow" as "allow" | "unauthorized" | "forbidden",
  refereeId: 7 as number | undefined,
}));

vi.mock("../../services/referee/referee-assignment.service", () => ({
  assignReferee: mocks.assignReferee,
  AssignmentError: class AssignmentError extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  },
}));

vi.mock("../../services/referee/referee-claim.service", () => ({
  claimRefereeGame: mocks.claimRefereeGame,
  unclaimRefereeGame: mocks.unclaimRefereeGame,
}));

vi.mock("../../middleware/rbac", () => ({
  requireRefereeSelf: vi.fn(
    async (
      c: {
        set: (k: string, v: unknown) => void;
        json: (body: unknown, status?: number) => Response;
      },
      next: () => Promise<void>,
    ) => {
      if (mocks.gate === "unauthorized") {
        return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
      }
      if (mocks.gate === "forbidden") {
        return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
      }
      c.set("user", { id: "u1", refereeId: mocks.refereeId });
      c.set("session", { id: "s1" });
      if (mocks.refereeId !== undefined) {
        c.set("refereeId", mocks.refereeId);
      }
      await next();
    },
  ),
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.dbSelect }) }) }),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({ eq: [_a, _b] })),
}));

vi.mock("@dragons/db/schema", () => ({
  referees: { id: "r.id", apiId: "r.apiId", isOwnClub: "r.isOwnClub" },
}));

import { refereeAssignmentRoutes } from "./assignment.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", refereeAssignmentRoutes);

function json(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate = "allow";
  mocks.refereeId = 7;
});

describe("POST /games/:spielplanId/assign", () => {
  it("returns 401 when no session", async () => {
    mocks.gate = "unauthorized";

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns 403 when user has no referee profile", async () => {
    mocks.gate = "forbidden";

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON body", async () => {
    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("returns 403 when referee tries to assign a different referee", async () => {
    // Referees lookup returns apiId 9999 (≠ 9001 in body)
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9999, isOwnClub: true }]);

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("returns 403 when referee is not own club", async () => {
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 555, isOwnClub: false }]);

    const res = await app.request("/games/123/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 555 }),
    });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
  });

  it("allows referee to assign themselves when apiId matches", async () => {
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9001, isOwnClub: true }]);
    mocks.assignReferee.mockResolvedValue({
      success: true,
      slot: "sr2",
      status: "assigned",
      refereeName: "Maria Schmidt",
    });

    const res = await app.request("/games/300/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 2, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      success: true,
      slot: "sr2",
      status: "assigned",
      refereeName: "Maria Schmidt",
    });
    expect(mocks.assignReferee).toHaveBeenCalledWith(300, 2, 9001);
  });

  it("returns 400 for invalid body (slotNumber out of range)", async () => {
    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 5, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(400);
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid spielplanId (non-numeric)", async () => {
    const res = await app.request("/games/abc/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(400);
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("maps AssignmentError SLOT_TAKEN to HTTP 409", async () => {
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9001, isOwnClub: true }]);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.assignReferee.mockRejectedValue(
      new AssignmentError("Slot already taken", "SLOT_TAKEN"),
    );

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("maps AssignmentError GAME_NOT_FOUND to HTTP 404", async () => {
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9001, isOwnClub: true }]);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.assignReferee.mockRejectedValue(
      new AssignmentError("Game not found", "GAME_NOT_FOUND"),
    );

    const res = await app.request("/games/999/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("maps AssignmentError NOT_QUALIFIED to HTTP 422", async () => {
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9001, isOwnClub: true }]);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.assignReferee.mockRejectedValue(
      new AssignmentError("Not qualified", "NOT_QUALIFIED"),
    );

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({ code: "NOT_QUALIFIED" });
  });

  it("maps AssignmentError FEDERATION_ERROR to HTTP 502", async () => {
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9001, isOwnClub: true }]);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.assignReferee.mockRejectedValue(
      new AssignmentError("Federation error", "FEDERATION_ERROR"),
    );

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(502);
    expect(await json(res)).toMatchObject({ code: "FEDERATION_ERROR" });
  });

  it("re-throws unknown errors to the error handler", async () => {
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9001, isOwnClub: true }]);
    mocks.assignReferee.mockRejectedValue(new Error("Unexpected DB failure"));

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(500);
    expect(await json(res)).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("maps DENY_RULE to 403", async () => {
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9001, isOwnClub: true }]);
    const { AssignmentError } = await import("../../services/referee/referee-assignment.service");
    mocks.assignReferee.mockRejectedValue(new AssignmentError("blocked by rule", "DENY_RULE"));

    const res = await app.request("/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DENY_RULE" });
  });
});

describe("POST /games/:id/claim", () => {
  it("returns 401 when no session", async () => {
    mocks.gate = "unauthorized";

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(401);
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("returns 403 when user has no referee profile", async () => {
    mocks.gate = "forbidden";

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(403);
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/games/abc/claim", { method: "POST" });

    expect(res.status).toBe(400);
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("claims with auto-picked slot when no body", async () => {
    mocks.claimRefereeGame.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Hans Muster",
    });

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(200);
    expect(mocks.claimRefereeGame).toHaveBeenCalledWith({
      refereeId: 7,
      gameId: 5,
      slotNumber: undefined,
    });
  });

  it("claims with explicit slotNumber", async () => {
    mocks.claimRefereeGame.mockResolvedValue({
      success: true,
      slot: "sr2",
      status: "assigned",
      refereeName: "Hans Muster",
    });

    const res = await app.request("/games/5/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 2 }),
    });

    expect(res.status).toBe(200);
    expect(mocks.claimRefereeGame).toHaveBeenCalledWith({
      refereeId: 7,
      gameId: 5,
      slotNumber: 2,
    });
  });

  it("returns 400 when body is malformed JSON", async () => {
    const res = await app.request("/games/5/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("maps SLOT_TAKEN from service to 409", async () => {
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.claimRefereeGame.mockRejectedValue(
      new AssignmentError("taken", "SLOT_TAKEN"),
    );

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("maps NOT_OWN_CLUB from service to 403", async () => {
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.claimRefereeGame.mockRejectedValue(
      new AssignmentError("not own club", "NOT_OWN_CLUB"),
    );

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "NOT_OWN_CLUB" });
  });

  it("re-throws unknown errors to error handler", async () => {
    mocks.claimRefereeGame.mockRejectedValue(new Error("boom"));

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(500);
  });
});

describe("DELETE /games/:id/claim", () => {
  it("returns 401 when no session", async () => {
    mocks.gate = "unauthorized";

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no referee profile", async () => {
    mocks.gate = "forbidden";

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(mocks.unclaimRefereeGame).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid id", async () => {
    const res = await app.request("/games/abc/claim", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(mocks.unclaimRefereeGame).not.toHaveBeenCalled();
  });

  it("unclaims and returns response", async () => {
    mocks.unclaimRefereeGame.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "open",
    });

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(mocks.unclaimRefereeGame).toHaveBeenCalledWith({
      refereeId: 7,
      gameId: 5,
    });
  });

  it("maps NOT_ASSIGNED from service to 409", async () => {
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.unclaimRefereeGame.mockRejectedValue(
      new AssignmentError("not assigned", "NOT_ASSIGNED"),
    );

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "NOT_ASSIGNED" });
  });

  it("maps FEDERATION_ERROR from service to 502", async () => {
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.unclaimRefereeGame.mockRejectedValue(
      new AssignmentError("federation", "FEDERATION_ERROR"),
    );

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(502);
  });

  it("re-throws unknown errors", async () => {
    mocks.unclaimRefereeGame.mockRejectedValue(new Error("boom"));

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(500);
  });
});

// Covers the defensive `refereeId === undefined` branch inside each handler.
// `requireRefereeSelf` normally guarantees refereeId is set, but these checks
// exist as a fallback in case the middleware is ever bypassed or misconfigured.
describe("defensive refereeId guard (middleware bypass)", () => {
  it("POST /games/:id/assign returns 403 when refereeId is missing from context", async () => {
    mocks.refereeId = undefined;
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9001, isOwnClub: true }]);

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("POST /games/:id/claim returns 403 when refereeId is missing from context", async () => {
    mocks.refereeId = undefined;

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("DELETE /games/:id/claim returns 403 when refereeId is missing from context", async () => {
    mocks.refereeId = undefined;

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.unclaimRefereeGame).not.toHaveBeenCalled();
  });
});
