import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Hoisted mocks ---

const mocks = vi.hoisted(() => ({
  getEligibleOpenGames: vi.fn(),
  dbRow: null as { apiId: number } | null,
}));

vi.mock("../../services/referee/eligible-open-games.service", () => ({
  getEligibleOpenGames: mocks.getEligibleOpenGames,
}));

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mocks.dbRow ? [mocks.dbRow] : []),
        }),
      }),
    }),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({ eq: [_a, _b] })),
}));

vi.mock("@dragons/db/schema", () => ({
  referees: { id: "r.id", apiId: "r.apiId" },
}));

// --- Subject (imported after mocks) ---

import { refereeEligibleGamesRoutes } from "./referee-eligible-games.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/admin", refereeEligibleGamesRoutes);

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbRow = null;
});

// --- Tests ---

describe("GET /admin/referees/:id/eligible-open-games", () => {
  it("returns 400 for id = 0 (invalid)", async () => {
    const res = await app.request("/admin/referees/0/eligible-open-games");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await app.request("/admin/referees/abc/eligible-open-games");
    expect(res.status).toBe(400);
  });

  it("returns 404 when the referee is not in the DB", async () => {
    mocks.dbRow = null;
    const res = await app.request("/admin/referees/999/eligible-open-games");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("looks up apiId from DB and calls getEligibleOpenGames with it", async () => {
    mocks.dbRow = { apiId: 555 };
    mocks.getEligibleOpenGames.mockResolvedValueOnce({ items: [] });

    const res = await app.request("/admin/referees/7/eligible-open-games");

    expect(res.status).toBe(200);
    expect(mocks.getEligibleOpenGames).toHaveBeenCalledWith(555);
  });

  it("returns { items } from the service", async () => {
    mocks.dbRow = { apiId: 42 };
    mocks.getEligibleOpenGames.mockResolvedValueOnce({
      items: [{ apiMatchId: 100 }, { apiMatchId: 200 }],
    });

    const res = await app.request("/admin/referees/3/eligible-open-games");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].apiMatchId).toBe(100);
  });
});
