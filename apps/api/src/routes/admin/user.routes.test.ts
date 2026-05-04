import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
}));

vi.mock("../../config/database", () => {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => mocks.dbSelect()),
  };
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() => mocks.dbUpdate()),
  };
  return {
    db: {
      select: vi.fn(() => selectChain),
      update: vi.fn(() => updateChain),
    },
  };
});

vi.mock("@dragons/db/schema", () => ({
  user: { id: "user.id", refereeId: "user.refereeId" },
  referees: { id: "referees.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() =>
    async (_c: unknown, next: () => Promise<void>) => next(),
  ),
  requireAnyRole: vi.fn(() =>
    async (_c: unknown, next: () => Promise<void>) => next(),
  ),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

// --- Imports (after mocks) ---

import { userRoutes } from "./user.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", userRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /users/:id/referee-link", () => {
  it("links a referee to a user", async () => {
    mocks.dbSelect.mockResolvedValue([{ id: 42 }]);
    mocks.dbUpdate.mockResolvedValue([{ id: "user-1", refereeId: 42 }]);

    const res = await app.request("/users/user-1/referee-link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refereeId: 42 }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ id: "user-1", refereeId: 42 });
  });

  it("unlinks a referee (refereeId: null)", async () => {
    mocks.dbUpdate.mockResolvedValue([{ id: "user-1", refereeId: null }]);

    const res = await app.request("/users/user-1/referee-link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refereeId: null }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ id: "user-1", refereeId: null });
    // Should not query referees table when unlinking
    expect(mocks.dbSelect).not.toHaveBeenCalled();
  });

  it("returns 404 when referee does not exist", async () => {
    mocks.dbSelect.mockResolvedValue([]);

    const res = await app.request("/users/user-1/referee-link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refereeId: 999 }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "Referee not found" });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when user does not exist", async () => {
    mocks.dbSelect.mockResolvedValue([{ id: 42 }]);
    mocks.dbUpdate.mockResolvedValue([]);

    const res = await app.request("/users/nonexistent/referee-link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refereeId: 42 }),
    });

    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "User not found" });
  });
});
