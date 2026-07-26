import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---
//
// Deliberately NOT mocking drizzle-orm, the board service, or the rbac
// middleware: this file asserts what actually lands in the `boards` row, so
// everything from the HTTP body down to the INSERT runs for real against
// PGlite. Only the auth provider is stubbed, so we can act as a chosen user.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  userHasPermission: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      userHasPermission: (...args: unknown[]) => mocks.userHasPermission(...args),
    },
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Imports (after mocks) ---

import { boardRoutes } from "./board.routes";
import { errorHandler } from "../../middleware/error";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", boardRoutes);

const ATTACKER = "user-attacker";
const VICTIM = "user-victim-admin";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  // Authenticated as the attacker, who legitimately holds board:update.
  mocks.getSession.mockResolvedValue({
    user: { id: ATTACKER, role: "venueManager" },
    session: { id: "sess-attacker" },
  });
  mocks.userHasPermission.mockResolvedValue({ success: true });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function storedCreatedBy(): Promise<Array<string | null>> {
  const rows = await ctx.client.query<{ created_by: string | null }>(
    "SELECT created_by FROM boards ORDER BY id",
  );
  return rows.rows.map((r) => r.created_by);
}

describe("POST /boards — audit actor cannot be spoofed", () => {
  // `boardCreateBodySchema` is strict, so a body naming an actor the server
  // owns is rejected outright rather than silently stripped. Either way the
  // attacker cannot write someone else's id into `created_by`; rejecting is the
  // louder of the two, so the caller is not left believing it was honoured.
  it("rejects a body claiming another user as createdBy, and writes nothing", async () => {
    const res = await app.request("/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Spoofed", createdBy: VICTIM }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await storedCreatedBy()).toEqual([]);
  });

  it("rejects a null createdBy rather than erasing the audit actor", async () => {
    const res = await app.request("/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Anonymous", createdBy: null }),
    });

    expect(res.status).toBe(400);
    expect(await storedCreatedBy()).toEqual([]);
  });

  it("stores the session user as createdBy for an honest body", async () => {
    const res = await app.request("/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Honest", description: "Desc" }),
    });

    expect(res.status).toBe(201);
    expect(await storedCreatedBy()).toEqual([ATTACKER]);
    expect(await res.json()).toMatchObject({ createdBy: ATTACKER });
  });
});
