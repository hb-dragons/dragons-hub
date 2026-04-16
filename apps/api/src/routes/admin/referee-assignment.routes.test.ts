import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  assignReferee: vi.fn(),
  unassignReferee: vi.fn(),
  searchCandidates: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("../../services/referee/referee-assignment.service", () => ({
  assignReferee: mocks.assignReferee,
  unassignReferee: mocks.unassignReferee,
  searchCandidates: mocks.searchCandidates,
  AssignmentError: class AssignmentError extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  },
}));

vi.mock("../../config/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

import { adminRefereeAssignmentRoutes } from "./referee-assignment.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", adminRefereeAssignmentRoutes);

const adminSession = {
  user: { id: "u1", role: "admin", refereeId: null },
  session: {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /referee/games/:spielplanId/candidates", () => {
  it("returns 401 without session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await app.request("/referee/games/12345/candidates?slotNumber=1");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "referee", refereeId: 7 },
      session: {},
    });
    const res = await app.request("/referee/games/12345/candidates?slotNumber=1");
    expect(res.status).toBe(403);
  });

  it("returns candidates for admin", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.searchCandidates.mockResolvedValue({ total: 3, results: [] });

    const res = await app.request(
      "/referee/games/12345/candidates?slotNumber=1&search=Max&pageFrom=0&pageSize=15",
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 3 });
    expect(mocks.searchCandidates).toHaveBeenCalledWith(12345, "Max", 0, 15);
  });

  it("returns 400 for invalid spielplanId (0 or negative)", async () => {
    mocks.getSession.mockResolvedValue(adminSession);

    const res1 = await app.request("/referee/games/0/candidates?slotNumber=1");
    expect(res1.status).toBe(400);
    expect(await res1.json()).toMatchObject({ code: "VALIDATION_ERROR" });

    const res2 = await app.request("/referee/games/-5/candidates?slotNumber=1");
    expect(res2.status).toBe(400);
  });

  it("returns 400 for invalid pageFrom (-1)", async () => {
    mocks.getSession.mockResolvedValue(adminSession);

    const res = await app.request("/referee/games/12345/candidates?slotNumber=1&pageFrom=-1");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid pageSize (0 or 101)", async () => {
    mocks.getSession.mockResolvedValue(adminSession);

    const res1 = await app.request("/referee/games/12345/candidates?slotNumber=1&pageSize=0");
    expect(res1.status).toBe(400);

    const res2 = await app.request("/referee/games/12345/candidates?slotNumber=1&pageSize=101");
    expect(res2.status).toBe(400);
  });

  it("returns mapped error status for AssignmentError", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.searchCandidates.mockRejectedValue(new AssignmentError("Game not found", "GAME_NOT_FOUND"));

    const res = await app.request("/referee/games/12345/candidates?slotNumber=1");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "GAME_NOT_FOUND" });
  });
});

describe("POST /referee/games/:spielplanId/assign", () => {
  const validBody = { slotNumber: 1, refereeApiId: 9001 };

  it("returns 401 without session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "referee", refereeId: 7 },
      session: {},
    });
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(403);
  });

  it("assigns referee and returns result", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.assignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "assigned",
      refereeName: "Max Muster",
    });

    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, slot: "sr1" });
    expect(mocks.assignReferee).toHaveBeenCalledWith(12345, 1, 9001);
  });

  it("returns 404 for GAME_NOT_FOUND", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.assignReferee.mockRejectedValue(new AssignmentError("Game not found", "GAME_NOT_FOUND"));
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("returns 502 for FEDERATION_ERROR", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.assignReferee.mockRejectedValue(new AssignmentError("Federation error", "FEDERATION_ERROR"));
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });
    expect(res.status).toBe(502);
  });

  it("returns 400 for invalid spielplanId (0)", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const res = await app.request("/referee/games/0/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid JSON body", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid slotNumber (3)", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 3, refereeApiId: 9001 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 for SLOT_TAKEN", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.assignReferee.mockRejectedValue(new AssignmentError("Slot taken", "SLOT_TAKEN"));
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("returns 422 for NOT_QUALIFIED", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.assignReferee.mockRejectedValue(new AssignmentError("Not qualified", "NOT_QUALIFIED"));
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "NOT_QUALIFIED" });
  });
});

describe("DELETE /referee/games/:spielplanId/assignment/:slotNumber", () => {
  it("returns 401 without session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await app.request("/referee/games/12345/assignment/1", {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "referee", refereeId: 7 },
      session: {},
    });
    const res = await app.request("/referee/games/12345/assignment/1", {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
  });

  it("unassigns and returns open status", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.unassignReferee.mockResolvedValue({
      success: true,
      slot: "sr1",
      status: "open",
    });

    const res = await app.request("/referee/games/12345/assignment/1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, slot: "sr1", status: "open" });
    expect(mocks.unassignReferee).toHaveBeenCalledWith(12345, 1);
  });

  it("returns 400 for non-numeric slotNumber", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const res = await app.request("/referee/games/12345/assignment/abc", {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for GAME_NOT_FOUND", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.unassignReferee.mockRejectedValue(new AssignmentError("Game not found", "GAME_NOT_FOUND"));
    const res = await app.request("/referee/games/12345/assignment/1", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("returns 502 for FEDERATION_ERROR", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const { AssignmentError } = await import(
      "../../services/referee/referee-assignment.service"
    );
    mocks.unassignReferee.mockRejectedValue(new AssignmentError("Federation error", "FEDERATION_ERROR"));
    const res = await app.request("/referee/games/12345/assignment/1", {
      method: "DELETE",
    });
    expect(res.status).toBe(502);
  });

  it("returns 400 for slotNumber 3 (not 1 or 2)", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const res = await app.request("/referee/games/12345/assignment/3", {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid spielplanId (0)", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    const res = await app.request("/referee/games/0/assignment/1", {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("re-throws non-AssignmentError", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.unassignReferee.mockRejectedValue(new Error("Unexpected DB failure"));
    const res = await app.request("/referee/games/12345/assignment/1", {
      method: "DELETE",
    });
    expect(res.status).toBe(500);
  });
});

describe("error re-throw for non-AssignmentError", () => {
  it("re-throws in candidates search", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.searchCandidates.mockRejectedValue(new Error("Unexpected DB failure"));
    const res = await app.request("/referee/games/12345/candidates");
    expect(res.status).toBe(500);
  });

  it("re-throws in assign", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.assignReferee.mockRejectedValue(new Error("Unexpected DB failure"));
    const res = await app.request("/referee/games/12345/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1, refereeApiId: 9001 }),
    });
    expect(res.status).toBe(500);
  });
});
