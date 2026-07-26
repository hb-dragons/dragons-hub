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
// Deliberately NOT mocking drizzle-orm, @dragons/db/schema or the rbac
// middleware. The route's whole job is a targeted UPDATE ... WHERE id = $1
// against `user`, plus a referee-existence probe; with `eq` stubbed to an
// identity function neither predicate is observable, so an unscoped UPDATE
// (which relinks every account in the table) passed the previous mocked suite.
// Only the auth provider is stubbed, so we can act as a chosen user.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

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
    },
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Imports (after mocks) ---

import { userRoutes } from "./user.routes";
import { errorHandler } from "../../middleware/error";
import { referees, user as userTable } from "@dragons/db/schema";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", userRoutes);

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    user: { id: "admin-1", role: "admin" },
    session: { id: "sess-admin" },
  });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function seedUser(id: string): Promise<void> {
  await ctx.db
    .insert(userTable)
    .values({ id, name: id, email: `${id}@example.test` });
}

async function seedReferee(apiId: number, lastName: string): Promise<number> {
  const [row] = await ctx.db
    .insert(referees)
    .values({ apiId, firstName: "Ref", lastName })
    .returning({ id: referees.id });
  return row!.id;
}

/** Every account's referee link, keyed by user id — the blast radius of the UPDATE. */
async function links(): Promise<Record<string, number | null>> {
  const rows = await ctx.db
    .select({ id: userTable.id, refereeId: userTable.refereeId })
    .from(userTable);
  return Object.fromEntries(rows.map((r) => [r.id, r.refereeId]));
}

function patch(userId: string, body: unknown) {
  return app.request(`/users/${userId}/referee-link`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /users/:id/referee-link", () => {
  it("links a referee to a user", async () => {
    await seedUser("user-1");
    const refereeId = await seedReferee(9001, "Eins");

    const res = await patch("user-1", { refereeId });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "user-1", refereeId });
  });

  it("persists the link on the row, not just in the response", async () => {
    await seedUser("user-1");
    const refereeId = await seedReferee(9001, "Eins");

    await patch("user-1", { refereeId });

    expect(await links()).toEqual({ "user-1": refereeId });
  });

  it("relinks only the addressed account, leaving other users untouched", async () => {
    await seedUser("user-1");
    await seedUser("user-2");
    const refA = await seedReferee(9001, "Eins");
    const refB = await seedReferee(9002, "Zwei");
    await patch("user-2", { refereeId: refB });

    const res = await patch("user-1", { refereeId: refA });

    expect(res.status).toBe(200);
    // An UPDATE that lost its `WHERE id = ...` would overwrite user-2 as well
    // (or fail the unique constraint) — the mocked suite could not see either.
    expect(await links()).toEqual({ "user-1": refA, "user-2": refB });
  });

  it("unlinks only the addressed account", async () => {
    await seedUser("user-1");
    await seedUser("user-2");
    const refA = await seedReferee(9001, "Eins");
    const refB = await seedReferee(9002, "Zwei");
    await patch("user-1", { refereeId: refA });
    await patch("user-2", { refereeId: refB });

    const res = await patch("user-1", { refereeId: null });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "user-1", refereeId: null });
    expect(await links()).toEqual({ "user-1": null, "user-2": refB });
  });

  it("returns 404 and changes nothing when the referee does not exist", async () => {
    await seedUser("user-1");
    await seedReferee(9001, "Eins");

    const res = await patch("user-1", { refereeId: 4242 });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Referee not found" });
    expect(await links()).toEqual({ "user-1": null });
  });

  it("returns 404 and changes nothing when the user does not exist", async () => {
    await seedUser("user-1");
    const refereeId = await seedReferee(9001, "Eins");

    const res = await patch("nonexistent", { refereeId });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
    // A `WHERE` that failed to scope by id would have linked user-1 instead.
    expect(await links()).toEqual({ "user-1": null });
  });

  it("rejects a non-integer refereeId with 400", async () => {
    await seedUser("user-1");

    const res = await patch("user-1", { refereeId: "42" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 403 for a non-admin caller", async () => {
    await seedUser("user-1");
    const refereeId = await seedReferee(9001, "Eins");
    mocks.getSession.mockResolvedValue({
      user: { id: "plain-1", role: "user" },
      session: { id: "sess-plain" },
    });

    const res = await patch("user-1", { refereeId });

    expect(res.status).toBe(403);
    expect(await links()).toEqual({ "user-1": null });
  });

  it("returns 401 when unauthenticated", async () => {
    await seedUser("user-1");
    mocks.getSession.mockResolvedValue(null);

    const res = await patch("user-1", { refereeId: 1 });

    expect(res.status).toBe(401);
  });
});
