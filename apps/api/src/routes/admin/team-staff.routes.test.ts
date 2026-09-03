import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import type { AppEnv } from "../../types";
import type { TeamStaffMember } from "@dragons/shared";

// --- Mocks (hoisted before imports) ---
//
// Only the session and the permission check are stubbed. drizzle, the schema
// and the staff service all run for real against PGlite, so the entry-scoping
// predicates, the cascade and the NOT NULL columns are exercised rather than
// asserted against a fixture this file made up.

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
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
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

import { teamStaffRoutes } from "./team-staff.routes";
import { errorHandler } from "../../middleware/error";
import { seasons, teams, teamEntries, teamStaff } from "@dragons/db/schema";
import { eq } from "drizzle-orm";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", teamStaffRoutes);

/**
 * Typed as the shared interface, so `tsc` refuses to compile this file if
 * `TeamStaffMember` grows, loses or renames a field. The assertion below then
 * compares the live response against its key set.
 */
const staffMemberShape: TeamStaffMember = {
  id: 0,
  teamEntryId: 0,
  firstName: "",
  lastName: "",
  role: "trainer",
  phone: null,
  email: null,
  licence: null,
  photoFilename: null,
  refereeContact: false,
};

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
  mocks.userHasPermission.mockResolvedValue({ success: true });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

/** Grant exactly the listed `resource:action` pairs; deny everything else. */
function grantOnly(...granted: string[]) {
  mocks.userHasPermission.mockImplementation(
    async (args: { body: { permissions: Record<string, string[]> } }) => {
      const asked = Object.entries(args.body.permissions).flatMap(([resource, actions]) =>
        actions.map((action) => `${resource}:${action}`),
      );
      return { success: asked.every((pair) => granted.includes(pair)) };
    },
  );
}

async function seedEntry(
  apiTeamPermanentId: number,
  opts: { isOwnClub?: boolean } = {},
): Promise<number> {
  const [season] = await ctx.db
    .insert(seasons)
    .values({ name: `S${apiTeamPermanentId}`, status: "upcoming" })
    .returning({ id: seasons.id });
  const [team] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId,
      seasonTeamId: apiTeamPermanentId * 10,
      teamCompetitionId: apiTeamPermanentId,
      name: `Team ${apiTeamPermanentId}`,
      clubId: 1,
      isOwnClub: opts.isOwnClub ?? true,
    })
    .returning({ id: teams.id });
  const [entry] = await ctx.db
    .insert(teamEntries)
    .values({ teamId: team!.id, seasonId: season!.id })
    .returning({ id: teamEntries.id });
  return entry!.id;
}

function postStaff(entryId: number, body: unknown) {
  return app.request(`/teams/${entryId}/staff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchStaff(entryId: number, staffId: number, body: unknown) {
  return app.request(`/teams/${entryId}/staff/${staffId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createStaff(
  entryId: number,
  body: Record<string, unknown>,
): Promise<TeamStaffMember> {
  const res = await postStaff(entryId, body);
  expect(res.status).toBe(201);
  return (await res.json()) as TeamStaffMember;
}

describe("POST /teams/:id/staff", () => {
  it("creates a staff member and returns it in the shared shape", async () => {
    const entryId = await seedEntry(10);

    const res = await postStaff(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
      refereeContact: true,
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as TeamStaffMember;
    expect(Object.keys(body).sort()).toEqual(Object.keys(staffMemberShape).sort());
    expect(body).toMatchObject({
      teamEntryId: entryId,
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
      photoFilename: null,
      refereeContact: true,
    });
  });

  it("defaults the optional fields", async () => {
    const entryId = await seedEntry(10);
    const created = await createStaff(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "co_trainer",
    });
    expect(created).toMatchObject({
      phone: null,
      email: null,
      licence: null,
      refereeContact: false,
    });
  });

  it("rejects a role outside the two allowed values", async () => {
    const entryId = await seedEntry(10);
    const res = await postStaff(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "betreuer",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("404s for an entry of a team that is not our club", async () => {
    const entryId = await seedEntry(99, { isOwnClub: false });
    const res = await postStaff(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
    });
    expect(res.status).toBe(404);
    expect(await ctx.db.select().from(teamStaff)).toEqual([]);
  });

  it("404s for an entry that does not exist", async () => {
    const res = await postStaff(4242, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /teams/:id/staff", () => {
  it("lists Trainer before Co-Trainer, alphabetical inside a role", async () => {
    const entryId = await seedEntry(10);
    await createStaff(entryId, { firstName: "Zoe", lastName: "Zander", role: "trainer" });
    await createStaff(entryId, { firstName: "Ada", lastName: "Adams", role: "co_trainer" });
    await createStaff(entryId, { firstName: "Ben", lastName: "Adams", role: "trainer" });

    const res = await app.request(`/teams/${entryId}/staff`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as TeamStaffMember[];
    expect(body.map((s) => `${s.role}:${s.lastName}`)).toEqual([
      "trainer:Adams",
      "trainer:Zander",
      "co_trainer:Adams",
    ]);
  });

  it("does not leak another entry's staff", async () => {
    const mine = await seedEntry(10);
    const theirs = await seedEntry(20);
    await createStaff(mine, { firstName: "Ada", lastName: "Mine", role: "trainer" });
    await createStaff(theirs, { firstName: "Ben", lastName: "Theirs", role: "trainer" });

    const res = await app.request(`/teams/${mine}/staff`);
    const body = (await res.json()) as TeamStaffMember[];

    expect(body.map((s) => s.lastName)).toEqual(["Mine"]);
  });

  it("returns an empty list for an entry with no staff", async () => {
    const entryId = await seedEntry(10);
    const res = await app.request(`/teams/${entryId}/staff`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("404s for an entry that is not an own-club entry", async () => {
    const entryId = await seedEntry(99, { isOwnClub: false });
    const res = await app.request(`/teams/${entryId}/staff`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /teams/:id/staff/:staffId", () => {
  it("changes only the fields the patch names", async () => {
    const entryId = await seedEntry(10);
    const created = await createStaff(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
      phone: "+49 170 1234567",
      licence: "C-Lizenz",
    });

    const res = await patchStaff(entryId, created.id, { lastName: "Byron" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      firstName: "Ada",
      lastName: "Byron",
      phone: "+49 170 1234567",
      licence: "C-Lizenz",
    });
  });

  it("flips the referee-contact toggle in both directions", async () => {
    const entryId = await seedEntry(10);
    const created = await createStaff(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
    });

    const on = await patchStaff(entryId, created.id, { refereeContact: true });
    expect(((await on.json()) as TeamStaffMember).refereeContact).toBe(true);

    const off = await patchStaff(entryId, created.id, { refereeContact: false });
    expect(((await off.json()) as TeamStaffMember).refereeContact).toBe(false);
  });

  it("clears a contact field with an empty string", async () => {
    const entryId = await seedEntry(10);
    const created = await createStaff(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
      phone: "+49 170 1234567",
      email: "ada@example.de",
    });

    const res = await patchStaff(entryId, created.id, { phone: "", email: "" });

    expect(await res.json()).toMatchObject({ phone: null, email: null });
  });

  it("404s when the staff member belongs to a different entry", async () => {
    const mine = await seedEntry(10);
    const theirs = await seedEntry(20);
    const created = await createStaff(theirs, {
      firstName: "Ben",
      lastName: "Theirs",
      role: "trainer",
    });

    const res = await patchStaff(mine, created.id, { lastName: "Hijacked" });

    expect(res.status).toBe(404);
    const [row] = await ctx.db.select().from(teamStaff);
    expect(row!.lastName).toBe("Theirs");
  });

  it("rejects an unknown field", async () => {
    const entryId = await seedEntry(10);
    const created = await createStaff(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
    });
    const res = await patchStaff(entryId, created.id, { photoFilename: "x.jpg" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /teams/:id/staff/:staffId", () => {
  it("removes the staff member", async () => {
    const entryId = await seedEntry(10);
    const created = await createStaff(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
    });

    const res = await app.request(`/teams/${entryId}/staff/${created.id}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect(await ctx.db.select().from(teamStaff)).toEqual([]);
  });

  it("404s for a staff member of a different entry and leaves the row alone", async () => {
    const mine = await seedEntry(10);
    const theirs = await seedEntry(20);
    const created = await createStaff(theirs, {
      firstName: "Ben",
      lastName: "Theirs",
      role: "trainer",
    });

    const res = await app.request(`/teams/${mine}/staff/${created.id}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    expect(await ctx.db.select().from(teamStaff)).toHaveLength(1);
  });

  it("404s for an unknown staff id", async () => {
    const entryId = await seedEntry(10);
    const res = await app.request(`/teams/${entryId}/staff/4242`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("cascade", () => {
  it("deleting the team entry deletes its staff", async () => {
    const entryId = await seedEntry(10);
    await createStaff(entryId, { firstName: "Ada", lastName: "Lovelace", role: "trainer" });

    await ctx.db.delete(teamEntries).where(eq(teamEntries.id, entryId));

    expect(await ctx.db.select().from(teamStaff)).toEqual([]);
  });
});

describe("permission gating", () => {
  it("lets team:view read the staff list but not write it", async () => {
    const entryId = await seedEntry(10);
    grantOnly("team:view");

    expect((await app.request(`/teams/${entryId}/staff`)).status).toBe(200);
    expect(
      (await postStaff(entryId, { firstName: "Ada", lastName: "L", role: "trainer" }))
        .status,
    ).toBe(403);
    expect((await patchStaff(entryId, 1, { refereeContact: true })).status).toBe(403);
    expect(
      (await app.request(`/teams/${entryId}/staff/1`, { method: "DELETE" })).status,
    ).toBe(403);
  });

  it("rejects a caller with neither permission", async () => {
    const entryId = await seedEntry(10);
    grantOnly();
    expect((await app.request(`/teams/${entryId}/staff`)).status).toBe(403);
  });

  it("rejects an unauthenticated caller", async () => {
    const entryId = await seedEntry(10);
    mocks.getSession.mockResolvedValue(null);
    expect((await app.request(`/teams/${entryId}/staff`)).status).toBe(401);
  });
});
