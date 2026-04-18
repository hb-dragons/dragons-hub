import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  assignReferee: vi.fn(),
  claimRefereeGame: vi.fn(),
  unclaimRefereeGame: vi.fn(),
  getSession: vi.fn(),
  dbSelect: vi.fn(),
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

vi.mock("../../config/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
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
  user: { id: "u.id", refereeId: "u.refereeId" },
}));

import { refereeAssignmentRoutes } from "./assignment.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", refereeAssignmentRoutes);

function json(response: Response) {
  return response.json();
}

beforeEach(() => vi.clearAllMocks());

describe("POST /games/:spielplanId/assign", () => {
  it("returns 401 when no session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns 403 when authenticated user has role 'member'", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-3", role: "member" },
      session: {},
    });

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
    mocks.getSession.mockResolvedValue({
      user: { id: "user-2", role: "admin" },
      session: {},
    });

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("returns 403 when referee role has no refereeId linked in DB", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1", role: "referee" },
      session: {},
    });
    // DB user lookup returns no refereeId
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: null }]);

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("returns 403 when referee tries to assign a different referee", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1", role: "referee" },
      session: {},
    });
    // First DB call: user table lookup returns refereeId 7
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
    // Second DB call: referees lookup for id=7 returns apiId 9999 (≠ 9001)
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9999 }]);

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
    mocks.getSession.mockResolvedValue({
      user: { id: "user1", role: "referee" },
    });
    mocks.dbSelect
      .mockResolvedValueOnce([{ refereeId: 10 }])
      .mockResolvedValueOnce([{ apiId: 555, isOwnClub: false }]);

    const res = await app.request("/games/123/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 555 }),
    });

    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
  });

  it("allows admin to assign any referee without DB lookup", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-2", role: "admin" },
      session: {},
    });
    mocks.assignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Hans Muster",
    });

    const res = await app.request("/games/200/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(200);
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.assignReferee).toHaveBeenCalledWith(200, 1, 9001);
  });

  it("allows referee to assign themselves when apiId matches", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1", role: "referee" },
      session: {},
    });
    // First DB call: user table lookup returns refereeId 7
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
    // Second DB call: referees lookup for id=7 returns apiId 9001 (matches body)
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
    mocks.getSession.mockResolvedValue({
      user: { id: "user-2", role: "admin" },
      session: {},
    });

    const res = await app.request("/games/100/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 5, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(400);
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid spielplanId (non-numeric)", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-2", role: "admin" },
      session: {},
    });

    const res = await app.request("/games/abc/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });

    expect(res.status).toBe(400);
    expect(mocks.assignReferee).not.toHaveBeenCalled();
  });

  it("maps AssignmentError SLOT_TAKEN to HTTP 409", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-2", role: "admin" },
      session: {},
    });
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
    mocks.getSession.mockResolvedValue({
      user: { id: "user-2", role: "admin" },
      session: {},
    });
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
    mocks.getSession.mockResolvedValue({
      user: { id: "user-2", role: "admin" },
      session: {},
    });
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
    mocks.getSession.mockResolvedValue({
      user: { id: "user-2", role: "admin" },
      session: {},
    });
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
    mocks.getSession.mockResolvedValue({
      user: { id: "user-2", role: "admin" },
      session: {},
    });
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
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "admin" }, session: {} });
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
    mocks.getSession.mockResolvedValue(null);

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(401);
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("returns 403 when user role is admin (admins use /assign)", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(403);
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("returns 403 when user role is not referee", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "member" } });

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(403);
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid id", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });

    const res = await app.request("/games/abc/claim", { method: "POST" });

    expect(res.status).toBe(400);
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("returns 403 when referee has no linked refereeId", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: null }]);

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("claims with auto-picked slot when no body", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
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
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
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
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);

    const res = await app.request("/games/5/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
    expect(mocks.claimRefereeGame).not.toHaveBeenCalled();
  });

  it("maps SLOT_TAKEN from service to 409", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
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
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
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
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
    mocks.claimRefereeGame.mockRejectedValue(new Error("boom"));

    const res = await app.request("/games/5/claim", { method: "POST" });

    expect(res.status).toBe(500);
  });
});

describe("DELETE /games/:id/claim", () => {
  it("returns 401 when no session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user role is not referee", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(mocks.unclaimRefereeGame).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid id", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });

    const res = await app.request("/games/abc/claim", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(mocks.unclaimRefereeGame).not.toHaveBeenCalled();
  });

  it("returns 403 when referee has no linked refereeId", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: null }]);

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("unclaims and returns response", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
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
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
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
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
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
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "referee" } });
    mocks.dbSelect.mockResolvedValueOnce([{ refereeId: 7 }]);
    mocks.unclaimRefereeGame.mockRejectedValue(new Error("boom"));

    const res = await app.request("/games/5/claim", { method: "DELETE" });

    expect(res.status).toBe(500);
  });
});
