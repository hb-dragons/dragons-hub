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

import { setUserRefereeLink } from "./user-admin.service";
import { referees, user as userTable } from "@dragons/db/schema";
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

async function seedUser(id: string): Promise<void> {
  await ctx.db.insert(userTable).values({ id, name: id, email: `${id}@example.test` });
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
