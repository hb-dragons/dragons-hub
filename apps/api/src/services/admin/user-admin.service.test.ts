import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked — the route
// this service was extracted from ran a real UPDATE ... WHERE id = $1 plus a
// referee-existence probe; a stubbed `eq` would make neither predicate
// observable. Everything below runs against a real in-process PGlite Postgres.

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

// --- Imports (after mocks) ---

import { setUserRefereeLink, setUserStaffLink } from "./user-admin.service";
import {
  referees,
  seasons,
  teams,
  teamEntries,
  teamStaff,
  staffPeople,
  user as userTable,
} from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function seedUser(id: string, role: string | null = null): Promise<void> {
  await ctx.db
    .insert(userTable)
    .values({ id, name: id, email: `${id}@example.test`, role });
}

async function seedReferee(apiId: number, lastName: string): Promise<number> {
  const [row] = await ctx.db
    .insert(referees)
    .values({ apiId, firstName: "Ref", lastName })
    .returning({ id: referees.id });
  return row!.id;
}

async function linkOf(id: string): Promise<number | null | undefined> {
  const [row] = await ctx.db
    .select({ refereeId: userTable.refereeId })
    .from(userTable)
    .where(eq(userTable.id, id));
  return row?.refereeId;
}

describe("setUserRefereeLink", () => {
  it("links a referee to a user", async () => {
    await seedUser("u1");
    const refereeId = await seedReferee(9001, "Eins");

    const result = await setUserRefereeLink("u1", refereeId);

    expect(result).toEqual({ id: "u1", refereeId });
    expect(await linkOf("u1")).toBe(refereeId);
  });

  it("unlinks a referee from a user", async () => {
    const refereeId = await seedReferee(9001, "Eins");
    await seedUser("u1");
    await setUserRefereeLink("u1", refereeId);

    const result = await setUserRefereeLink("u1", null);

    expect(result).toEqual({ id: "u1", refereeId: null });
    expect(await linkOf("u1")).toBeNull();
  });

  // The user genuinely exists here — seeded before the call — so this proves
  // the referee-existence guard fires on its own, not merely because the user
  // was also missing. The route historically validated the referee before
  // touching the user row at all (unconditionally, whenever refereeId was
  // non-null), and this preserves that order.
  it("throws REFEREE_NOT_FOUND when linking an unknown referee", async () => {
    await seedUser("u1");

    await expect(setUserRefereeLink("u1", 999999)).rejects.toMatchObject({
      code: "REFEREE_NOT_FOUND",
    });
  });

  // refereeId is null here, so the referee-existence guard never runs — this
  // isolates the user-not-found guard on an otherwise-empty database.
  it("throws USER_NOT_FOUND when the user does not exist", async () => {
    await expect(setUserRefereeLink("ghost", null)).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
    });
  });

  it("changes nothing when the referee does not exist", async () => {
    await seedUser("u1");

    await expect(setUserRefereeLink("u1", 999999)).rejects.toThrow();

    expect(await linkOf("u1")).toBeNull();
  });

  it("changes nothing when the user does not exist", async () => {
    const refereeId = await seedReferee(9001, "Eins");
    await seedUser("other");

    await expect(setUserRefereeLink("ghost", refereeId)).rejects.toThrow();

    expect(await linkOf("other")).toBeNull();
  });

  // An UPDATE that lost its `WHERE id = ...` would overwrite user-2 as well
  // (or fail the unique constraint on referee_id) — the previous mocked route
  // suite could not see either.
  it("relinks only the addressed account, leaving other users untouched", async () => {
    await seedUser("u1");
    await seedUser("u2");
    const refA = await seedReferee(9001, "Eins");
    const refB = await seedReferee(9002, "Zwei");
    await setUserRefereeLink("u2", refB);

    await setUserRefereeLink("u1", refA);

    expect(await linkOf("u1")).toBe(refA);
    expect(await linkOf("u2")).toBe(refB);
  });
});

/** One season -> squad -> entry chain, for the assignment a person can hold. */
async function seedTeamEntry(): Promise<number> {
  const [season] = await ctx.db
    .insert(seasons)
    .values({ name: "2025/26", status: "active" })
    .returning({ id: seasons.id });
  const [team] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId: 7001,
      seasonTeamId: 70010,
      teamCompetitionId: 7001,
      name: "Dragons 1",
      clubId: 1,
      isOwnClub: true,
    })
    .returning({ id: teams.id });
  const [entry] = await ctx.db
    .insert(teamEntries)
    .values({ seasonId: season!.id, teamId: team!.id })
    .returning({ id: teamEntries.id });
  return entry!.id;
}

async function seedPerson(lastName: string): Promise<number> {
  const [row] = await ctx.db
    .insert(staffPeople)
    .values({ firstName: "Coach", lastName })
    .returning({ id: staffPeople.id });
  return row!.id;
}

async function userRow(id: string) {
  const [row] = await ctx.db
    .select({ personId: userTable.personId, role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, id));
  return row;
}

describe("setUserStaffLink", () => {
  it("links a staff record to a user", async () => {
    await seedUser("u1");
    const personId = await seedPerson("Eins");

    const result = await setUserStaffLink("u1", personId, false);

    expect(result).toEqual({ id: "u1", personId, role: null });
    expect(await userRow("u1")).toEqual({ personId, role: null });
  });

  it("grants the coach role when the flag is set", async () => {
    await seedUser("u1");
    const personId = await seedPerson("Eins");

    const result = await setUserStaffLink("u1", personId, true);

    expect(result).toEqual({ id: "u1", personId, role: "coach" });
  });

  it("appends coach to the existing roles rather than replacing them", async () => {
    await seedUser("u1", "teamManager");
    const personId = await seedPerson("Eins");

    await setUserStaffLink("u1", personId, true);

    expect((await userRow("u1"))?.role).toBe("teamManager,coach");
  });

  it("does not duplicate the coach role when the user already has it", async () => {
    await seedUser("u1", "coach");
    const personId = await seedPerson("Eins");

    await setUserStaffLink("u1", personId, true);

    expect((await userRow("u1"))?.role).toBe("coach");
  });

  it("leaves roles alone when the flag is not set", async () => {
    await seedUser("u1", "teamManager");
    const personId = await seedPerson("Eins");

    await setUserStaffLink("u1", personId, false);

    expect((await userRow("u1"))?.role).toBe("teamManager");
  });

  it("unlinks and leaves every role untouched", async () => {
    await seedUser("u1");
    const personId = await seedPerson("Eins");
    await setUserStaffLink("u1", personId, true);

    const result = await setUserStaffLink("u1", null, false);

    expect(result).toEqual({ id: "u1", personId: null, role: "coach" });
    expect(await userRow("u1")).toEqual({ personId: null, role: "coach" });
  });

  // The grant flag only ever adds a role; unlinking never revokes one, so a
  // `true` flag on an unlink is a no-op rather than a second grant path.
  it("ignores the grant flag on an unlink", async () => {
    await seedUser("u1");

    await setUserStaffLink("u1", null, true);

    expect((await userRow("u1"))?.role).toBeNull();
  });

  it("throws STAFF_NOT_FOUND when linking an unknown staff record", async () => {
    await seedUser("u1");

    await expect(setUserStaffLink("u1", 999999, false)).rejects.toMatchObject({
      code: "STAFF_NOT_FOUND",
    });
  });

  it("throws USER_NOT_FOUND when the user does not exist", async () => {
    await expect(setUserStaffLink("ghost", null, false)).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
    });
  });

  it("throws STAFF_ALREADY_LINKED when another account already holds the link", async () => {
    const personId = await seedPerson("Eins");
    await seedUser("u1");
    await seedUser("u2");
    await setUserStaffLink("u2", personId, false);

    await expect(setUserStaffLink("u1", personId, false)).rejects.toMatchObject({
      code: "STAFF_ALREADY_LINKED",
    });
    expect((await userRow("u1"))?.personId).toBeNull();
    expect((await userRow("u2"))?.personId).toBe(personId);
  });

  // The holder check is a read followed by a write, so two admins linking the
  // same staff record at once both pass it and the unique constraint settles
  // it. Whichever way the two calls interleave, the loser must see the same
  // 409 as a caller who lost the up-front check.
  it("answers 409 for the loser of two concurrent links on one staff record", async () => {
    const personId = await seedPerson("Eins");
    await seedUser("u1");
    await seedUser("u2");

    const results = await Promise.allSettled([
      setUserStaffLink("u1", personId, false),
      setUserStaffLink("u2", personId, false),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "STAFF_ALREADY_LINKED" });
  });

  // Re-sending the same link for the account that already holds it must not
  // trip the conflict guard — the dialog can submit twice.
  it("is idempotent for the account that already holds the link", async () => {
    const personId = await seedPerson("Eins");
    await seedUser("u1");
    await setUserStaffLink("u1", personId, false);

    const result = await setUserStaffLink("u1", personId, true);

    expect(result).toEqual({ id: "u1", personId, role: "coach" });
  });

  it("changes nothing when the staff record does not exist", async () => {
    await seedUser("u1", "teamManager");

    await expect(setUserStaffLink("u1", 999999, true)).rejects.toThrow();

    expect(await userRow("u1")).toEqual({ personId: null, role: "teamManager" });
  });

  it("relinks only the addressed account", async () => {
    const personA = await seedPerson("Eins");
    const personB = await seedPerson("Zwei");
    await seedUser("u1");
    await seedUser("u2");
    await setUserStaffLink("u2", personB, false);

    await setUserStaffLink("u1", personA, false);

    expect((await userRow("u1"))?.personId).toBe(personA);
    expect((await userRow("u2"))?.personId).toBe(personB);
  });

  // The FK is ON DELETE SET NULL: removing the person drops the link and
  // leaves the account — and the coach role it was granted — in place.
  it("nulls the link when the person is deleted", async () => {
    await seedUser("u1");
    const personId = await seedPerson("Eins");
    await setUserStaffLink("u1", personId, true);

    await ctx.db.delete(staffPeople).where(eq(staffPeople.id, personId));

    expect(await userRow("u1")).toEqual({ personId: null, role: "coach" });
  });

  // The link is to the human, not to one team's assignment (ADR 0009), so a
  // coach who leaves one team keeps their account and their other teams.
  it("keeps the link when one of the person's assignments is removed", async () => {
    await seedUser("u1");
    const personId = await seedPerson("Eins");
    const entryId = await seedTeamEntry();
    const [assignment] = await ctx.db
      .insert(teamStaff)
      .values({ teamEntryId: entryId, personId, role: "trainer" })
      .returning({ id: teamStaff.id });
    await setUserStaffLink("u1", personId, true);

    await ctx.db.delete(teamStaff).where(eq(teamStaff.id, assignment!.id));

    expect(await userRow("u1")).toEqual({ personId, role: "coach" });
  });
});
