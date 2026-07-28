import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm and @dragons/db/schema are deliberately NOT mocked (issue #110).
// Every function here is a predicate: "rules for THIS referee", "the rule for
// this referee AND this team", "replace this referee's rules". With `eq`/`and`
// stubbed to identity functions and the chain handing back a canned array, a
// query scoped to the wrong referee — or an `and` collapsed to `or` — passed
// just as happily. These run against a real (in-process PGlite) Postgres,
// including the real transaction in updateRulesForReferee.

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

import { getRulesForReferee } from "./referee-rules.service";
import { referees, teams, refereeAssignmentRules } from "@dragons/db/schema";
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

async function seedReferee(apiId: number): Promise<number> {
  const [row] = await ctx.db
    .insert(referees)
    .values({ apiId, firstName: "Ref", lastName: String(apiId), isOwnClub: true })
    .returning({ id: referees.id });
  return row!.id;
}

async function seedTeam(apiTeamPermanentId: number, name: string): Promise<number> {
  const [row] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId,
      seasonTeamId: apiTeamPermanentId,
      teamCompetitionId: apiTeamPermanentId,
      name,
      clubId: 1,
    })
    .returning({ id: teams.id });
  return row!.id;
}

async function seedRule(
  refereeId: number,
  teamId: number,
  rule: { deny?: boolean; allowSr1?: boolean; allowSr2?: boolean } = {},
): Promise<void> {
  await ctx.db.insert(refereeAssignmentRules).values({
    refereeId,
    teamId,
    deny: rule.deny ?? false,
    allowSr1: rule.allowSr1 ?? false,
    allowSr2: rule.allowSr2 ?? false,
  });
}

// --- Tests ---

describe("getRulesForReferee", () => {
  it("returns each rule joined to its team name", async () => {
    const refId = await seedReferee(9001);
    const teamId = await seedTeam(101, "Dragons 1");
    await seedRule(refId, teamId, { allowSr1: true, allowSr2: false });

    const result = await getRulesForReferee(refId);

    expect(result.rules).toEqual([
      {
        id: expect.any(Number),
        teamId,
        teamName: "Dragons 1",
        deny: false,
        allowSr1: true,
        allowSr2: false,
      },
    ]);
  });

  it("returns only this referee's rules", async () => {
    const mine = await seedReferee(9001);
    const theirs = await seedReferee(9002);
    const teamA = await seedTeam(101, "Dragons 1");
    const teamB = await seedTeam(102, "Dragons 2");
    await seedRule(mine, teamA, { allowSr1: true });
    await seedRule(theirs, teamB, { allowSr2: true });

    const result = await getRulesForReferee(mine);

    expect(result.rules.map((r) => r.teamName)).toEqual(["Dragons 1"]);
  });

  it("returns an empty list when the referee has no rules", async () => {
    const refId = await seedReferee(9001);

    expect(await getRulesForReferee(refId)).toEqual({ rules: [] });
  });

  it("throws NOT_FOUND for an unknown referee", async () => {
    await expect(getRulesForReferee(999999)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("throws NOT_OWN_CLUB for a referee outside the club", async () => {
    const [ref] = await ctx.db
      .insert(referees)
      .values({ apiId: 7777, firstName: "Ref", lastName: "Outsider", isOwnClub: false })
      .returning({ id: referees.id });

    await expect(getRulesForReferee(ref!.id)).rejects.toMatchObject({
      code: "NOT_OWN_CLUB",
      status: 400,
    });
  });
});

