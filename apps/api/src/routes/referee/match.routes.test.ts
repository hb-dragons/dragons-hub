import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbSelect: vi.fn(),
  getMatchesWithOpenSlots: vi.fn(),
  recordTakeIntent: vi.fn(),
  cancelTakeIntent: vi.fn(),
}));

vi.mock("../../middleware/auth", () => ({
  requireReferee: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
    },
  },
}));

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  user: {
    id: "id",
    refereeId: "referee_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
}));

vi.mock("../../services/referee/referee-match.service", () => ({
  getMatchesWithOpenSlots: (...args: unknown[]) => mocks.getMatchesWithOpenSlots(...args),
  recordTakeIntent: (...args: unknown[]) => mocks.recordTakeIntent(...args),
  cancelTakeIntent: (...args: unknown[]) => mocks.cancelTakeIntent(...args),
}));

// --- Imports (after mocks) ---

import { refereeMatchRoutes } from "./match.routes";

// Test app
const app = new Hono<AppEnv>();
// Simulate authenticated user on all requests
app.use("/*", async (c, next) => {
  c.set("user", { id: "user-123", role: "referee" } as AppEnv["Variables"]["user"]);
  c.set("session", { id: "sess-1" } as AppEnv["Variables"]["session"]);
  await next();
});
app.route("/referee", refereeMatchRoutes);

function json(response: Response) {
  return response.json();
}

// --- Helpers ---

function mockDbUserFound(refereeId: number | null) {
  mocks.dbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(
          refereeId !== null ? [{ refereeId }] : [],
        ),
      }),
    }),
  });
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /referee/matches", () => {
  it("calls getMatchesWithOpenSlots and returns result", async () => {
    mockDbUserFound(42);
    const mockResult = { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
    mocks.getMatchesWithOpenSlots.mockResolvedValue(mockResult);

    const res = await app.request("/referee/matches");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(mockResult);
    expect(mocks.getMatchesWithOpenSlots).toHaveBeenCalledWith(
      { limit: 50, offset: 0, leagueId: undefined, dateFrom: undefined, dateTo: undefined },
      42,
    );
  });

  it("returns 400 if user has no refereeId", async () => {
    mockDbUserFound(null);

    const res = await app.request("/referee/matches");

    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "User not linked to a referee record" });
  });

  it("respects query params (limit, offset, leagueId, dateFrom, dateTo)", async () => {
    mockDbUserFound(42);
    const mockResult = { items: [], total: 0, limit: 10, offset: 5, hasMore: false };
    mocks.getMatchesWithOpenSlots.mockResolvedValue(mockResult);

    const res = await app.request(
      "/referee/matches?limit=10&offset=5&leagueId=7&dateFrom=2026-01-01&dateTo=2026-12-31",
    );

    expect(res.status).toBe(200);
    expect(mocks.getMatchesWithOpenSlots).toHaveBeenCalledWith(
      { limit: 10, offset: 5, leagueId: 7, dateFrom: "2026-01-01", dateTo: "2026-12-31" },
      42,
    );
  });

  it("caps limit at 100", async () => {
    mockDbUserFound(42);
    mocks.getMatchesWithOpenSlots.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0, hasMore: false });

    await app.request("/referee/matches?limit=999");

    expect(mocks.getMatchesWithOpenSlots).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
      42,
    );
  });
});

describe("POST /referee/matches/:id/take", () => {
  it("calls recordTakeIntent and returns 201", async () => {
    mockDbUserFound(42);
    const mockResult = {
      deepLink: "https://basketball-bund.net/app.do?app=/sr/take&spielId=100",
      intent: { matchId: 5, slotNumber: 1, clickedAt: "2026-01-01T00:00:00.000Z" },
    };
    mocks.recordTakeIntent.mockResolvedValue(mockResult);

    const res = await app.request("/referee/matches/5/take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1 }),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toEqual(mockResult);
    expect(mocks.recordTakeIntent).toHaveBeenCalledWith(5, 42, 1);
  });

  it("returns 400 for invalid slotNumber", async () => {
    mockDbUserFound(42);

    const res = await app.request("/referee/matches/5/take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 4 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "slotNumber must be 1 or 2" });
    expect(mocks.recordTakeIntent).not.toHaveBeenCalled();
  });

  it("returns 400 for slotNumber 0", async () => {
    mockDbUserFound(42);

    const res = await app.request("/referee/matches/5/take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 0 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "slotNumber must be 1 or 2" });
  });

  it("passes through service errors (404)", async () => {
    mockDbUserFound(42);
    mocks.recordTakeIntent.mockResolvedValue({ error: "Match not found", status: 404 });

    const res = await app.request("/referee/matches/999/take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1 }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "Match not found" });
  });

  it("passes through service errors (400 slot not open)", async () => {
    mockDbUserFound(42);
    mocks.recordTakeIntent.mockResolvedValue({ error: "This referee slot is not open", status: 400 });

    const res = await app.request("/referee/matches/5/take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 2 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "This referee slot is not open" });
  });

  it("returns 400 if user has no refereeId", async () => {
    mockDbUserFound(null);

    const res = await app.request("/referee/matches/5/take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "User not linked to a referee record" });
  });
});

describe("DELETE /referee/matches/:id/take", () => {
  it("calls cancelTakeIntent and returns success", async () => {
    mockDbUserFound(42);
    mocks.cancelTakeIntent.mockResolvedValue({ success: true });

    const res = await app.request("/referee/matches/5/take", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1 }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(mocks.cancelTakeIntent).toHaveBeenCalledWith(5, 42, 1);
  });

  it("returns 400 for invalid slotNumber", async () => {
    mockDbUserFound(42);

    const res = await app.request("/referee/matches/5/take", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 4 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "slotNumber must be 1 or 2" });
  });

  it("passes through service errors (404 no pending intent)", async () => {
    mockDbUserFound(42);
    mocks.cancelTakeIntent.mockResolvedValue({ error: "No pending intent found", status: 404 });

    const res = await app.request("/referee/matches/5/take", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1 }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "No pending intent found" });
  });

  it("returns 400 if user has no refereeId", async () => {
    mockDbUserFound(null);

    const res = await app.request("/referee/matches/5/take", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotNumber: 1 }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "User not linked to a referee record" });
  });
});
