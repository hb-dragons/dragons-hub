import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// Real Postgres (pglite) with the real schema so confirmIntentsFromSync's raw
// EXISTS/UPDATE SQL is actually executed — the slot-correlation bug (#64) is
// invisible to the mock-unit suite, which stubs execute() to a fixed rowCount.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

vi.mock("../../config/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: vi.fn().mockResolvedValue(undefined),
}));

import { confirmIntentsFromSync } from "./referees.sync";
import {
  teams,
  matches,
  referees,
  refereeRoles,
  matchReferees,
  refereeAssignmentIntents,
} from "@dragons/db/schema";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

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

/** Seed one match + one referee + one role, returning their generated ids. */
async function seedMatchRefereeRole() {
  await ctx.db.insert(teams).values([
    { apiTeamPermanentId: 10, seasonTeamId: 100, teamCompetitionId: 1, name: "Home", clubId: 1 },
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
  const [referee] = await ctx.db
    .insert(referees)
    .values({ apiId: 9001, firstName: "Max", lastName: "Muster" })
    .returning({ id: referees.id });
  const [role] = await ctx.db
    .insert(refereeRoles)
    .values({ apiId: 1, name: "SR1" })
    .returning({ id: refereeRoles.id });
  return { matchId: match!.id, refereeId: referee!.id, roleId: role!.id };
}

async function intentRow(id: number) {
  const [row] = await ctx.db
    .select()
    .from(refereeAssignmentIntents)
    .where(eq(refereeAssignmentIntents.id, id));
  return row!;
}

describe("confirmIntentsFromSync — slot correlation (issue #64)", () => {
  it("does NOT confirm an intent when the referee landed in a different slot", async () => {
    const { matchId, refereeId, roleId } = await seedMatchRefereeRole();

    // Referee was actually assigned to slot 2 for this match...
    await ctx.db.insert(matchReferees).values({ matchId, refereeId, roleId, slotNumber: 2 });
    // ...but the pending intent claimed slot 1.
    const [intent] = await ctx.db
      .insert(refereeAssignmentIntents)
      .values({ matchId, refereeId, slotNumber: 1 })
      .returning({ id: refereeAssignmentIntents.id });

    await confirmIntentsFromSync();

    // The slot-1 intent must stay unconfirmed: the referee landed in slot 2.
    expect((await intentRow(intent!.id)).confirmedBySyncAt).toBeNull();
  });

  it("confirms an intent when the referee landed in the matching slot", async () => {
    const { matchId, refereeId, roleId } = await seedMatchRefereeRole();

    await ctx.db.insert(matchReferees).values({ matchId, refereeId, roleId, slotNumber: 1 });
    const [intent] = await ctx.db
      .insert(refereeAssignmentIntents)
      .values({ matchId, refereeId, slotNumber: 1 })
      .returning({ id: refereeAssignmentIntents.id });

    await confirmIntentsFromSync();

    expect((await intentRow(intent!.id)).confirmedBySyncAt).not.toBeNull();
  });
});
