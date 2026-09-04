import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import type { AppEnv } from "../../types";
import type { StaffPerson, StaffPersonWithAssignments } from "@dragons/shared";

// --- Mocks (hoisted before imports) ---
//
// Only the session, the permission check and the bucket are stubbed. drizzle,
// the schema and the services run for real against PGlite; sharp is left alone,
// so the uploads below are decoded and downscaled as they would be in
// production and only the bytes' destination is a double.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  dispatchSiteRebuild: vi.fn(),
  getSession: vi.fn(),
  userHasPermission: vi.fn(),
}));

const gcs = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  uploadToGcs: vi.fn(),
  downloadFromGcs: vi.fn(),
  deleteFromGcs: vi.fn(),
}));

vi.mock("../../services/social/gcs-storage.service", () => ({
  uploadToGcs: (path: string, buffer: Buffer, contentType: string) => {
    gcs.uploadToGcs(path, buffer, contentType);
    gcs.objects.set(path, buffer);
    return Promise.resolve();
  },
  downloadFromGcs: (path: string) => {
    gcs.downloadFromGcs(path);
    const stored = gcs.objects.get(path);
    return stored ? Promise.resolve(stored) : Promise.reject(new Error(`No such object: ${path}`));
  },
  deleteFromGcs: (path: string) => {
    gcs.deleteFromGcs(path);
    gcs.objects.delete(path);
    return Promise.resolve();
  },
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

import { staffPeopleRoutes } from "./staff-people.routes";
import { teamStaffRoutes } from "./team-staff.routes";
import { errorHandler } from "../../middleware/error";
import { seasons, teams, teamEntries, teamStaff, staffPeople } from "@dragons/db/schema";
import { invalidateActiveSeasonCache } from "../../services/admin/season.service";
import sharp from "sharp";
import { MAX_PORTRAIT_BYTES } from "../../services/admin/team-staff-photo.service";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", staffPeopleRoutes);
// Assignments are made through the team-scoped routes, so the pool's
// "which teams is this person on" answers are built the way an admin builds
// them rather than by writing `team_staff` rows behind the service's back.
app.route("/", teamStaffRoutes);

/**
 * Typed as the shared interface, so `tsc` refuses to compile this file if
 * `StaffPerson` grows, loses or renames a field.
 */
const personShape: StaffPerson = {
  id: 0,
  firstName: "",
  lastName: "",
  phone: null,
  email: null,
  licence: null,
  photoUrl: null,
};

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  invalidateActiveSeasonCache();
  vi.clearAllMocks();
  gcs.objects.clear();
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

async function seedActiveSeason(): Promise<number> {
  const [season] = await ctx.db
    .insert(seasons)
    .values({ name: "2026/27", status: "active" })
    .returning({ id: seasons.id });
  invalidateActiveSeasonCache();
  return season!.id;
}

async function seedEntry(
  seasonId: number,
  apiTeamPermanentId: number,
  name = `Team ${apiTeamPermanentId}`,
): Promise<number> {
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
    .values({ teamId: team!.id, seasonId })
    .returning({ id: teamEntries.id });
  return entry!.id;
}

function postPerson(body: unknown) {
  return app.request("/staff-people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchPerson(id: number, body: unknown) {
  return app.request(`/staff-people/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postPhoto(id: number, file: File) {
  const form = new FormData();
  form.set("file", file);
  return app.request(`/staff-people/${id}/photo`, { method: "POST", body: form });
}

async function createPerson(body: Record<string, unknown> = {}): Promise<StaffPerson> {
  const res = await postPerson({ firstName: "Ada", lastName: "Lovelace", ...body });
  expect(res.status).toBe(201);
  return (await res.json()) as StaffPerson;
}

async function listPeople(query = ""): Promise<StaffPersonWithAssignments[]> {
  const res = await app.request(`/staff-people${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as StaffPersonWithAssignments[];
}

async function attach(
  entryId: number,
  personId: number,
  role: "trainer" | "co_trainer" = "trainer",
): Promise<number> {
  const res = await app.request(`/teams/${entryId}/staff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personId, role }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: number }).id;
}

/** A real encoded image, so sharp decodes and downscales it the way it would in production. */
async function imageFile(
  format: "png" | "jpeg",
  type: string,
  name: string,
  width = 800,
  height = 800,
): Promise<File> {
  const bytes = await sharp({
    create: { width, height, channels: 3, background: { r: 220, g: 40, b: 40 } },
  })
    .toFormat(format)
    .toBuffer();
  return new File([bytes], name, { type });
}

function pngFile(width = 800, height = 800): Promise<File> {
  return imageFile("png", "image/png", "portrait.png", width, height);
}

/** The object name a person's `photoUrl` points at. */
function storedObject(person: StaffPerson): string {
  return new URL(`https://x${person.photoUrl!}`).searchParams.get("v")!;
}

describe("POST /staff-people", () => {
  it("creates a person and returns it in the shared shape", async () => {
    const res = await postPerson({
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as StaffPerson;
    expect(Object.keys(body).sort()).toEqual(Object.keys(personShape).sort());
    expect(body).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
      photoUrl: null,
    });
  });

  it("defaults the optional fields", async () => {
    expect(await createPerson()).toMatchObject({ phone: null, email: null, licence: null });
  });

  it("rejects a body with no last name", async () => {
    const res = await postPerson({ firstName: "Ada" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an email that is not an address", async () => {
    const res = await postPerson({ firstName: "Ada", lastName: "Lovelace", email: "nope" });
    expect(res.status).toBe(400);
  });
});

describe("GET /staff-people", () => {
  it("lists the pool alphabetically with each person's teams this season", async () => {
    const seasonId = await seedActiveSeason();
    const u16 = await seedEntry(seasonId, 10, "Dragons U16");
    const u18 = await seedEntry(seasonId, 11, "Dragons U18");
    const ada = await createPerson({ firstName: "Ada", lastName: "Lovelace" });
    const ben = await createPerson({ firstName: "Ben", lastName: "Byron" });
    const assignment = await attach(u16, ada.id);
    await attach(u18, ada.id, "co_trainer");

    const people = await listPeople();

    expect(people.map((p) => p.lastName)).toEqual(["Byron", "Lovelace"]);
    const listedAda = people.find((p) => p.id === ada.id);
    expect(listedAda?.assignments).toEqual([
      {
        id: assignment,
        teamEntryId: u16,
        teamName: "Dragons U16",
        role: "trainer",
        refereeContact: false,
      },
      {
        id: expect.any(Number),
        teamEntryId: u18,
        teamName: "Dragons U18",
        role: "co_trainer",
        refereeContact: false,
      },
    ]);
    expect(people.find((p) => p.id === ben.id)?.assignments).toEqual([]);
  });

  it("matches a fragment of either name", async () => {
    await createPerson({ firstName: "Ada", lastName: "Lovelace" });
    await createPerson({ firstName: "Ben", lastName: "Byron" });

    expect((await listPeople("?q=lace")).map((p) => p.lastName)).toEqual(["Lovelace"]);
    expect((await listPeople("?q=ben")).map((p) => p.lastName)).toEqual(["Byron"]);
    expect(await listPeople("?q=zzz")).toEqual([]);
  });

  // Typing the whole name is what an admin does first, and it can be typed
  // either way round — the list itself shows "Lovelace, Ada".
  it("matches the full name in both orders", async () => {
    await createPerson({ firstName: "Ada", lastName: "Lovelace" });

    expect((await listPeople("?q=Ada Lovelace")).map((p) => p.lastName)).toEqual([
      "Lovelace",
    ]);
    expect((await listPeople("?q=Lovelace, Ada")).map((p) => p.lastName)).toEqual([
      "Lovelace",
    ]);
    expect(await listPeople("?q=Ada Byron")).toEqual([]);
  });

  it("leaves out assignments from a season that is not the active one", async () => {
    const active = await seedActiveSeason();
    const [old] = await ctx.db
      .insert(seasons)
      .values({ name: "2025/26", status: "archived" })
      .returning({ id: seasons.id });
    const oldEntry = await seedEntry(old!.id, 12, "Dragons U14");
    await seedEntry(active, 13);
    const ada = await createPerson();
    await attach(oldEntry, ada.id);

    expect((await listPeople())[0]?.assignments).toEqual([]);
  });

  it("lists the pool with no active season at all", async () => {
    await createPerson();
    expect((await listPeople())[0]?.assignments).toEqual([]);
  });
});

describe("PATCH /staff-people/:id", () => {
  it("changes only the fields the patch names", async () => {
    const person = await createPerson({ phone: "+49 170 1234567", licence: "C-Lizenz" });

    const res = await patchPerson(person.id, { lastName: "Byron" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      firstName: "Ada",
      lastName: "Byron",
      phone: "+49 170 1234567",
      licence: "C-Lizenz",
    });
  });

  it("clears a contact field with an empty string", async () => {
    const person = await createPerson({ phone: "+49 170 1234567", email: "ada@example.de" });

    const res = await patchPerson(person.id, { phone: "", email: "" });

    expect(await res.json()).toMatchObject({ phone: null, email: null });
  });

  it("shows the correction on every team the person is attached to", async () => {
    const seasonId = await seedActiveSeason();
    const u16 = await seedEntry(seasonId, 10, "Dragons U16");
    const u18 = await seedEntry(seasonId, 11, "Dragons U18");
    const person = await createPerson({ phone: "+49 111" });
    await attach(u16, person.id);
    await attach(u18, person.id);

    await patchPerson(person.id, { phone: "+49 222" });

    for (const entry of [u16, u18]) {
      const [member] = (await (await app.request(`/teams/${entry}/staff`)).json()) as {
        phone: string;
      }[];
      expect(member?.phone).toBe("+49 222");
    }
  });

  it("404s for a person the club does not know", async () => {
    const res = await patchPerson(4242, { lastName: "Byron" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an unknown field", async () => {
    const person = await createPerson();
    expect((await patchPerson(person.id, { photoFilename: "x.jpg" })).status).toBe(400);
  });
});

describe("DELETE /staff-people/:id", () => {
  it("deletes a person nobody is attached to", async () => {
    const person = await createPerson();

    const res = await app.request(`/staff-people/${person.id}`, { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await ctx.db.select().from(staffPeople)).toEqual([]);
  });

  it("409s while the person is still attached to a team", async () => {
    const seasonId = await seedActiveSeason();
    const entry = await seedEntry(seasonId, 10);
    const person = await createPerson();
    await attach(entry, person.id);

    const res = await app.request(`/staff-people/${person.id}`, { method: "DELETE" });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "STAFF_PERSON_ASSIGNED" });
    expect(await ctx.db.select().from(staffPeople)).toHaveLength(1);
    expect(await ctx.db.select().from(teamStaff)).toHaveLength(1);
  });

  it("deletes the portrait along with the person", async () => {
    const person = await createPerson();
    const withPhoto = (await (await postPhoto(person.id, await pngFile())).json()) as StaffPerson;

    await app.request(`/staff-people/${person.id}`, { method: "DELETE" });

    expect(gcs.deleteFromGcs).toHaveBeenCalledWith(
      `team-staff-photos/${storedObject(withPhoto)}`,
    );
    expect(gcs.objects.size).toBe(0);
  });

  it("404s for an unknown person", async () => {
    expect((await app.request("/staff-people/4242", { method: "DELETE" })).status).toBe(404);
  });
});

describe("POST /staff-people/:id/photo", () => {
  it("stores a portrait and answers with the person pointing at it", async () => {
    const person = await createPerson();

    const res = await postPhoto(person.id, await pngFile(1200, 900));

    expect(res.status).toBe(200);
    const body = (await res.json()) as StaffPerson;
    expect(body.photoUrl).toMatch(
      new RegExp(`^/admin/staff-people/${person.id}/photo\\?v=[0-9a-f-]{36}\\.png$`),
    );
    const [path, buffer, contentType] = gcs.uploadToGcs.mock.calls[0]!;
    expect(path).toMatch(/^team-staff-photos\//);
    expect(contentType).toBe("image/png");
    // Stored downscaled, not at the 1200px the upload arrived at.
    expect((await sharp(buffer as Buffer).metadata()).width).toBe(512);
  });

  it("puts one portrait on every team the person trains", async () => {
    const seasonId = await seedActiveSeason();
    const u16 = await seedEntry(seasonId, 10);
    const u18 = await seedEntry(seasonId, 11);
    const person = await createPerson();
    await attach(u16, person.id);
    await attach(u18, person.id);

    const uploaded = (await (await postPhoto(person.id, await pngFile())).json()) as StaffPerson;

    for (const entry of [u16, u18]) {
      const [member] = (await (await app.request(`/teams/${entry}/staff`)).json()) as {
        photoUrl: string;
      }[];
      expect(member?.photoUrl).toBe(uploaded.photoUrl);
    }
    expect(gcs.objects.size).toBe(1);
  });

  it("deletes the object a replacement portrait supersedes", async () => {
    const person = await createPerson();
    const first = (await (await postPhoto(person.id, await pngFile())).json()) as StaffPerson;

    const second = (await (
      await postPhoto(person.id, await pngFile(300, 300))
    ).json()) as StaffPerson;

    expect(second.photoUrl).not.toBe(first.photoUrl);
    expect(gcs.deleteFromGcs).toHaveBeenCalledWith(`team-staff-photos/${storedObject(first)}`);
    expect(gcs.objects.size).toBe(1);
  });

  it("rejects a file that is not one of the allowed image types", async () => {
    const person = await createPerson();

    const res = await postPhoto(
      person.id,
      new File([Buffer.from("not an image")], "cv.txt", { type: "text/plain" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "Invalid request data",
      code: "VALIDATION_ERROR",
      details: [{ path: "file" }],
    });
    expect(gcs.uploadToGcs).not.toHaveBeenCalled();
  });

  it("rejects bytes that only claim to be an image", async () => {
    const person = await createPerson();

    const res = await postPhoto(
      person.id,
      new File([Buffer.from("still not an image")], "x.png", { type: "image/png" }),
    );

    expect(res.status).toBe(400);
    expect(gcs.uploadToGcs).not.toHaveBeenCalled();
  });

  it("rejects a file over the size bound", async () => {
    const person = await createPerson();
    const oversized = new File([Buffer.alloc(MAX_PORTRAIT_BYTES + 1)], "big.png", {
      type: "image/png",
    });

    const res = await postPhoto(person.id, oversized);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a request with no file field", async () => {
    const person = await createPerson();
    const form = new FormData();
    form.set("notafile", "x");

    const res = await app.request(`/staff-people/${person.id}/photo`, {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(400);
  });

  it("404s for a person the club does not know, storing nothing", async () => {
    const res = await postPhoto(4242, await pngFile());

    expect(res.status).toBe(404);
    expect(gcs.objects.size).toBe(0);
  });

  it("needs team:manage, not team:view", async () => {
    const person = await createPerson();
    grantOnly("team:view");

    expect((await postPhoto(person.id, await pngFile())).status).toBe(403);
  });
});

describe("GET /staff-people/:id/photo", () => {
  it("serves the stored bytes with the type they were stored as", async () => {
    const person = await createPerson();
    await postPhoto(person.id, await pngFile());

    const res = await app.request(`/staff-people/${person.id}/photo`);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(res.headers.get("Content-Length")).toBe(String(bytes.length));
    expect((await sharp(bytes).metadata()).format).toBe("png");
  });

  it("serves a jpeg upload as image/jpeg", async () => {
    const person = await createPerson();
    await postPhoto(person.id, await imageFile("jpeg", "image/jpeg", "p.jpg"));

    const res = await app.request(`/staff-people/${person.id}/photo`);

    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("404s when the person has no portrait", async () => {
    const person = await createPerson();

    const res = await app.request(`/staff-people/${person.id}/photo`);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("404s for an unknown person", async () => {
    expect((await app.request("/staff-people/4242/photo")).status).toBe(404);
  });

  it("is readable with team:view alone", async () => {
    const person = await createPerson();
    await postPhoto(person.id, await pngFile());
    grantOnly("team:view");

    expect((await app.request(`/staff-people/${person.id}/photo`)).status).toBe(200);
  });
});

describe("permission gating", () => {
  it("lets team:view read the pool but not write it", async () => {
    const person = await createPerson();
    grantOnly("team:view");

    expect((await app.request("/staff-people")).status).toBe(200);
    expect((await postPerson({ firstName: "Ben", lastName: "Byron" })).status).toBe(403);
    expect((await patchPerson(person.id, { lastName: "Byron" })).status).toBe(403);
    expect(
      (await app.request(`/staff-people/${person.id}`, { method: "DELETE" })).status,
    ).toBe(403);
  });

  it("rejects a caller with neither permission", async () => {
    grantOnly();
    expect((await app.request("/staff-people")).status).toBe(403);
  });

  it("rejects an unauthenticated caller", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await app.request("/staff-people")).status).toBe(401);
  });
});

describe("site rebuild dispatch", () => {
  /** The Website renders the person's name, licence and portrait (issue #314). */
  it("fires a dispatch for an edit and for a portrait, not for a create or a read", async () => {
    const person = await createPerson();
    expect(mocks.dispatchSiteRebuild).not.toHaveBeenCalled();

    await patchPerson(person.id, { licence: "C-Lizenz" });
    expect(mocks.dispatchSiteRebuild).toHaveBeenCalledTimes(1);

    await postPhoto(person.id, await pngFile());
    expect(mocks.dispatchSiteRebuild).toHaveBeenCalledTimes(2);

    await app.request("/staff-people");
    expect(mocks.dispatchSiteRebuild).toHaveBeenCalledTimes(2);
  });

  it("fires no dispatch for a contact change the Website never renders", async () => {
    const person = await createPerson();

    await patchPerson(person.id, { phone: "+49 170 9999999", email: "ada@example.de" });

    expect(mocks.dispatchSiteRebuild).not.toHaveBeenCalled();
  });

  it("fires no dispatch when a mutation changes nothing", async () => {
    await patchPerson(4242, { licence: "C-Lizenz" });
    await postPhoto(4242, await pngFile());

    expect(mocks.dispatchSiteRebuild).not.toHaveBeenCalled();
  });
});
