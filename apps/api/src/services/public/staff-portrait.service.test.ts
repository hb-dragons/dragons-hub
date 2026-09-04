import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mocks (hoisted before imports) ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

const gcs = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
}));

vi.mock("../social/gcs-storage.service", () => ({
  uploadToGcs: vi.fn(),
  downloadFromGcs: async (path: string) => {
    const stored = gcs.objects.get(path);
    if (!stored) throw new Error(`no object at ${path}`);
    return stored;
  },
  deleteFromGcs: vi.fn(),
}));

// --- Imports (after mocks) ---

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { getPublicStaffPortrait } from "./staff-portrait.service";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  gcs.objects.clear();
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function seedStaff(opts: {
  own: boolean;
  permanentId: number;
  photoFilename?: string | null;
}): Promise<number> {
  const season = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ('2026/27', 'active') RETURNING id`,
  );
  const team = await ctx.client.query<{ id: number }>(
    `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id, is_own_club)
     VALUES ($1, $1, $1, 'Team', 100, $2) RETURNING id`,
    [opts.permanentId, opts.own],
  );
  const entry = await ctx.client.query<{ id: number }>(
    `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`,
    [team.rows[0]!.id, season.rows[0]!.id],
  );
  const person = await ctx.client.query<{ id: number }>(
    `INSERT INTO staff_people (first_name, last_name, photo_filename)
     VALUES ('Emily', 'Gust', $1) RETURNING id`,
    [opts.photoFilename ?? null],
  );
  const staff = await ctx.client.query<{ id: number }>(
    `INSERT INTO team_staff (team_entry_id, person_id, role)
     VALUES ($1, $2, 'trainer') RETURNING id`,
    [entry.rows[0]!.id, person.rows[0]!.id],
  );
  return staff.rows[0]!.id;
}

/** A second own-club entry the same person is attached to. */
async function seedSecondEntryFor(assignmentId: number, permanentId: number): Promise<number> {
  const season = await ctx.client.query<{ id: number }>(
    `SELECT id FROM seasons LIMIT 1`,
  );
  const team = await ctx.client.query<{ id: number }>(
    `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id, is_own_club)
     VALUES ($1, $1, $1, 'Team 2', 100, true) RETURNING id`,
    [permanentId],
  );
  const entry = await ctx.client.query<{ id: number }>(
    `INSERT INTO team_entries (team_id, season_id) VALUES ($1, $2) RETURNING id`,
    [team.rows[0]!.id, season.rows[0]!.id],
  );
  const second = await ctx.client.query<{ id: number }>(
    `INSERT INTO team_staff (team_entry_id, person_id, role)
     SELECT $1, person_id, 'co_trainer' FROM team_staff WHERE id = $2 RETURNING id`,
    [entry.rows[0]!.id, assignmentId],
  );
  return second.rows[0]!.id;
}

describe("getPublicStaffPortrait", () => {
  it("serves the stored object of an own-club staff member", async () => {
    const staffId = await seedStaff({ own: true, permanentId: 8000, photoFilename: "a.webp" });
    gcs.objects.set("team-staff-photos/a.webp", Buffer.from([9, 9]));

    expect(await getPublicStaffPortrait(staffId)).toEqual({
      buffer: Buffer.from([9, 9]),
      contentType: "image/webp",
    });
  });

  it("returns null for a member without a portrait", async () => {
    const staffId = await seedStaff({ own: true, permanentId: 8001 });

    expect(await getPublicStaffPortrait(staffId)).toBeNull();
  });

  it("returns null for a staff row on a foreign-club entry", async () => {
    const staffId = await seedStaff({ own: false, permanentId: 8002, photoFilename: "a.webp" });
    gcs.objects.set("team-staff-photos/a.webp", Buffer.from([9, 9]));

    expect(await getPublicStaffPortrait(staffId)).toBeNull();
  });

  it("serves the same object through both assignments of one person", async () => {
    const first = await seedStaff({ own: true, permanentId: 8003, photoFilename: "a.webp" });
    const second = await seedSecondEntryFor(first, 8004);
    gcs.objects.set("team-staff-photos/a.webp", Buffer.from([9, 9]));

    expect(await getPublicStaffPortrait(second)).toEqual(await getPublicStaffPortrait(first));
  });

  it("returns null for an unknown staff id", async () => {
    expect(await getPublicStaffPortrait(999_999)).toBeNull();
  });
});
