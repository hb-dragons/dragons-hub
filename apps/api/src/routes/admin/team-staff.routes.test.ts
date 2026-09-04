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
// and the staff services all run for real against PGlite, so the entry-scoping
// predicates, the cascade and the unique constraint are exercised rather than
// asserted against a fixture this file made up.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  dispatchSiteRebuild: vi.fn(),
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
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    child: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
  },
}));

vi.mock("../../services/site-rebuild.service", () => ({
  dispatchSiteRebuild: mocks.dispatchSiteRebuild,
}));

// --- Imports (after mocks) ---

import { teamStaffRoutes } from "./team-staff.routes";
import { errorHandler } from "../../middleware/error";
import { seasons, teams, teamEntries, teamStaff, staffPeople } from "@dragons/db/schema";
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
  personId: 0,
  firstName: "",
  lastName: "",
  role: "trainer",
  phone: null,
  email: null,
  licence: null,
  photoUrl: null,
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

async function seedPerson(
  values: { firstName?: string; lastName?: string; phone?: string; photoFilename?: string } = {},
): Promise<number> {
  const [person] = await ctx.db
    .insert(staffPeople)
    .values({
      firstName: values.firstName ?? "Ada",
      lastName: values.lastName ?? "Lovelace",
      phone: values.phone ?? null,
      photoFilename: values.photoFilename ?? null,
    })
    .returning({ id: staffPeople.id });
  return person!.id;
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

/** The common case: a brand-new person attached to the entry in one call. */
function createInline(
  entryId: number,
  person: Record<string, unknown>,
  rest: Record<string, unknown> = {},
): Promise<TeamStaffMember> {
  return createStaff(entryId, { person, role: "trainer", ...rest });
}

describe("POST /teams/:id/staff", () => {
  it("attaches a person the club already knows and returns the shared shape", async () => {
    const entryId = await seedEntry(10);
    const personId = await seedPerson({ phone: "+49 170 1234567" });

    const res = await postStaff(entryId, { personId, role: "trainer", refereeContact: true });

    expect(res.status).toBe(201);
    const body = (await res.json()) as TeamStaffMember;
    expect(Object.keys(body).sort()).toEqual(Object.keys(staffMemberShape).sort());
    expect(body).toMatchObject({
      teamEntryId: entryId,
      personId,
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
      phone: "+49 170 1234567",
      photoUrl: null,
      refereeContact: true,
    });
  });

  it("creates the person inline and attaches them in one call", async () => {
    const entryId = await seedEntry(10);

    const created = await createInline(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
    });

    expect(created).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
      refereeContact: false,
    });
    const people = await ctx.db.select().from(staffPeople);
    expect(people).toHaveLength(1);
    expect(created.personId).toBe(people[0]!.id);
  });

  it("shares one person between two teams rather than copying them", async () => {
    const first = await seedEntry(10);
    const second = await seedEntry(11);
    const personId = await seedPerson();

    const a = await createStaff(first, { personId, role: "trainer" });
    const b = await createStaff(second, { personId, role: "co_trainer" });

    expect(a.personId).toBe(personId);
    expect(b.personId).toBe(personId);
    expect(await ctx.db.select().from(staffPeople)).toHaveLength(1);
  });

  it("409s when the person already holds an assignment on that team", async () => {
    const entryId = await seedEntry(10);
    const personId = await seedPerson();
    await createStaff(entryId, { personId, role: "trainer" });

    const res = await postStaff(entryId, { personId, role: "co_trainer" });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "STAFF_ALREADY_ASSIGNED" });
    expect(await ctx.db.select().from(teamStaff)).toHaveLength(1);
  });

  it("404s for a person the club does not know", async () => {
    const entryId = await seedEntry(10);

    const res = await postStaff(entryId, { personId: 4242, role: "trainer" });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(await ctx.db.select().from(teamStaff)).toEqual([]);
  });

  it("rejects a body naming neither a person nor a new one", async () => {
    const entryId = await seedEntry(10);
    const res = await postStaff(entryId, { role: "trainer" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a role outside the two allowed values", async () => {
    const entryId = await seedEntry(10);
    const res = await postStaff(entryId, { personId: await seedPerson(), role: "betreuer" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("404s for an entry of a team that is not our club, creating no person", async () => {
    const entryId = await seedEntry(99, { isOwnClub: false });

    const res = await postStaff(entryId, {
      person: { firstName: "Ada", lastName: "Lovelace" },
      role: "trainer",
    });

    expect(res.status).toBe(404);
    expect(await ctx.db.select().from(teamStaff)).toEqual([]);
    expect(await ctx.db.select().from(staffPeople)).toEqual([]);
  });

  it("404s for an entry that does not exist", async () => {
    const res = await postStaff(4242, { personId: await seedPerson(), role: "trainer" });
    expect(res.status).toBe(404);
  });
});

describe("GET /teams/:id/staff", () => {
  it("lists Trainer before Co-Trainer, alphabetical inside a role", async () => {
    const entryId = await seedEntry(10);
    await createInline(entryId, { firstName: "Zoe", lastName: "Zander" }, { role: "trainer" });
    await createInline(entryId, { firstName: "Ada", lastName: "Adams" }, { role: "co_trainer" });
    await createInline(entryId, { firstName: "Ben", lastName: "Adams" }, { role: "trainer" });

    const res = await app.request(`/teams/${entryId}/staff`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as TeamStaffMember[];
    expect(body.map((s) => `${s.role}:${s.lastName}`)).toEqual([
      "trainer:Adams",
      "trainer:Zander",
      "co_trainer:Adams",
    ]);
  });

  it("shows the person's fields, including a portrait stored on the person", async () => {
    const entryId = await seedEntry(10);
    const personId = await seedPerson({ photoFilename: "abc.webp", phone: "+49 111" });
    await createStaff(entryId, { personId, role: "trainer" });

    const [member] = (await (await app.request(`/teams/${entryId}/staff`)).json()) as
      TeamStaffMember[];

    expect(member).toMatchObject({
      phone: "+49 111",
      photoUrl: `/admin/staff-people/${personId}/photo?v=abc.webp`,
    });
  });

  it("does not leak another entry's staff", async () => {
    const mine = await seedEntry(10);
    const theirs = await seedEntry(20);
    await createInline(mine, { firstName: "Ada", lastName: "Mine" });
    await createInline(theirs, { firstName: "Ben", lastName: "Theirs" });

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
  it("changes the role and leaves the person alone", async () => {
    const entryId = await seedEntry(10);
    const created = await createInline(entryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+49 170 1234567",
    });

    const res = await patchStaff(entryId, created.id, { role: "co_trainer" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      role: "co_trainer",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+49 170 1234567",
      personId: created.personId,
    });
  });

  it("flips the referee-contact toggle in both directions", async () => {
    const entryId = await seedEntry(10);
    const created = await createInline(entryId, { firstName: "Ada", lastName: "Lovelace" });

    const on = await patchStaff(entryId, created.id, { refereeContact: true });
    expect(((await on.json()) as TeamStaffMember).refereeContact).toBe(true);

    const off = await patchStaff(entryId, created.id, { refereeContact: false });
    expect(((await off.json()) as TeamStaffMember).refereeContact).toBe(false);
  });

  it("keeps the flag per team, so one coach can be the contact for one of two", async () => {
    const first = await seedEntry(10);
    const second = await seedEntry(11);
    const personId = await seedPerson();
    const a = await createStaff(first, { personId, role: "trainer" });
    const b = await createStaff(second, { personId, role: "trainer" });

    await patchStaff(first, a.id, { refereeContact: true });

    const [onSecond] = (await (await app.request(`/teams/${second}/staff`)).json()) as
      TeamStaffMember[];
    expect(onSecond?.id).toBe(b.id);
    expect(onSecond?.refereeContact).toBe(false);
  });

  it("rejects the person's own fields — they belong to the person", async () => {
    const entryId = await seedEntry(10);
    const created = await createInline(entryId, { firstName: "Ada", lastName: "Lovelace" });

    const res = await patchStaff(entryId, created.id, { lastName: "Byron" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("404s when the assignment belongs to a different entry", async () => {
    const mine = await seedEntry(10);
    const theirs = await seedEntry(20);
    const created = await createInline(theirs, { firstName: "Ben", lastName: "Theirs" });

    const res = await patchStaff(mine, created.id, { role: "co_trainer" });

    expect(res.status).toBe(404);
    const [row] = await ctx.db.select().from(teamStaff);
    expect(row!.role).toBe("trainer");
  });

  it("rejects an unknown field", async () => {
    const entryId = await seedEntry(10);
    const created = await createInline(entryId, { firstName: "Ada", lastName: "Lovelace" });
    const res = await patchStaff(entryId, created.id, { photoFilename: "x.jpg" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /teams/:id/staff/:staffId", () => {
  it("removes the assignment and leaves the person in the pool", async () => {
    const entryId = await seedEntry(10);
    const created = await createInline(entryId, { firstName: "Ada", lastName: "Lovelace" });

    const res = await app.request(`/teams/${entryId}/staff/${created.id}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect(await ctx.db.select().from(teamStaff)).toEqual([]);
    expect(await ctx.db.select().from(staffPeople)).toHaveLength(1);
  });

  it("leaves the person's other team untouched", async () => {
    const first = await seedEntry(10);
    const second = await seedEntry(11);
    const personId = await seedPerson();
    const a = await createStaff(first, { personId, role: "trainer" });
    await createStaff(second, { personId, role: "co_trainer" });

    await app.request(`/teams/${first}/staff/${a.id}`, { method: "DELETE" });

    const remaining = await ctx.db.select().from(teamStaff);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.teamEntryId).toBe(second);
  });

  it("404s for an assignment of a different entry and leaves the row alone", async () => {
    const mine = await seedEntry(10);
    const theirs = await seedEntry(20);
    const created = await createInline(theirs, { firstName: "Ben", lastName: "Theirs" });

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
  it("deleting the team entry deletes its assignments, not the people", async () => {
    const entryId = await seedEntry(10);
    await createInline(entryId, { firstName: "Ada", lastName: "Lovelace" });

    await ctx.db.delete(teamEntries).where(eq(teamEntries.id, entryId));

    expect(await ctx.db.select().from(teamStaff)).toEqual([]);
    expect(await ctx.db.select().from(staffPeople)).toHaveLength(1);
  });

  // The FK is ON DELETE restrict, so the 409 the delete route answers is not
  // the only thing standing between a raw DELETE and an empty staff block.
  it("refuses to delete a person a team is still attached to", async () => {
    const entryId = await seedEntry(10);
    const created = await createInline(entryId, { firstName: "Ada", lastName: "Lovelace" });

    await expect(
      ctx.db.delete(staffPeople).where(eq(staffPeople.id, created.personId)),
    ).rejects.toThrow();
    expect(await ctx.db.select().from(teamStaff)).toHaveLength(1);
  });
});

describe("permission gating", () => {
  it("lets team:view read the staff list but not write it", async () => {
    const entryId = await seedEntry(10);
    const personId = await seedPerson();
    grantOnly("team:view");

    expect((await app.request(`/teams/${entryId}/staff`)).status).toBe(200);
    expect((await postStaff(entryId, { personId, role: "trainer" })).status).toBe(403);
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

describe("site rebuild dispatch", () => {
  /** The Website reads coaches from `/public/teams` at build time (issue #314). */
  it("fires exactly one dispatch per successful assignment mutation", async () => {
    const entryId = await seedEntry(40);

    const created = await createInline(entryId, { firstName: "Emily", lastName: "Gust" });
    expect(mocks.dispatchSiteRebuild).toHaveBeenCalledTimes(1);

    await patchStaff(entryId, created.id, { role: "co_trainer" });
    expect(mocks.dispatchSiteRebuild).toHaveBeenCalledTimes(2);

    await app.request(`/teams/${entryId}/staff/${created.id}`, { method: "DELETE" });
    expect(mocks.dispatchSiteRebuild).toHaveBeenCalledTimes(3);
  });

  it("fires no dispatch when a mutation changes nothing", async () => {
    const entryId = await seedEntry(41);
    const foreignEntryId = await seedEntry(42, { isOwnClub: false });

    await postStaff(foreignEntryId, {
      person: { firstName: "Emily", lastName: "Gust" },
      role: "trainer",
    });
    await patchStaff(entryId, 9_999, { role: "co_trainer" });
    await app.request(`/teams/${entryId}/staff/9999`, { method: "DELETE" });

    expect(mocks.dispatchSiteRebuild).not.toHaveBeenCalled();
  });

  it("reads a staff list without dispatching", async () => {
    const entryId = await seedEntry(43);
    await app.request(`/teams/${entryId}/staff`);
    expect(mocks.dispatchSiteRebuild).not.toHaveBeenCalled();
  });
});
