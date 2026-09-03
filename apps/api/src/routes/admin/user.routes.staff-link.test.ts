import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---
//
// The sibling `user.routes.test.ts` mocks the service to pin status mapping.
// This file is the other half of the criterion in issue #312 ("HTTP tests"):
// only the session is a double, so the route, the real service, the real RBAC
// guard, the unique constraint and the `ON DELETE SET NULL` FK all run.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../config/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mocks.getSession(...args) } },
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Imports (after mocks) ---

import { userRoutes } from "./user.routes";
import { errorHandler } from "../../middleware/error";
import {
  user as userTable,
  teamStaff,
  teamEntries,
  teams,
  seasons,
} from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

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

function linkStaff(userId: string, body: unknown) {
  return app.request(`/users/${userId}/link-staff`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedUser(id: string, role: string | null = null): Promise<void> {
  await ctx.db
    .insert(userTable)
    .values({ id, name: id, email: `${id}@example.test`, role });
}

async function seedStaff(lastName: string): Promise<number> {
  const [season] = await ctx.db
    .insert(seasons)
    .values({ name: `S-${lastName}`, status: "upcoming" })
    .returning({ id: seasons.id });
  const [team] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId: lastName.length * 1000 + lastName.charCodeAt(0),
      seasonTeamId: 1,
      teamCompetitionId: 1,
      name: `Team ${lastName}`,
      clubId: 1,
      isOwnClub: true,
    })
    .returning({ id: teams.id });
  const [entry] = await ctx.db
    .insert(teamEntries)
    .values({ teamId: team!.id, seasonId: season!.id })
    .returning({ id: teamEntries.id });
  const [staff] = await ctx.db
    .insert(teamStaff)
    .values({
      teamEntryId: entry!.id,
      firstName: "Coach",
      lastName,
      role: "trainer",
    })
    .returning({ id: teamStaff.id });
  return staff!.id;
}

async function userRow(id: string) {
  const [row] = await ctx.db
    .select({ staffId: userTable.staffId, role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, id));
  return row;
}

describe("PATCH /admin/users/:id/link-staff over HTTP", () => {
  it("grants the coach role only when the flag is set", async () => {
    await seedUser("u1");
    await seedUser("u2");
    const staffA = await seedStaff("Eins");
    const staffB = await seedStaff("Zwei");

    const granted = await linkStaff("u1", { staffId: staffA, grantCoachRole: true });
    const plain = await linkStaff("u2", { staffId: staffB, grantCoachRole: false });

    expect(granted.status).toBe(200);
    expect(plain.status).toBe(200);
    expect(await userRow("u1")).toEqual({ staffId: staffA, role: "coach" });
    expect(await userRow("u2")).toEqual({ staffId: staffB, role: null });
  });

  it("answers 409 when the staff record is already linked elsewhere", async () => {
    await seedUser("u1");
    await seedUser("u2");
    const staffId = await seedStaff("Eins");
    await linkStaff("u2", { staffId });

    const res = await linkStaff("u1", { staffId });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "STAFF_ALREADY_LINKED" });
    expect((await userRow("u1"))?.staffId).toBeNull();
  });

  it("leaves every role unchanged on unlink", async () => {
    await seedUser("u1", "teamManager");
    const staffId = await seedStaff("Eins");
    await linkStaff("u1", { staffId, grantCoachRole: true });

    const res = await linkStaff("u1", { staffId: null, grantCoachRole: true });

    expect(res.status).toBe(200);
    expect(await userRow("u1")).toEqual({
      staffId: null,
      role: "teamManager,coach",
    });
  });

  it("nulls the link when the staff row is deleted", async () => {
    await seedUser("u1");
    const staffId = await seedStaff("Eins");
    await linkStaff("u1", { staffId, grantCoachRole: true });

    await ctx.db.delete(teamStaff).where(eq(teamStaff.id, staffId));

    expect(await userRow("u1")).toEqual({ staffId: null, role: "coach" });
  });

  it("answers 404 for an unknown staff record", async () => {
    await seedUser("u1");

    const res = await linkStaff("u1", { staffId: 999999 });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "STAFF_NOT_FOUND" });
  });

  // The route is admin-only: a signed-in non-admin must not be able to hand
  // itself the coach role by linking to any staff record it likes.
  it("refuses a non-admin session with 403 and writes nothing", async () => {
    await seedUser("u1");
    const staffId = await seedStaff("Eins");
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", role: "teamManager" },
      session: { id: "sess-u1" },
    });

    const res = await linkStaff("u1", { staffId, grantCoachRole: true });

    expect(res.status).toBe(403);
    expect(await userRow("u1")).toEqual({ staffId: null, role: null });
  });

  it("refuses an anonymous request with 401", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await linkStaff("u1", { staffId: null });

    expect(res.status).toBe(401);
  });
});
