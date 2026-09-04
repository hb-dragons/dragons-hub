import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mocks (hoisted before imports) ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

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

// --- Imports (after mocks) ---

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { listPublicTeams } from "./team-list.service";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

/** Task 1's helpers (team-entries.migration.test.ts) — season/team fixtures. */
async function seedSeason(name: string, status: string): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ($1, $2) RETURNING id`, [name, status]);
  return r.rows[0]!.id;
}

async function seedTeam(permanentId: number, name: string, own = true): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id, is_own_club)
     VALUES ($1, $1, $1, $2, 100, $3) RETURNING id`,
    [permanentId, name, own]);
  return r.rows[0]!.id;
}

async function seedEntry(teamId: number, seasonId: number, displayOrder = 0): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO team_entries (team_id, season_id, display_order) VALUES ($1, $2, $3) RETURNING id`,
    [teamId, seasonId, displayOrder],
  );
  return r.rows[0]!.id;
}

async function seedPerson(member: {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  licence?: string | null;
  photoFilename?: string | null;
}): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO staff_people (first_name, last_name, phone, email, licence, photo_filename)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      member.firstName,
      member.lastName,
      member.phone ?? null,
      member.email ?? null,
      member.licence ?? null,
      member.photoFilename ?? null,
    ],
  );
  return r.rows[0]!.id;
}

/** Attaches a person to an entry; creates the person unless one is given. */
async function seedStaff(
  entryId: number,
  member: {
    firstName?: string;
    lastName?: string;
    role: string;
    personId?: number;
    phone?: string | null;
    email?: string | null;
    licence?: string | null;
    photoFilename?: string | null;
  },
): Promise<number> {
  const personId =
    member.personId ??
    (await seedPerson({
      firstName: member.firstName ?? "Given",
      lastName: member.lastName ?? "Name",
      phone: member.phone,
      email: member.email,
      licence: member.licence,
      photoFilename: member.photoFilename,
    }));
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO team_staff (team_entry_id, person_id, role) VALUES ($1, $2, $3) RETURNING id`,
    [entryId, personId, member.role],
  );
  return r.rows[0]!.id;
}

describe("listPublicTeams", () => {
  it("lists own-club teams from the active season's entries with entry-owned fields", async () => {
    const active = await seedSeason("2026/27", "active");
    const squadWith = await seedTeam(7000, "Dragons U16"); // has an entry
    await seedTeam(7001, "Dragons Retired"); // own club, no entry this season
    const rival = await seedTeam(7002, "Rivals", false); // never entries
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, custom_name, badge_color, display_order)
       VALUES ($1, $2, 'U16', 'red', 2)`, [squadWith, active]);

    const rows = await listPublicTeams();

    const ownRows = rows.filter((r) => r.isOwnClub);
    expect(ownRows.map((r) => r.name)).toEqual(["Dragons U16"]); // no-entry squad is not fielded
    expect(ownRows[0]).toMatchObject({ id: squadWith, customName: "U16", badgeColor: "red", displayOrder: 2 });
    const rivalRow = rows.find((r) => r.id === rival); // non-own teams unaffected
    expect(rivalRow).toMatchObject({
      customName: null,
      badgeColor: null,
      estimatedGameDuration: null,
      displayOrder: 0,
    });
  });

  it("orders own-club teams first (by entry displayOrder, then name), then non-own teams by name", async () => {
    const active = await seedSeason("2026/27", "active");
    await seedTeam(1, "Zeta", false);
    const alpha = await seedTeam(2, "Alpha");
    const beta = await seedTeam(3, "Beta");
    // Shares displayOrder with Beta, differing only in name — without this,
    // displayOrder alone already produces the expected array below and the
    // asc(teams.name) tiebreaker is never exercised.
    const aaron = await seedTeam(4, "Aaron");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, display_order) VALUES ($1, $2, $3)`,
      [alpha, active, 2],
    );
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, display_order) VALUES ($1, $2, $3)`,
      [beta, active, 1],
    );
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, display_order) VALUES ($1, $2, $3)`,
      [aaron, active, 1],
    );

    const result = await listPublicTeams();

    expect(result.map((t) => t.name)).toEqual(["Aaron", "Beta", "Alpha", "Zeta"]);
  });

  it("returns an empty array when no teams exist", async () => {
    expect(await listPublicTeams()).toEqual([]);
  });

  // The `PublicTeam` interface in @dragons/api-client is hand-written against
  // this payload (apps/api does not depend on the client, so nothing checks it
  // at compile time). Adding a column to `teams` fails this list first — update
  // both together.
  it("returns exactly the fields the api-client PublicTeam declares", async () => {
    const active = await seedSeason("2026/27", "active");
    await seedEntry(await seedTeam(7200, "Dragons Damen 2"), active);
    await seedTeam(7201, "Rivals", false);

    const [own, other] = await listPublicTeams();

    const shared = [
      "apiTeamPermanentId",
      "badgeColor",
      "clubId",
      "createdAt",
      "customName",
      "dataHash",
      "displayOrder",
      "estimatedGameDuration",
      "id",
      "isOwnClub",
      "name",
      "nameShort",
      "seasonTeamId",
      "teamCompetitionId",
      "updatedAt",
      "verzicht",
    ];
    expect(Object.keys(own ?? {}).sort()).toEqual([...shared, "staff"].sort());
    expect(Object.keys(other ?? {}).sort()).toEqual(shared);
  });

  it("carries the entry's staff on own-club rows, portraits as public paths", async () => {
    const active = await seedSeason("2026/27", "active");
    const squad = await seedTeam(7100, "Dragons Damen 1");
    const entry = await seedEntry(squad, active);
    const withPhoto = await seedStaff(entry, {
      firstName: "Emily",
      lastName: "Gust",
      role: "trainer",
      licence: "C-Lizenz",
      photoFilename: "abc.webp",
    });
    const withoutPhoto = await seedStaff(entry, {
      firstName: "Ben",
      lastName: "Adler",
      role: "co_trainer",
    });

    const [own] = await listPublicTeams();

    expect(own?.staff).toEqual([
      {
        id: withPhoto,
        personId: expect.any(Number),
        firstName: "Emily",
        lastName: "Gust",
        role: "trainer",
        licence: "C-Lizenz",
        photoUrl: `/public/staff/${withPhoto}/photo?v=abc.webp`,
      },
      {
        id: withoutPhoto,
        personId: expect.any(Number),
        firstName: "Ben",
        lastName: "Adler",
        role: "co_trainer",
        licence: null,
        photoUrl: null,
      },
    ]);
  });

  it("sorts staff Trainer first, then by name", async () => {
    const active = await seedSeason("2026/27", "active");
    const entry = await seedEntry(await seedTeam(7101, "Dragons Herren 1"), active);
    await seedStaff(entry, { firstName: "Zoe", lastName: "Adler", role: "co_trainer" });
    await seedStaff(entry, { firstName: "Nina", lastName: "Wolf", role: "trainer" });
    await seedStaff(entry, { firstName: "Anton", lastName: "Wolf", role: "trainer" });

    const [own] = await listPublicTeams();

    expect(own?.staff?.map((s) => s.firstName)).toEqual(["Anton", "Nina", "Zoe"]);
  });

  it("leaves the key off non-own-club rows and never exposes phone or email", async () => {
    const active = await seedSeason("2026/27", "active");
    const entry = await seedEntry(await seedTeam(7102, "Dragons U16"), active);
    await seedStaff(entry, {
      firstName: "Emily",
      lastName: "Gust",
      role: "trainer",
      phone: "+49 170 1234567",
      email: "emily@example.de",
    });
    await seedTeam(7103, "Rivals", false);

    const rows = await listPublicTeams();

    const rival = rows.find((r) => !r.isOwnClub);
    expect(rival).toBeDefined();
    expect(rival && "staff" in rival).toBe(false);
    const payload = JSON.stringify(rows);
    expect(payload).not.toContain("+49 170 1234567");
    expect(payload).not.toContain("emily@example.de");
  });

  it("shows one person's portrait on both teams they train", async () => {
    const active = await seedSeason("2026/27", "active");
    const first = await seedEntry(await seedTeam(7105, "Dragons U16"), active);
    const second = await seedEntry(await seedTeam(7106, "Dragons U18"), active);
    const person = await seedPerson({
      firstName: "Emily",
      lastName: "Gust",
      photoFilename: "abc.webp",
    });
    await seedStaff(first, { role: "trainer", personId: person });
    await seedStaff(second, { role: "co_trainer", personId: person });

    const rows = await listPublicTeams();
    const staff = rows.flatMap((r) => r.staff ?? []);

    expect(staff).toHaveLength(2);
    expect(new Set(staff.map((s) => s.personId))).toEqual(new Set([person]));
    expect(staff[0]?.photoUrl).toBe(`/public/staff/${staff[0]?.id}/photo?v=abc.webp`);
    expect(staff[1]?.photoUrl).toBe(`/public/staff/${staff[1]?.id}/photo?v=abc.webp`);
  });

  it("gives an entry without staff an empty list", async () => {
    const active = await seedSeason("2026/27", "active");
    await seedEntry(await seedTeam(7104, "Dragons U14"), active);

    const [own] = await listPublicTeams();

    expect(own?.staff).toEqual([]);
  });
});
