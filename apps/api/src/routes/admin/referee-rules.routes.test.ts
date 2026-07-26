import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import type { AppEnv } from "../../types";
import type { RefereeRule, RefereeRulesResponse } from "@dragons/shared";

// --- Mocks (hoisted before imports) ---
//
// Deliberately NOT mocking drizzle-orm, @dragons/db/schema, the rbac middleware
// or referee-rules.service. The previous suite stubbed the service and asserted
// `expect(json).toEqual(rulesResponse)` against the very fixture it had just
// fed in — so the route's real body was asserted nowhere, and the fixture had
// silently drifted from `RefereeRule` (it was missing `deny`). Here the SELECT,
// its join and its `refereeId` predicate all run for real against PGlite, and
// the response shape is checked against `@dragons/shared`, not against a
// fixture this file made up.

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
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
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

import { refereeRulesRoutes } from "./referee-rules.routes";
import { errorHandler } from "../../middleware/error";
import { referees, refereeAssignmentRules, teams } from "@dragons/db/schema";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", refereeRulesRoutes);

// --- Shared-type shape contract ---
//
// These exemplars are typed as the shared interfaces, so `tsc` refuses to
// compile them if `@dragons/shared` grows, loses or renames a field. The
// assertions below then compare the *live* response against the exemplar's key
// set, which turns a shared-type change into a failing test rather than a
// silently divergent API.

const refereeRulesResponseShape: RefereeRulesResponse = { rules: [] };

const refereeRuleShape: RefereeRule = {
  id: 0,
  teamId: 0,
  teamName: "",
  deny: false,
  allowSr1: false,
  allowSr2: false,
};

/** Assert `actual` carries exactly the keys and primitive types of `exemplar`. */
function expectShapeOf(actual: unknown, exemplar: Record<string, unknown>): void {
  expect(actual).toBeTypeOf("object");
  expect(actual).not.toBeNull();
  const value = actual as Record<string, unknown>;
  expect(Object.keys(value).sort()).toEqual(Object.keys(exemplar).sort());
  for (const [key, sample] of Object.entries(exemplar)) {
    expect(typeof value[key]).toBe(typeof sample);
  }
}

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

// Referee ids are pinned high and explicit so they can never coincide with the
// `teams.id` serial. Overlapping ids would let a rule query that filters on the
// wrong column still return the right row by luck.
async function seedReferee(
  apiId: number,
  opts: { isOwnClub: boolean },
): Promise<number> {
  const [row] = await ctx.db
    .insert(referees)
    .values({
      id: apiId,
      apiId,
      firstName: "Ref",
      lastName: `R${apiId}`,
      isOwnClub: opts.isOwnClub,
    })
    .returning({ id: referees.id });
  return row!.id;
}

async function seedTeam(apiTeamPermanentId: number, name: string): Promise<number> {
  const [row] = await ctx.db
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
  return row!.id;
}

describe("GET /referees/:id/rules", () => {
  it("returns the rules that belong to that referee", async () => {
    const refereeId = await seedReferee(9001, { isOwnClub: true });
    const teamId = await seedTeam(10, "Dragons 1");
    await ctx.db.insert(refereeAssignmentRules).values({
      refereeId,
      teamId,
      deny: false,
      allowSr1: false,
      allowSr2: true,
    });

    const res = await app.request(`/referees/${refereeId}/rules`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      rules: [
        {
          id: expect.any(Number),
          teamId,
          teamName: "Dragons 1",
          deny: false,
          allowSr1: false,
          allowSr2: true,
        },
      ],
    });
  });

  it("does not leak another referee's rules", async () => {
    const mine = await seedReferee(9001, { isOwnClub: true });
    const theirs = await seedReferee(9002, { isOwnClub: true });
    const teamA = await seedTeam(10, "Dragons 1");
    const teamB = await seedTeam(20, "Dragons 2");
    await ctx.db.insert(refereeAssignmentRules).values([
      { refereeId: mine, teamId: teamA, allowSr1: true },
      { refereeId: theirs, teamId: teamB, allowSr2: true },
    ]);

    const res = await app.request(`/referees/${mine}/rules`);
    const body = (await res.json()) as RefereeRulesResponse;

    // With `eq` stubbed to identity the old suite could not tell a
    // referee-scoped SELECT from an unscoped one.
    expect(body.rules.map((r) => r.teamName)).toEqual(["Dragons 1"]);
  });

  it("returns an empty rule list for a referee with no rules", async () => {
    const refereeId = await seedReferee(9001, { isOwnClub: true });

    const res = await app.request(`/referees/${refereeId}/rules`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rules: [] });
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await app.request("/referees/abc/rules");
    expect(res.status).toBe(400);
  });
});

describe("GET /referees/:id/rules — response shape matches @dragons/shared", () => {
  it("returns exactly the top-level keys of RefereeRulesResponse", async () => {
    const refereeId = await seedReferee(9001, { isOwnClub: true });

    const res = await app.request(`/referees/${refereeId}/rules`);

    expectShapeOf(await res.json(), refereeRulesResponseShape);
  });

  it("returns exactly the keys and types of RefereeRule for each rule", async () => {
    const refereeId = await seedReferee(9001, { isOwnClub: true });
    const teamId = await seedTeam(10, "Dragons 1");
    await ctx.db
      .insert(refereeAssignmentRules)
      .values({ refereeId, teamId, deny: true, allowSr1: true, allowSr2: false });

    const res = await app.request(`/referees/${refereeId}/rules`);
    const body = (await res.json()) as RefereeRulesResponse;

    expect(body.rules).toHaveLength(1);
    // `deny` is the field the old, self-referential fixture had quietly dropped.
    expectShapeOf(body.rules[0], refereeRuleShape);
  });

  it("serialises deny/allowSr1/allowSr2 as booleans, not Postgres strings", async () => {
    const refereeId = await seedReferee(9001, { isOwnClub: true });
    const teamId = await seedTeam(10, "Dragons 1");
    await ctx.db
      .insert(refereeAssignmentRules)
      .values({ refereeId, teamId, deny: true, allowSr1: false, allowSr2: true });

    const res = await app.request(`/referees/${refereeId}/rules`);
    const body = (await res.json()) as RefereeRulesResponse;

    expect(body.rules[0]).toMatchObject({
      deny: true,
      allowSr1: false,
      allowSr2: true,
    });
  });
});

describe("GET /referees/:id/rules — isOwnClub guard", () => {
  it("returns 400 when the referee is not own club", async () => {
    const refereeId = await seedReferee(9001, { isOwnClub: false });

    const res = await app.request(`/referees/${refereeId}/rules`);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "NOT_OWN_CLUB" });
  });

  it("returns 404 when the referee does not exist", async () => {
    await seedReferee(9001, { isOwnClub: true });

    const res = await app.request("/referees/4242/rules");

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("reads isOwnClub from the addressed referee, not from any referee row", async () => {
    await seedReferee(9001, { isOwnClub: true });
    const outsider = await seedReferee(9002, { isOwnClub: false });

    const res = await app.request(`/referees/${outsider}/rules`);

    expect(res.status).toBe(400);
  });
});

describe("GET /referees/:id/rules — authorization", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await app.request("/referees/1/rules");

    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller lacks referee:view", async () => {
    mocks.userHasPermission.mockResolvedValue({ success: false });

    const res = await app.request("/referees/1/rules");

    expect(res.status).toBe(403);
  });
});
