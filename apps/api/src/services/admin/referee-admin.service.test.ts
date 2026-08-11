import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked. The previous
// version of this file stubbed `eq`/`and`/`or`/`ilike`/`sql` with identity
// functions and asserted `JSON.stringify(orderByArgs)).toMatch(/asc/i)` — so
// inverting the own-club scope filter to `eq(referees.isOwnClub, false)`, or
// dropping the `isNull(removedAt)` tombstone guard from the workload join, left
// every test green. Everything below runs the real SQL (aggregate, join,
// group-by, order-by) against an in-process PGlite Postgres, including the real
// `getDb().transaction()`.

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

import {
  getReferees,
  getRefereeById,
  getRefereeCounts,
  updateRefereeVisibility,
  updateRefereeRules,
} from "./referee-admin.service";
import { RefereeSettingsError } from "./referee-admin.errors";
import {
  matches,
  matchReferees,
  refereeAssignmentRules,
  refereeRoles,
  referees,
  teams,
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

// --- Helpers ---

let apiIdSeq = 0;

async function seedReferee(opts: {
  firstName?: string;
  lastName?: string;
  isOwnClub?: boolean;
  licenseNumber?: number;
  allowAllHomeGames?: boolean;
  allowAwayGames?: boolean;
}): Promise<number> {
  const [row] = await ctx.db
    .insert(referees)
    .values({
      apiId: ++apiIdSeq + 1000,
      firstName: opts.firstName ?? "First",
      lastName: opts.lastName ?? "Last",
      licenseNumber: opts.licenseNumber ?? null,
      isOwnClub: opts.isOwnClub ?? false,
      allowAllHomeGames: opts.allowAllHomeGames ?? false,
      allowAwayGames: opts.allowAwayGames ?? false,
    })
    .returning({ id: referees.id });
  return row!.id;
}

async function seedTeam(opts: { name: string; isOwnClub: boolean }): Promise<number> {
  const n = ++apiIdSeq;
  const [row] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId: 5000 + n,
      seasonTeamId: 6000 + n,
      teamCompetitionId: 7000 + n,
      name: opts.name,
      clubId: 1,
      isOwnClub: opts.isOwnClub,
    })
    .returning({ id: teams.id, apiTeamPermanentId: teams.apiTeamPermanentId });
  return row!.id;
}

/** Seed `count` matches and assign `refereeId` to slot 1 of each. */
async function assignMatches(
  refereeId: number,
  count: number,
  opts: { removed?: boolean } = {},
): Promise<void> {
  const [role] = await ctx.db
    .select({ id: refereeRoles.id })
    .from(refereeRoles)
    .limit(1);
  const roleId =
    role?.id ??
    (
      await ctx.db
        .insert(refereeRoles)
        .values({ apiId: 1, name: "Schiedsrichter", shortName: "SR" })
        .returning({ id: refereeRoles.id })
    )[0]!.id;

  // Two teams shared by every match.
  let teamRows = await ctx.db.select({ api: teams.apiTeamPermanentId }).from(teams).limit(2);
  if (teamRows.length < 2) {
    await seedTeam({ name: "Match home", isOwnClub: true });
    await seedTeam({ name: "Match guest", isOwnClub: false });
    teamRows = await ctx.db.select({ api: teams.apiTeamPermanentId }).from(teams).limit(2);
  }
  const homeApi = teamRows[0]!.api;
  const guestApi = teamRows[1]!.api;

  for (let i = 0; i < count; i++) {
    const n = ++apiIdSeq;
    const [match] = await ctx.db
      .insert(matches)
      .values({
        apiMatchId: 90000 + n,
        matchNo: n,
        matchDay: 1,
        kickoffDate: "2026-01-15",
        kickoffTime: "18:00:00",
        homeTeamApiId: homeApi,
        guestTeamApiId: guestApi,
      })
      .returning({ id: matches.id });
    await ctx.db.insert(matchReferees).values({
      matchId: match!.id,
      refereeId,
      roleId,
      slotNumber: 1,
      removedAt: opts.removed ? new Date() : null,
    });
  }
}

// --- Tests ---

describe("getReferees — scope", () => {
  it("returns every referee when scope is 'all'", async () => {
    await seedReferee({ lastName: "Own", isOwnClub: true });
    await seedReferee({ lastName: "Foreign", isOwnClub: false });

    const result = await getReferees({ limit: 50, offset: 0, scope: "all" });

    expect(result.total).toBe(2);
    expect(result.items.map((r) => r.lastName).sort()).toEqual(["Foreign", "Own"]);
  });

  it("returns only own-club referees when scope is 'own'", async () => {
    await seedReferee({ lastName: "Own", isOwnClub: true });
    await seedReferee({ lastName: "Foreign", isOwnClub: false });

    const result = await getReferees({ limit: 50, offset: 0, scope: "own" });

    expect(result.total).toBe(1);
    expect(result.items.map((r) => r.lastName)).toEqual(["Own"]);
    expect(result.items[0]!.isOwnClub).toBe(true);
  });
});

describe("getReferees — search", () => {
  it("matches on first name, case-insensitively", async () => {
    await seedReferee({ firstName: "Anna", lastName: "Zimmer", isOwnClub: true });
    await seedReferee({ firstName: "Bernd", lastName: "Yilmaz", isOwnClub: true });

    const result = await getReferees({ limit: 50, offset: 0, scope: "all", search: "anna" });

    expect(result.items.map((r) => r.firstName)).toEqual(["Anna"]);
    expect(result.total).toBe(1);
  });

  it("matches on last name too (OR, not AND)", async () => {
    await seedReferee({ firstName: "Anna", lastName: "Zimmer", isOwnClub: true });
    await seedReferee({ firstName: "Bernd", lastName: "Yilmaz", isOwnClub: true });

    const result = await getReferees({ limit: 50, offset: 0, scope: "all", search: "yilm" });

    expect(result.items.map((r) => r.lastName)).toEqual(["Yilmaz"]);
  });

  it("ANDs the scope filter with the search filter", async () => {
    await seedReferee({ firstName: "Anna", lastName: "Zimmer", isOwnClub: true });
    await seedReferee({ firstName: "Anna", lastName: "Fremd", isOwnClub: false });

    const result = await getReferees({ limit: 50, offset: 0, scope: "own", search: "anna" });

    expect(result.items.map((r) => r.lastName)).toEqual(["Zimmer"]);
    expect(result.total).toBe(1);
  });

  // Without escapeLikePattern the search string is spliced straight into a LIKE
  // pattern, so `%` matches everything and `_` matches any character — an
  // admin-facing wildcard nobody asked for.
  it("treats a bare % as a literal character, not a wildcard", async () => {
    await seedReferee({ firstName: "Anna", lastName: "Zimmer", isOwnClub: true });
    await seedReferee({ firstName: "Bernd", lastName: "Yilmaz", isOwnClub: true });

    const result = await getReferees({ limit: 50, offset: 0, scope: "all", search: "%" });

    // Unescaped, `%…%` would return both referees; the count follows the same
    // predicate, so both the page and the total have to come back empty.
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("treats _ as a literal character, not a single-character wildcard", async () => {
    await seedReferee({ firstName: "Anna", lastName: "Zimmer", isOwnClub: true });

    const result = await getReferees({ limit: 50, offset: 0, scope: "all", search: "A_na" });

    expect(result.items).toEqual([]);
  });

  it("finds a name that genuinely contains an underscore", async () => {
    await seedReferee({ firstName: "A_na", lastName: "Zimmer", isOwnClub: true });
    await seedReferee({ firstName: "Anna", lastName: "Yilmaz", isOwnClub: true });

    const result = await getReferees({ limit: 50, offset: 0, scope: "all", search: "A_na" });

    expect(result.items.map((r) => r.firstName)).toEqual(["A_na"]);
  });

  it("treats a backslash as a literal character", async () => {
    await seedReferee({ firstName: "Anna", lastName: "Zimmer", isOwnClub: true });

    const result = await getReferees({ limit: 50, offset: 0, scope: "all", search: "\\" });

    expect(result.items).toEqual([]);
  });
});

describe("getReferees — workload", () => {
  it("counts distinct live assignments and ignores tombstoned ones", async () => {
    const busy = await seedReferee({ lastName: "Busy", isOwnClub: true });
    const idle = await seedReferee({ lastName: "Idle", isOwnClub: true });
    await assignMatches(busy, 3);
    await assignMatches(idle, 2, { removed: true });

    const result = await getReferees({ limit: 50, offset: 0, scope: "all" });
    const byName = new Map(result.items.map((r) => [r.lastName, r.matchCount]));

    expect(byName.get("Busy")).toBe(3);
    expect(byName.get("Idle")).toBe(0);
  });

  it("sorts by ascending workload when sort is 'workloadAsc'", async () => {
    const a = await seedReferee({ lastName: "Alpha", isOwnClub: true });
    const b = await seedReferee({ lastName: "Bravo", isOwnClub: true });
    const c = await seedReferee({ lastName: "Charlie", isOwnClub: true });
    await assignMatches(b, 1);
    await assignMatches(c, 4);
    void a;

    const result = await getReferees({
      limit: 50,
      offset: 0,
      scope: "own",
      sort: "workloadAsc",
    });

    expect(result.items.map((r) => r.lastName)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(result.items.map((r) => r.matchCount)).toEqual([0, 1, 4]);
  });

  it("sorts by descending workload when sort is 'workloadDesc'", async () => {
    const a = await seedReferee({ lastName: "Alpha", isOwnClub: true });
    const b = await seedReferee({ lastName: "Bravo", isOwnClub: true });
    const c = await seedReferee({ lastName: "Charlie", isOwnClub: true });
    await assignMatches(b, 1);
    await assignMatches(c, 4);
    void a;

    const result = await getReferees({
      limit: 50,
      offset: 0,
      scope: "own",
      sort: "workloadDesc",
    });

    expect(result.items.map((r) => r.lastName)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("sorts by last name then first name by default", async () => {
    await seedReferee({ firstName: "Bernd", lastName: "Adler", isOwnClub: true });
    await seedReferee({ firstName: "Anna", lastName: "Adler", isOwnClub: true });
    await seedReferee({ firstName: "Carla", lastName: "Zimmer", isOwnClub: true });

    const result = await getReferees({ limit: 50, offset: 0, scope: "all" });

    expect(result.items.map((r) => `${r.lastName},${r.firstName}`)).toEqual([
      "Adler,Anna",
      "Adler,Bernd",
      "Zimmer,Carla",
    ]);
  });
});

describe("getReferees — pagination", () => {
  it("returns an empty page when nothing matches", async () => {
    const result = await getReferees({ limit: 20, offset: 0, scope: "own" });

    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0, hasMore: false });
  });

  it("reports hasMore while rows remain and false on the last page", async () => {
    for (const n of ["A", "B", "C"]) await seedReferee({ lastName: n, isOwnClub: true });

    const first = await getReferees({ limit: 2, offset: 0, scope: "all" });
    expect(first.total).toBe(3);
    expect(first.items.map((r) => r.lastName)).toEqual(["A", "B"]);
    expect(first.hasMore).toBe(true);

    const second = await getReferees({ limit: 2, offset: 2, scope: "all" });
    expect(second.items.map((r) => r.lastName)).toEqual(["C"]);
    expect(second.hasMore).toBe(false);
  });

  it("counts every matching row, not just the page", async () => {
    for (const n of ["A", "B", "C", "D"]) await seedReferee({ lastName: n, isOwnClub: true });
    await seedReferee({ lastName: "E", isOwnClub: false });

    const result = await getReferees({ limit: 1, offset: 0, scope: "own" });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(4);
  });
});

describe("getRefereeById", () => {
  it("returns the addressed referee with its live match count", async () => {
    const target = await seedReferee({ firstName: "Anna", lastName: "Zimmer", isOwnClub: true });
    const other = await seedReferee({ lastName: "Other", isOwnClub: true });
    await assignMatches(target, 2);
    await assignMatches(other, 5);

    const result = await getRefereeById(target);

    expect(result).toMatchObject({
      id: target,
      firstName: "Anna",
      lastName: "Zimmer",
      isOwnClub: true,
      matchCount: 2,
    });
    expect(result).not.toHaveProperty("roles");
  });

  it("returns null when no row matches", async () => {
    await seedReferee({ lastName: "Present" });

    expect(await getRefereeById(999_999)).toBeNull();
  });
});

describe("getRefereeCounts", () => {
  it("counts own-club referees separately from all referees", async () => {
    await seedReferee({ isOwnClub: true });
    await seedReferee({ isOwnClub: true });
    await seedReferee({ isOwnClub: false });

    expect(await getRefereeCounts()).toEqual({ own: 2, all: 3 });
  });

  it("returns zeros for an empty table", async () => {
    expect(await getRefereeCounts()).toEqual({ own: 0, all: 0 });
  });
});

describe("updateRefereeVisibility", () => {
  it("persists the flags on the addressed referee only", async () => {
    const target = await seedReferee({ lastName: "Target" });
    const bystander = await seedReferee({ lastName: "Bystander" });

    const result = await updateRefereeVisibility(target, {
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    expect(result).toEqual({
      id: target,
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });

    const [stored] = await ctx.db
      .select()
      .from(referees)
      .where(eq(referees.id, bystander));
    expect(stored).toMatchObject({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: false,
    });
  });

  it("can set both flags at once", async () => {
    const id = await seedReferee({});

    const result = await updateRefereeVisibility(id, {
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: false,
    });

    expect(result).toEqual({
      id,
      allowAllHomeGames: true,
      allowAwayGames: true,
      isOwnClub: false,
    });
  });

  it("throws NOT_FOUND for a referee that does not exist", async () => {
    await expect(
      updateRefereeVisibility(999, {
        allowAllHomeGames: true,
        allowAwayGames: false,
        isOwnClub: false,
      }),
    ).rejects.toThrow("Referee 999 not found");
  });
});

describe("updateRefereeRules", () => {
  it("RefereeSettingsError is properly typed", () => {
    const err = new RefereeSettingsError("test", "NOT_OWN_CLUB");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("NOT_OWN_CLUB");
    expect(err.name).toBe("RefereeSettingsError");
  });

  it("throws NOT_FOUND when the referee does not exist", async () => {
    await expect(updateRefereeRules(999, { rules: [] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws NOT_OWN_CLUB when the referee is not own-club", async () => {
    const id = await seedReferee({ isOwnClub: false });

    await expect(updateRefereeRules(id, { rules: [] })).rejects.toMatchObject({
      code: "NOT_OWN_CLUB",
    });
  });

  it("throws VALIDATION_ERROR for a team that is not own-club", async () => {
    const refereeId = await seedReferee({ isOwnClub: true });
    const foreignTeam = await seedTeam({ name: "Foreign", isOwnClub: false });

    await expect(
      updateRefereeRules(refereeId, {
        rules: [{ teamId: foreignTeam, deny: false, allowSr1: true, allowSr2: false }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("throws VALIDATION_ERROR for a team id that does not exist", async () => {
    const refereeId = await seedReferee({ isOwnClub: true });

    await expect(
      updateRefereeRules(refereeId, {
        rules: [{ teamId: 999_999, deny: false, allowSr1: true, allowSr2: false }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rolls the whole transaction back when validation fails", async () => {
    const refereeId = await seedReferee({ isOwnClub: true });
    const ownTeam = await seedTeam({ name: "Own", isOwnClub: true });
    await updateRefereeRules(refereeId, {
      rules: [{ teamId: ownTeam, deny: false, allowSr1: true, allowSr2: true }],
    });

    await expect(
      updateRefereeRules(refereeId, {
        rules: [{ teamId: 999_999, deny: false, allowSr1: true, allowSr2: false }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // The pre-existing rule must survive the failed call.
    const stored = await ctx.db
      .select()
      .from(refereeAssignmentRules)
      .where(eq(refereeAssignmentRules.refereeId, refereeId));
    expect(stored).toHaveLength(1);
  });

  it("clears the referee's rules when an empty array is submitted", async () => {
    const refereeId = await seedReferee({ isOwnClub: true });
    const ownTeam = await seedTeam({ name: "Own", isOwnClub: true });
    await updateRefereeRules(refereeId, {
      rules: [{ teamId: ownTeam, deny: false, allowSr1: true, allowSr2: true }],
    });

    const result = await updateRefereeRules(refereeId, { rules: [] });

    expect(result).toEqual({ rules: [] });
    expect(
      await ctx.db
        .select()
        .from(refereeAssignmentRules)
        .where(eq(refereeAssignmentRules.refereeId, refereeId)),
    ).toHaveLength(0);
  });

  it("leaves another referee's rules alone", async () => {
    const target = await seedReferee({ isOwnClub: true });
    const other = await seedReferee({ isOwnClub: true });
    const ownTeam = await seedTeam({ name: "Own", isOwnClub: true });
    await updateRefereeRules(other, {
      rules: [{ teamId: ownTeam, deny: false, allowSr1: true, allowSr2: true }],
    });

    await updateRefereeRules(target, { rules: [] });

    expect(
      await ctx.db
        .select()
        .from(refereeAssignmentRules)
        .where(eq(refereeAssignmentRules.refereeId, other)),
    ).toHaveLength(1);
  });

  it("replaces the rule set and returns it joined with the team name", async () => {
    const refereeId = await seedReferee({ isOwnClub: true });
    const teamA = await seedTeam({ name: "Team A", isOwnClub: true });

    const result = await updateRefereeRules(refereeId, {
      rules: [{ teamId: teamA, deny: false, allowSr1: true, allowSr2: true }],
    });

    expect(result.rules).toEqual([
      {
        id: expect.any(Number),
        teamId: teamA,
        teamName: "Team A",
        deny: false,
        allowSr1: true,
        allowSr2: true,
      },
    ]);
  });

  it("forces allowSr1/allowSr2 to false when the rule denies", async () => {
    const refereeId = await seedReferee({ isOwnClub: true });
    const teamA = await seedTeam({ name: "Team A", isOwnClub: true });

    const result = await updateRefereeRules(refereeId, {
      rules: [{ teamId: teamA, deny: true, allowSr1: true, allowSr2: true }],
    });

    expect(result.rules[0]).toMatchObject({ deny: true, allowSr1: false, allowSr2: false });
    const [stored] = await ctx.db
      .select()
      .from(refereeAssignmentRules)
      .where(eq(refereeAssignmentRules.refereeId, refereeId));
    expect(stored).toMatchObject({ deny: true, allowSr1: false, allowSr2: false });
  });
});
