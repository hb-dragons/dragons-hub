import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// Real Postgres (pglite) so buildDetailResponse's joins + slot resolution run
// for real. The co-located mock-unit suite stubs schema/drizzle and only covers
// the pure row mappers, so the slot/array-index bug (#65) is invisible there.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

import { getMatchDetail } from "./match-query.service";
import {
  teams,
  matches,
  referees,
  refereeRoles,
  matchReferees,
} from "@dragons/db/schema";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

let ctx: TestDbContext;
let roleId: number;

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

/** Seed two teams + one match, returning the match id. */
async function seedMatch(): Promise<number> {
  await ctx.db.insert(teams).values([
    { apiTeamPermanentId: 10, seasonTeamId: 100, teamCompetitionId: 1, name: "Home", clubId: 1, isOwnClub: true },
    { apiTeamPermanentId: 20, seasonTeamId: 200, teamCompetitionId: 2, name: "Guest", clubId: 2 },
  ]);
  const [match] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: 1000,
      matchNo: 1,
      matchDay: 1,
      kickoffDate: "2025-01-15",
      kickoffTime: "18:00:00",
      homeTeamApiId: 10,
      guestTeamApiId: 20,
    })
    .returning({ id: matches.id });
  const [role] = await ctx.db
    .insert(refereeRoles)
    .values({ apiId: 1, name: "Schiedsrichter", shortName: "SR" })
    .returning({ id: refereeRoles.id });
  roleId = role!.id;
  return match!.id;
}

async function seedReferee(apiId: number, lastName: string): Promise<number> {
  const [ref] = await ctx.db
    .insert(referees)
    .values({ apiId, firstName: "Ref", lastName })
    .returning({ id: referees.id });
  return ref!.id;
}

describe("buildDetailResponse — referee slot resolution (issue #65)", () => {
  it("places a lone slot-2 assignment in UI slot 2, not slot 1", async () => {
    const matchId = await seedMatch();
    const refereeId = await seedReferee(9001, "Zwei");
    // Referee assigned to slot 2 only; slot 1 is empty (non-contiguous).
    await ctx.db.insert(matchReferees).values({ matchId, refereeId, roleId, slotNumber: 2 });

    const result = await getMatchDetail(matchId);
    const slots = result!.match.refereeSlots!;

    expect(slots[0]!.referee).toBeNull(); // slot 1 must be empty
    expect(slots[1]!.slotNumber).toBe(2);
    expect(slots[1]!.referee?.id).toBe(refereeId); // slot 2 holds the referee
  });

  it("resolves each assignment to its own slot regardless of row order", async () => {
    const matchId = await seedMatch();
    const refA = await seedReferee(9001, "Eins");
    const refC = await seedReferee(9003, "Drei");
    // Insert slot 3 before slot 1 so array order != slot order.
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refC, roleId, slotNumber: 3 });
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refA, roleId, slotNumber: 1 });

    const result = await getMatchDetail(matchId);
    const slots = result!.match.refereeSlots!;

    expect(slots[0]!.referee?.id).toBe(refA); // slot 1
    expect(slots[1]!.referee).toBeNull(); // slot 2 empty
    expect(slots[2]!.referee?.id).toBe(refC); // slot 3
  });
});

describe("buildDetailResponse — removed assignments (issue #105)", () => {
  it("never returns a slot that is both open and carrying a referee", async () => {
    const matchId = await seedMatch();
    const refereeId = await seedReferee(9001, "Eins");
    // The federation reopened slot 1 but the assignment row is still live —
    // exactly the state the sync used to leave behind.
    await ctx.db.update(matches).set({ sr1Open: true }).where(eq(matches.id, matchId));
    await ctx.db.insert(matchReferees).values({ matchId, refereeId, roleId, slotNumber: 1 });

    const result = await getMatchDetail(matchId);
    const slots = result!.match.refereeSlots!;

    for (const slot of slots) {
      expect(slot.isOpen && slot.referee !== null).toBe(false);
      expect(slot.isOpen && slot.role !== null).toBe(false);
    }
  });

  it("drops a tombstoned assignment and reports the slot as open", async () => {
    const matchId = await seedMatch();
    const refereeId = await seedReferee(9001, "Eins");
    await ctx.db.update(matches).set({ sr1Open: true }).where(eq(matches.id, matchId));
    await ctx.db.insert(matchReferees).values({
      matchId,
      refereeId,
      roleId,
      slotNumber: 1,
      removedAt: new Date(),
    });

    const result = await getMatchDetail(matchId);
    const slots = result!.match.refereeSlots!;

    expect(slots[0]!.referee).toBeNull();
    expect(slots[0]!.role).toBeNull();
    expect(slots[0]!.isOpen).toBe(true);
  });

  it("still shows the live assignment when a tombstone exists for the same slot", async () => {
    const matchId = await seedMatch();
    const oldRef = await seedReferee(9001, "Alt");
    const newRef = await seedReferee(9002, "Neu");
    await ctx.db.insert(matchReferees).values({
      matchId,
      refereeId: oldRef,
      roleId,
      slotNumber: 1,
      removedAt: new Date(),
    });
    // The partial unique index must allow refilling a vacated slot.
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: newRef, roleId, slotNumber: 1 });

    const result = await getMatchDetail(matchId);
    const slots = result!.match.refereeSlots!;

    expect(slots[0]!.referee?.id).toBe(newRef);
  });
});
