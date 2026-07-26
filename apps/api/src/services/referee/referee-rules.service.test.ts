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

import {
  getRulesForReferee,
  updateRulesForReferee,
  hasAnyRules,
  getRuleForRefereeAndTeam,
  getAllowedTeamIdsForReferee,
} from "./referee-rules.service";
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
    .values({ apiId, firstName: "Ref", lastName: String(apiId) })
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

async function storedRules(): Promise<
  Array<{ referee_id: number; team_id: number; allow_sr1: boolean; allow_sr2: boolean; deny: boolean }>
> {
  const res = await ctx.client.query<{
    referee_id: number;
    team_id: number;
    allow_sr1: boolean;
    allow_sr2: boolean;
    deny: boolean;
  }>(
    `SELECT referee_id, team_id, allow_sr1, allow_sr2, deny
     FROM referee_assignment_rules ORDER BY referee_id, team_id`,
  );
  return res.rows;
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
});

describe("updateRulesForReferee", () => {
  it("replaces the referee's rules and returns the fresh joined list", async () => {
    const refId = await seedReferee(9001);
    const teamA = await seedTeam(101, "Dragons 1");
    const teamB = await seedTeam(102, "Dragons 2");
    await seedRule(refId, teamA, { allowSr1: true });

    const result = await updateRulesForReferee(refId, {
      rules: [{ teamId: teamB, deny: false, allowSr1: false, allowSr2: true }],
    });

    expect(result.rules).toEqual([
      {
        id: expect.any(Number),
        teamId: teamB,
        teamName: "Dragons 2",
        deny: false,
        allowSr1: false,
        allowSr2: true,
      },
    ]);
    expect(await storedRules()).toEqual([
      { referee_id: refId, team_id: teamB, allow_sr1: false, allow_sr2: true, deny: false },
    ]);
  });

  it("writes every rule in the body, preserving each flag", async () => {
    const refId = await seedReferee(9001);
    const teamA = await seedTeam(101, "Dragons 1");
    const teamB = await seedTeam(102, "Dragons 2");

    await updateRulesForReferee(refId, {
      rules: [
        { teamId: teamA, deny: true, allowSr1: false, allowSr2: false },
        { teamId: teamB, deny: false, allowSr1: true, allowSr2: true },
      ],
    });

    expect(await storedRules()).toEqual([
      { referee_id: refId, team_id: teamA, allow_sr1: false, allow_sr2: false, deny: true },
      { referee_id: refId, team_id: teamB, allow_sr1: true, allow_sr2: true, deny: false },
    ]);
  });

  it("clears the referee's rules when given an empty list", async () => {
    const refId = await seedReferee(9001);
    const teamId = await seedTeam(101, "Dragons 1");
    await seedRule(refId, teamId, { allowSr1: true });

    const result = await updateRulesForReferee(refId, { rules: [] });

    expect(result).toEqual({ rules: [] });
    expect(await storedRules()).toEqual([]);
  });

  it("does not touch another referee's rules", async () => {
    const mine = await seedReferee(9001);
    const theirs = await seedReferee(9002);
    const teamA = await seedTeam(101, "Dragons 1");
    const teamB = await seedTeam(102, "Dragons 2");
    await seedRule(mine, teamA, { allowSr1: true });
    await seedRule(theirs, teamB, { allowSr2: true });

    await updateRulesForReferee(mine, { rules: [] });

    expect(await storedRules()).toEqual([
      { referee_id: theirs, team_id: teamB, allow_sr1: false, allow_sr2: true, deny: false },
    ]);
  });

  it("rolls the delete back when the insert fails (single transaction)", async () => {
    const refId = await seedReferee(9001);
    const teamId = await seedTeam(101, "Dragons 1");
    await seedRule(refId, teamId, { allowSr1: true });

    // teamId 999999 violates the FK to teams, so the INSERT aborts.
    await expect(
      updateRulesForReferee(refId, {
        rules: [{ teamId: 999_999, deny: false, allowSr1: true, allowSr2: false }],
      }),
    ).rejects.toThrow();

    // The pre-existing rule must survive: delete + insert are one unit.
    expect(await storedRules()).toEqual([
      { referee_id: refId, team_id: teamId, allow_sr1: true, allow_sr2: false, deny: false },
    ]);
  });
});

describe("hasAnyRules", () => {
  it("returns false when the referee has no rules", async () => {
    const refId = await seedReferee(9001);

    expect(await hasAnyRules(refId)).toBe(false);
  });

  it("returns true when the referee has a rule", async () => {
    const refId = await seedReferee(9001);
    const teamId = await seedTeam(101, "Dragons 1");
    await seedRule(refId, teamId);

    expect(await hasAnyRules(refId)).toBe(true);
  });

  it("does not count another referee's rules", async () => {
    const mine = await seedReferee(9001);
    const theirs = await seedReferee(9002);
    const teamId = await seedTeam(101, "Dragons 1");
    await seedRule(theirs, teamId);

    expect(await hasAnyRules(mine)).toBe(false);
  });
});

describe("getRuleForRefereeAndTeam", () => {
  it("returns the rule flags for the matching referee/team pair", async () => {
    const refId = await seedReferee(9001);
    const teamId = await seedTeam(101, "Dragons 1");
    await seedRule(refId, teamId, { deny: false, allowSr1: true, allowSr2: false });

    expect(await getRuleForRefereeAndTeam(refId, teamId)).toEqual({
      deny: false,
      allowSr1: true,
      allowSr2: false,
    });
  });

  it("returns null when the referee has no rule for that team", async () => {
    const refId = await seedReferee(9001);
    const teamA = await seedTeam(101, "Dragons 1");
    const teamB = await seedTeam(102, "Dragons 2");
    await seedRule(refId, teamA, { allowSr1: true });

    // Same referee, different team: the AND must not degrade to an OR.
    expect(await getRuleForRefereeAndTeam(refId, teamB)).toBeNull();
  });

  it("returns null for another referee's rule on the same team", async () => {
    const mine = await seedReferee(9001);
    const theirs = await seedReferee(9002);
    const teamId = await seedTeam(101, "Dragons 1");
    await seedRule(theirs, teamId, { allowSr1: true });

    expect(await getRuleForRefereeAndTeam(mine, teamId)).toBeNull();
  });
});

describe("getAllowedTeamIdsForReferee", () => {
  it("returns the team ids the referee has rules for", async () => {
    const refId = await seedReferee(9001);
    const teamA = await seedTeam(101, "Dragons 1");
    const teamB = await seedTeam(102, "Dragons 2");
    await seedRule(refId, teamA);
    await seedRule(refId, teamB);

    expect((await getAllowedTeamIdsForReferee(refId)).sort()).toEqual(
      [teamA, teamB].sort(),
    );
  });

  it("excludes team ids belonging to another referee's rules", async () => {
    const mine = await seedReferee(9001);
    const theirs = await seedReferee(9002);
    const teamA = await seedTeam(101, "Dragons 1");
    const teamB = await seedTeam(102, "Dragons 2");
    await seedRule(mine, teamA);
    await seedRule(theirs, teamB);

    expect(await getAllowedTeamIdsForReferee(mine)).toEqual([teamA]);
  });

  it("returns an empty array when the referee has no rules", async () => {
    const refId = await seedReferee(9001);

    expect(await getAllowedTeamIdsForReferee(refId)).toEqual([]);
  });
});
