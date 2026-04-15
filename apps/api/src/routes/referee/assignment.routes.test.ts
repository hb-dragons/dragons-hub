import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  assignReferee: vi.fn(),
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
  referees: { id: "r.id", apiId: "r.apiId" },
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
    mocks.dbSelect.mockResolvedValueOnce([{ apiId: 9001 }]);
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
