import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---
//
// Only the session is a double: the route, the real person service, the real
// auth gate and the real database all run, so "a coach patches their number and
// the next referee sees it" is asserted end to end (#315).

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), dispatch: vi.fn() }));

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
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    child: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
  },
}));

vi.mock("../../services/site-rebuild.service", () => ({
  dispatchSiteRebuild: (...args: unknown[]) => mocks.dispatch(...args),
}));

// --- Imports (after mocks) ---

import { meStaffRoutes } from "./staff.routes";
import { errorHandler } from "../../middleware/error";
import { staffPeople, teamStaff, teamEntries, teams, seasons } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { invalidateActiveSeasonCache } from "../../services/admin/season.service";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/me", meStaffRoutes);

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  invalidateActiveSeasonCache();
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

/** Signs the request in as a user linked to `personId` (or to nothing). */
function signedInAs(personId: number | null): void {
  mocks.getSession.mockResolvedValue({
    user: { id: "coach-1", role: "coach", personId },
    session: { id: "sess-coach" },
  });
}

/** The one active season, created on first use. */
async function seedActiveSeason(): Promise<number> {
  const [existing] = await ctx.db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.status, "active"));
  if (existing) return existing.id;
  const [season] = await ctx.db
    .insert(seasons)
    .values({ name: "2026/27", status: "active" })
    .returning({ id: seasons.id });
  invalidateActiveSeasonCache();
  return season!.id;
}

async function seedPerson(): Promise<number> {
  const [person] = await ctx.db
    .insert(staffPeople)
    .values({
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+49 170 0000000",
      email: "ada@example.de",
      licence: "C-Lizenz",
      photoFilename: "portrait.webp",
    })
    .returning({ id: staffPeople.id });
  return person!.id;
}

/** A team entry in the active season, with the person attached to it. */
async function attachToTeam(personId: number, apiTeamPermanentId: number, name: string) {
  const [team] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId,
      seasonTeamId: apiTeamPermanentId * 10,
      teamCompetitionId: apiTeamPermanentId,
      name,
      clubId: 1,
      isOwnClub: true,
    })
    .returning({ id: teams.id });
  const [entry] = await ctx.db
    .insert(teamEntries)
    .values({ teamId: team!.id, seasonId: await seedActiveSeason() })
    .returning({ id: teamEntries.id });
  await ctx.db
    .insert(teamStaff)
    .values({ teamEntryId: entry!.id, personId, role: "trainer", refereeContact: true });
}

function get() {
  return app.request("/me/staff");
}

function patch(body: unknown) {
  return app.request("/me/staff", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /me/staff", () => {
  it("returns the linked person with the teams they are attached to", async () => {
    const personId = await seedPerson();
    await attachToTeam(personId, 16, "Dragons U16");
    signedInAs(personId);

    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: personId,
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+49 170 0000000",
      email: "ada@example.de",
      licence: "C-Lizenz",
    });
    expect(body.assignments).toEqual([
      expect.objectContaining({ teamName: "Dragons U16", role: "trainer" }),
    ]);
  });

  // The portrait is served from an admin-gated route, so a coach could not
  // fetch it — offering the URL would be an image the app can never draw.
  it("does not offer the admin-scoped portrait URL", async () => {
    const personId = await seedPerson();
    signedInAs(personId);

    const body = await (await get()).json();
    expect(body).not.toHaveProperty("photoUrl");
    expect(body.assignments).toEqual([]);
  });

  it("404s for a signed-in user with no staff link", async () => {
    signedInAs(null);

    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("404s when the linked person has been deleted", async () => {
    const personId = await seedPerson();
    await ctx.db.delete(staffPeople).where(eq(staffPeople.id, personId));
    signedInAs(personId);

    expect((await get()).status).toBe(404);
  });

  it("401s without a session", async () => {
    mocks.getSession.mockResolvedValue(null);

    expect((await get()).status).toBe(401);
  });
});

describe("PATCH /me/staff", () => {
  it("writes the three fields the coach owns", async () => {
    const personId = await seedPerson();
    signedInAs(personId);

    const res = await patch({
      phone: "+49 170 9999999",
      email: "ada.new@example.de",
      licence: "B-Lizenz",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      phone: "+49 170 9999999",
      email: "ada.new@example.de",
      licence: "B-Lizenz",
    });

    const [row] = await ctx.db
      .select()
      .from(staffPeople)
      .where(eq(staffPeople.id, personId));
    expect(row).toMatchObject({
      phone: "+49 170 9999999",
      email: "ada.new@example.de",
      licence: "B-Lizenz",
      // Untouched: the club owns the name and the portrait.
      firstName: "Ada",
      photoFilename: "portrait.webp",
    });
  });

  it("clears a field sent empty and leaves an omitted one alone", async () => {
    const personId = await seedPerson();
    signedInAs(personId);

    const res = await patch({ phone: "" });
    expect(res.status).toBe(200);
    const [row] = await ctx.db
      .select()
      .from(staffPeople)
      .where(eq(staffPeople.id, personId));
    expect(row!.phone).toBeNull();
    expect(row!.email).toBe("ada@example.de");
  });

  it("shows the new number on every team the coach trains", async () => {
    const personId = await seedPerson();
    await attachToTeam(personId, 16, "Dragons U16");
    await attachToTeam(personId, 18, "Dragons U18");
    signedInAs(personId);

    await patch({ phone: "+49 170 9999999" });

    const rows = await ctx.db
      .select({ phone: staffPeople.phone })
      .from(teamStaff)
      .innerJoin(staffPeople, eq(teamStaff.personId, staffPeople.id))
      .where(eq(teamStaff.personId, personId));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.phone === "+49 170 9999999")).toBe(true);
  });

  // The Website renders the licence but never a phone number or an email
  // (#314), so only the first of these is worth a rebuild.
  it("rebuilds the website for a licence change and not for a phone one", async () => {
    const personId = await seedPerson();
    signedInAs(personId);

    await patch({ phone: "+49 170 9999999" });
    expect(mocks.dispatch).not.toHaveBeenCalled();

    await patch({ licence: "A-Lizenz" });
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });

  it("rejects a field the club owns with the central 400", async () => {
    const personId = await seedPerson();
    signedInAs(personId);

    const res = await patch({ phone: "+49 170 1", firstName: "Grace" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "Invalid request data",
      code: "VALIDATION_ERROR",
      details: expect.any(Array),
    });

    const [row] = await ctx.db
      .select()
      .from(staffPeople)
      .where(eq(staffPeople.id, personId));
    expect(row).toMatchObject({ firstName: "Ada", phone: "+49 170 0000000" });
  });

  it("rejects a malformed email", async () => {
    signedInAs(await seedPerson());

    expect((await patch({ email: "nope" })).status).toBe(400);
  });

  it("404s for a user with no staff link", async () => {
    signedInAs(null);

    expect((await patch({ phone: "+49 170 1" })).status).toBe(404);
  });

  it("401s without a session", async () => {
    mocks.getSession.mockResolvedValue(null);

    expect((await patch({ phone: "+49 170 1" })).status).toBe(401);
  });
});
