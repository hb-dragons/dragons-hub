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
});
