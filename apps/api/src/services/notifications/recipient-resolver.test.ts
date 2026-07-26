import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm itself is NOT mocked here: this module's bug (audience:admin
// filtering on `eq(user.role, "admin")` against better-auth's comma-separated
// role string) only reproduces against a real query planner/executor. A test
// that stubs `eq`/`and`/`or` with identity functions and hands back
// pre-canned rows would pass whether the predicate is right or wrong, so we
// run against a real (PGlite, in-process) Postgres instead.

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

import { resolveRecipientUserIds } from "./recipient-resolver";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

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

async function seedUser(
  id: string,
  opts: { role?: string | null; refereeId?: number } = {},
): Promise<void> {
  await ctx.client.query(
    `INSERT INTO "user" (id, name, email, email_verified, role, referee_id, created_at, updated_at)
     VALUES ($1, $2, $3, false, $4, $5, now(), now())`,
    [id, id, `${id}@test.de`, opts.role ?? null, opts.refereeId ?? null],
  );
}

async function seedReferee(apiId: number): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO referees (api_id, first_name) VALUES ($1, 'Ref') RETURNING id`,
    [apiId],
  );
  return r.rows[0]!.id;
}

// --- Tests ---

describe("resolveRecipientUserIds", () => {
  describe("referee:N", () => {
    it("resolves referee:N to the linked user id", async () => {
      const refId = await seedReferee(42);
      await seedUser("user_abc", { refereeId: refId });
      const result = await resolveRecipientUserIds(`referee:${refId}`);
      expect(result).toEqual(["user_abc"]);
    });

    it("returns empty when no user has that refereeId", async () => {
      const result = await resolveRecipientUserIds("referee:999");
      expect(result).toEqual([]);
    });

    it("returns empty for referee:non-numeric", async () => {
      const result = await resolveRecipientUserIds("referee:abc");
      expect(result).toEqual([]);
    });
  });

  describe("audience:admin", () => {
    it("resolves a single-role admin user", async () => {
      await seedUser("admin_1", { role: "admin" });
      const result = await resolveRecipientUserIds("audience:admin");
      expect(result).toEqual(["admin_1"]);
    });

    it("resolves a user whose role string is comma-separated with admin first", async () => {
      await seedUser("multi_1", { role: "admin,refereeAdmin" });
      const result = await resolveRecipientUserIds("audience:admin");
      expect(result).toEqual(["multi_1"]);
    });

    it("resolves a user whose role string is comma-separated with admin last", async () => {
      await seedUser("multi_2", { role: "superadmin,admin" });
      const result = await resolveRecipientUserIds("audience:admin");
      expect(result.sort()).toEqual(["multi_2"]);
    });

    it("resolves a superadmin-only user, since superadmin is a superset of admin", async () => {
      await seedUser("super_1", { role: "superadmin" });
      const result = await resolveRecipientUserIds("audience:admin");
      expect(result).toEqual(["super_1"]);
    });

    it("excludes a user with no admin-family role", async () => {
      await seedUser("ref_admin_only", { role: "refereeAdmin" });
      const result = await resolveRecipientUserIds("audience:admin");
      expect(result).toEqual([]);
    });

    it("excludes a user with no role at all", async () => {
      await seedUser("no_role", { role: null });
      const result = await resolveRecipientUserIds("audience:admin");
      expect(result).toEqual([]);
    });

    it("resolves every qualifying user together, in one pass", async () => {
      await seedUser("admin_only", { role: "admin" });
      await seedUser("multi_admin", { role: "admin,refereeAdmin" });
      await seedUser("super_only", { role: "superadmin" });
      await seedUser("other_only", { role: "refereeAdmin" });
      await seedUser("no_role_user", { role: null });

      const result = await resolveRecipientUserIds("audience:admin");
      expect(result.sort()).toEqual(["admin_only", "multi_admin", "super_only"].sort());
    });
  });

  describe("audience:referee", () => {
    it("resolves all referee-linked user ids, regardless of role", async () => {
      const ref1 = await seedReferee(1);
      const ref2 = await seedReferee(2);
      await seedUser("ref_u1", { refereeId: ref1 });
      await seedUser("ref_u2", { refereeId: ref2 });
      await seedUser("not_a_referee", { role: "admin" });

      const result = await resolveRecipientUserIds("audience:referee");
      expect(result.sort()).toEqual(["ref_u1", "ref_u2"].sort());
    });
  });

  describe("user:X", () => {
    it("resolves user:X to [X] without a DB query", async () => {
      const result = await resolveRecipientUserIds("user:raw_id");
      expect(result).toEqual(["raw_id"]);
    });
  });

  describe("unknown prefix", () => {
    it("returns empty for unknown prefix", async () => {
      const result = await resolveRecipientUserIds("something:else");
      expect(result).toEqual([]);
    });
  });
});
