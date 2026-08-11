import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import type {
  ExtractedReferee,
  ExtractedRefereeRole,
  ExtractedRefereeAssignment,
} from "./data-fetcher";

// Real Postgres (pglite) with real migrations, the real drizzle operators and the
// real `computeEntityHash`.
//
// The previous mocked-ORM version stubbed `eq`/`and`/`isNull`/`inArray`/`sql` to
// identity functions and hand-choreographed every `select()` return value in call
// order, so none of this file's SQL ran: the `isNull(matchReferees.removedAt)`
// guard on the existing-assignment lookup (issue #105) and the
// `setWhere: excluded.data_hash != ...` upsert guard were both invisible, and
// `confirmIntentsFromSync`'s raw SQL was reduced to a mock returning a fixed
// rowCount.
//
// `removeStaleRefereeAssignments` has its own pglite suite in
// referees.sync.removal.integration.test.ts and is not re-covered here.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

const mockLogWarn = vi.fn();
vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: (...args: unknown[]) => mockLogWarn(...args),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const mockPublishDomainEvent = vi.fn();
vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: (...args: unknown[]) => mockPublishDomainEvent(...args),
}));

import {
  syncRefereeRolesFromData,
  syncRefereesFromData,
  syncRefereeAssignmentsFromData,
  buildMatchIdLookup,
  confirmIntentsFromSync,
} from "./referees.sync";
import { computeEntityHash } from "./hash";
import {
  referees,
  refereeRoles,
  matchReferees,
  matchChanges,
  matches,
  leagues,
  teams,
  refereeAssignmentIntents,
} from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { seedActiveSeason } from "../../test/seed-season";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  dbHolder.ref = ctx.db;
  vi.clearAllMocks();
  mockPublishDomainEvent.mockResolvedValue({ id: "mock-event-id" });
  // Only Date is faked: pglite's WASM I/O needs real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2025-06-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Fixtures ---

function makeRole(overrides: Partial<ExtractedRefereeRole> = {}): ExtractedRefereeRole {
  return {
    schirirolleId: 1,
    schirirollename: "1. Schiedsrichter",
    schirirollekurzname: "1. SR",
    ...overrides,
  };
}

function makeReferee(overrides: Partial<ExtractedReferee> = {}): ExtractedReferee {
  return {
    schiedsrichterId: 100,
    vorname: "John",
    nachname: "Doe",
    lizenznummer: 12345,
    ...overrides,
  };
}

function roleHash(role: ExtractedRefereeRole) {
  return computeEntityHash({
    apiId: role.schirirolleId,
    name: role.schirirollename,
    shortName: role.schirirollekurzname,
  });
}

function refereeHash(ref: ExtractedReferee) {
  return computeEntityHash({
    apiId: ref.schiedsrichterId,
    firstName: ref.vorname,
    lastName: ref.nachname,
    licenseNumber: ref.lizenznummer,
  });
}

/** Swap getDb() for a proxy overriding one method and delegating the rest. */
function overrideDbMethod(name: string, impl: unknown) {
  const real = ctx.db as unknown as Record<string | symbol, unknown>;
  dbHolder.ref = new Proxy({}, { get: (_t, prop) => (prop === name ? impl : real[prop]) });
}

/**
 * Point getDb() at a db whose `transaction()` rejects. Each assignment write is
 * a transaction (issue #77), so that is the seam a database failure comes
 * through — overriding `insert` no longer reaches the statements inside it.
 */
function failTransactionWith(reason: unknown) {
  overrideDbMethod("transaction", () => {
    if (reason instanceof Error) return Promise.reject(reason);
    throw reason;
  });
}

/**
 * Run `fn` with a real database trigger that rejects every `match_changes`
 * insert. The failure comes from Postgres, mid-transaction and after the slot
 * write has already succeeded, which is what makes it evidence that the two
 * roll back together — a stubbed insert could not fail *inside* the real
 * transaction at all.
 */
async function withFailingMatchChangesInsert<T>(fn: () => Promise<T>): Promise<T> {
  await ctx.client.exec(`
    CREATE FUNCTION fail_match_changes() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'history down'; END $$ LANGUAGE plpgsql;
    CREATE TRIGGER fail_match_changes BEFORE INSERT ON match_changes
      FOR EACH ROW EXECUTE FUNCTION fail_match_changes();
  `);
  try {
    return await fn();
  } finally {
    await ctx.client.exec(`
      DROP TRIGGER fail_match_changes ON match_changes;
      DROP FUNCTION fail_match_changes();
    `);
  }
}

/** Point getDb() at a db whose upsert rejects while reads stay real. */
async function withFailingUpsert<T>(reason: unknown, fn: () => Promise<T>): Promise<T> {
  overrideDbMethod("insert", () => ({
    values: () => ({
      onConflictDoUpdate: () => ({ returning: () => Promise.reject(reason) }),
    }),
  }));
  try {
    return await fn();
  } finally {
    dbHolder.ref = ctx.db;
  }
}

describe("syncRefereeRolesFromData", () => {
  it("returns an empty result for an empty map", async () => {
    const result = await syncRefereeRolesFromData(new Map());

    expect(result).toEqual({
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      roleIdLookup: new Map(),
    });
    expect(await ctx.db.select().from(refereeRoles)).toEqual([]);
  });

  it("creates new roles, persists the columns and returns the id lookup", async () => {
    const role = makeRole();

    const result = await syncRefereeRolesFromData(new Map([[role.schirirolleId, role]]));

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);

    const [row] = await ctx.db.select().from(refereeRoles);
    expect(row!.apiId).toBe(1);
    expect(row!.name).toBe("1. Schiedsrichter");
    expect(row!.shortName).toBe("1. SR");
    expect(row!.dataHash).toBe(roleHash(role));
    expect(result.roleIdLookup.get(1)).toBe(row!.id);
  });

  it("updates a role whose name changed", async () => {
    await syncRefereeRolesFromData(new Map([[1, makeRole()]]));
    const [before] = await ctx.db.select().from(refereeRoles);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const renamed = makeRole({ schirirollename: "Hauptschiedsrichter" });
    const result = await syncRefereeRolesFromData(new Map([[1, renamed]]));

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    const [after] = await ctx.db.select().from(refereeRoles);
    expect(after!.id).toBe(before!.id);
    expect(after!.name).toBe("Hauptschiedsrichter");
    expect(after!.dataHash).toBe(roleHash(renamed));
    expect(result.roleIdLookup.get(1)).toBe(before!.id);
  });

  it("skips an unchanged role and still returns it in the lookup", async () => {
    const role = makeRole();
    await syncRefereeRolesFromData(new Map([[1, role]]));
    const [before] = await ctx.db.select().from(refereeRoles);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const result = await syncRefereeRolesFromData(new Map([[1, role]]));

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    // The pre-load supplies the lookup even though the upsert returned nothing.
    expect(result.roleIdLookup.get(1)).toBe(before!.id);
    const [after] = await ctx.db.select().from(refereeRoles);
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
  });

  it("handles a batch error", async () => {
    const result = await withFailingUpsert(new Error("DB error"), () =>
      syncRefereeRolesFromData(new Map([[1, makeRole()]])),
    );

    expect(result.failed).toBe(1);
    expect(result.roleIdLookup.size).toBe(0);
    expect(await ctx.db.select().from(refereeRoles)).toEqual([]);
  });

  // Regression: the batch failure used to be reported only as `failed`, which
  // fullSync never reads, so a total role-sync failure left the run "completed"
  // with recordsFailed 0. The errors[] is what reaches allErrors.
  it("returns the failure in errors[] so fullSync can report it", async () => {
    const result = await withFailingUpsert(new Error("DB error"), () =>
      syncRefereeRolesFromData(new Map([[1, makeRole()]])),
    );

    expect(result.errors).toEqual(["Batch role sync failed: DB error"]);
  });

  it("returns no errors on a successful batch", async () => {
    const result = await syncRefereeRolesFromData(new Map([[1, makeRole()]]));

    expect(result.errors).toEqual([]);
  });

  it("handles a non-Error batch failure", async () => {
    const mockLogger = { log: vi.fn() };

    await withFailingUpsert("string error", () =>
      syncRefereeRolesFromData(new Map([[1, makeRole()]]), mockLogger as never),
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Unknown error") }),
    );
  });

  it("logs the 'updated' action when changes exist", async () => {
    const mockLogger = { log: vi.fn() };

    await syncRefereeRolesFromData(new Map([[1, makeRole()]]), mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "refereeRole",
        action: "updated",
        metadata: { created: 1, updated: 0, skipped: 0 },
      }),
    );
  });

  it("logs the 'skipped' action when all entries are skipped", async () => {
    await syncRefereeRolesFromData(new Map([[1, makeRole()]]));
    const mockLogger = { log: vi.fn() };

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    await syncRefereeRolesFromData(new Map([[1, makeRole()]]), mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "refereeRole",
        action: "skipped",
        metadata: { created: 0, updated: 0, skipped: 1 },
      }),
    );
  });

  it("logs failure to the sync logger", async () => {
    const mockLogger = { log: vi.fn() };

    await withFailingUpsert(new Error("boom"), () =>
      syncRefereeRolesFromData(new Map([[1, makeRole()]]), mockLogger as never),
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "refereeRole", action: "failed" }),
    );
  });
});

describe("syncRefereesFromData", () => {
  it("returns an empty result for an empty map", async () => {
    const result = await syncRefereesFromData(new Map());

    expect(result.created).toBe(0);
    expect(result.refereeIdLookup.size).toBe(0);
    expect(await ctx.db.select().from(referees)).toEqual([]);
  });

  it("creates new referees with every column mapped", async () => {
    const ref = makeReferee();

    const result = await syncRefereesFromData(new Map([[100, ref]]));

    expect(result.created).toBe(1);
    const [row] = await ctx.db.select().from(referees);
    expect(row!.apiId).toBe(100);
    expect(row!.firstName).toBe("John");
    expect(row!.lastName).toBe("Doe");
    expect(row!.licenseNumber).toBe(12345);
    expect(row!.dataHash).toBe(refereeHash(ref));
    expect(result.refereeIdLookup.get(100)).toBe(row!.id);
  });

  it("updates a referee whose licence number changed", async () => {
    await syncRefereesFromData(new Map([[100, makeReferee()]]));
    const [before] = await ctx.db.select().from(referees);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const result = await syncRefereesFromData(
      new Map([[100, makeReferee({ lizenznummer: 54321 })]]),
    );

    expect(result.updated).toBe(1);
    const [after] = await ctx.db.select().from(referees);
    expect(after!.id).toBe(before!.id);
    expect(after!.licenseNumber).toBe(54321);
  });

  it("skips an unchanged referee (dataHash change detection)", async () => {
    await syncRefereesFromData(new Map([[100, makeReferee()]]));
    const [before] = await ctx.db.select().from(referees);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const result = await syncRefereesFromData(new Map([[100, makeReferee()]]));

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.refereeIdLookup.get(100)).toBe(before!.id);
    const [after] = await ctx.db.select().from(referees);
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
  });

  it("does not clobber local-only referee columns on update", async () => {
    await syncRefereesFromData(new Map([[100, makeReferee()]]));
    await ctx.db
      .update(referees)
      .set({ isOwnClub: true, allowAwayGames: true })
      .where(eq(referees.apiId, 100));

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    await syncRefereesFromData(new Map([[100, makeReferee({ nachname: "Renamed" })]]));

    const [row] = await ctx.db.select().from(referees);
    expect(row!.lastName).toBe("Renamed");
    expect(row!.isOwnClub).toBe(true);
    expect(row!.allowAwayGames).toBe(true);
  });

  it("handles a batch error", async () => {
    const result = await withFailingUpsert(new Error("DB error"), () =>
      syncRefereesFromData(new Map([[100, makeReferee()]])),
    );

    expect(result.errors[0]).toContain("Batch referee sync failed");
    expect(result.refereeIdLookup.size).toBe(0);
  });

  it("handles a non-Error batch failure", async () => {
    const result = await withFailingUpsert("string error", () =>
      syncRefereesFromData(new Map([[100, makeReferee()]])),
    );

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("logs the 'skipped' action when all entries are skipped", async () => {
    await syncRefereesFromData(new Map([[100, makeReferee()]]));
    const mockLogger = { log: vi.fn() };

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    await syncRefereesFromData(new Map([[100, makeReferee()]]), mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "referee",
        action: "skipped",
        metadata: { created: 0, updated: 0, skipped: 1 },
      }),
    );
  });

  it("logs the 'updated' action when changes exist", async () => {
    const mockLogger = { log: vi.fn() };

    await syncRefereesFromData(new Map([[100, makeReferee()]]), mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "referee",
        action: "updated",
        metadata: { created: 1, updated: 0, skipped: 0 },
      }),
    );
  });

  it("logs failure to the sync logger", async () => {
    const mockLogger = { log: vi.fn() };

    await withFailingUpsert(new Error("boom"), () =>
      syncRefereesFromData(new Map([[100, makeReferee()]]), mockLogger as never),
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "referee", action: "failed" }),
    );
  });
});

// --- Assignment fixtures ---

const MATCH_API_ID = 1000;

interface AssignmentWorld {
  matchId: number;
  refereeIds: Map<number, number>;
  roleIds: Map<number, number>;
  matchIds: Map<number, number>;
}

/**
 * Seed a league, two teams, one match, two referees and two roles, and return the
 * three lookup maps `syncRefereeAssignmentsFromData` takes.
 */
async function seedAssignmentWorld(): Promise<AssignmentWorld> {
  const seasonRefId = await seedActiveSeason(ctx);
  await ctx.db.insert(leagues).values({
    id: 10,
    apiLigaId: 1,
    ligaNr: 1,
    name: "Bezirksliga",
    seasonId: 2025,
    seasonName: "2025/26",
    seasonRefId,
  });
  await ctx.db.insert(teams).values([
    { apiTeamPermanentId: 10, seasonTeamId: 100, teamCompetitionId: 1, name: "Home", clubId: 1 },
    { apiTeamPermanentId: 20, seasonTeamId: 200, teamCompetitionId: 2, name: "Guest", clubId: 2 },
  ]);
  const [match] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: MATCH_API_ID,
      matchNo: 7,
      matchDay: 1,
      kickoffDate: "2025-01-15",
      kickoffTime: "18:00:00",
      leagueId: 10,
      homeTeamApiId: 10,
      guestTeamApiId: 20,
      currentRemoteVersion: 3,
    })
    .returning();

  const refRows = await ctx.db
    .insert(referees)
    .values([
      { apiId: 100, firstName: "John", lastName: "Doe", licenseNumber: 1 },
      { apiId: 200, firstName: "Jane", lastName: "Roe", licenseNumber: 2 },
    ])
    .returning();
  const roleRows = await ctx.db
    .insert(refereeRoles)
    .values([
      { apiId: 1, name: "1. Schiedsrichter", shortName: "1. SR" },
      { apiId: 2, name: "2. Schiedsrichter", shortName: "2. SR" },
    ])
    .returning();

  return {
    matchId: match!.id,
    refereeIds: new Map(refRows.map((r) => [r.apiId, r.id])),
    roleIds: new Map(roleRows.map((r) => [r.apiId, r.id])),
    matchIds: new Map([[MATCH_API_ID, match!.id]]),
  };
}

function makeAssignment(
  overrides: Partial<ExtractedRefereeAssignment> = {},
): ExtractedRefereeAssignment {
  return {
    matchApiId: MATCH_API_ID,
    schiedsrichterId: 100,
    schirirolleId: 1,
    slotNumber: 1,
    ...overrides,
  };
}

function runAssignments(
  world: AssignmentWorld,
  assignments: ExtractedRefereeAssignment[],
  syncLogger?: unknown,
  syncRunId?: number | null,
) {
  return syncRefereeAssignmentsFromData(
    assignments,
    world.refereeIds,
    world.roleIds,
    world.matchIds,
    syncLogger as never,
    syncRunId,
  );
}

async function assignmentRows() {
  return ctx.db.select().from(matchReferees).orderBy(matchReferees.id);
}

async function liveAssignments() {
  return (await assignmentRows()).filter((r) => r.removedAt === null);
}

describe("syncRefereeAssignmentsFromData", () => {
  it("returns an empty result for no assignments", async () => {
    const world = await seedAssignmentWorld();

    const result = await runAssignments(world, []);

    expect(result).toEqual({ created: 0, errors: [] });
    expect(await assignmentRows()).toEqual([]);
  });

  it("filters out assignments whose match/referee/role cannot be resolved", async () => {
    const world = await seedAssignmentWorld();

    const result = await runAssignments(world, [
      makeAssignment({ matchApiId: 999_999 }),
      makeAssignment({ schiedsrichterId: 999 }),
      makeAssignment({ schirirolleId: 999 }),
    ]);

    expect(result.created).toBe(0);
    expect(await assignmentRows()).toEqual([]);
  });

  it("creates a new assignment row and records it in the match history", async () => {
    const world = await seedAssignmentWorld();

    const result = await runAssignments(world, [makeAssignment()], undefined, 5);

    expect(result.created).toBe(1);
    const rows = await liveAssignments();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      matchId: world.matchId,
      refereeId: world.refereeIds.get(100),
      roleId: world.roleIds.get(1),
      slotNumber: 1,
      removedAt: null,
    });

    const [change] = await ctx.db.select().from(matchChanges);
    expect(change).toMatchObject({
      matchId: world.matchId,
      track: "remote",
      versionNumber: 3, // the match's currentRemoteVersion
      fieldName: "referee_slot_1",
      oldValue: null,
      newValue: "John Doe (1. Schiedsrichter)",
    });
  });

  it("leaves an unchanged assignment alone", async () => {
    const world = await seedAssignmentWorld();
    await runAssignments(world, [makeAssignment()]);
    const [before] = await liveAssignments();

    const result = await runAssignments(world, [makeAssignment()]);

    expect(result.created).toBe(0);
    const rows = await liveAssignments();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(before!.id);
    // Only the first run wrote history.
    expect(await ctx.db.select().from(matchChanges)).toHaveLength(1);
  });

  it("updates the slot in place when the referee and role change", async () => {
    const world = await seedAssignmentWorld();
    await runAssignments(world, [makeAssignment()]);
    const [before] = await liveAssignments();

    const result = await runAssignments(world, [
      makeAssignment({ schiedsrichterId: 200, schirirolleId: 2 }),
    ]);

    expect(result.created).toBe(0);
    const rows = await liveAssignments();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(before!.id);
    expect(rows[0]!.refereeId).toBe(world.refereeIds.get(200));
    expect(rows[0]!.roleId).toBe(world.roleIds.get(2));

    const changes = await ctx.db.select().from(matchChanges).orderBy(matchChanges.id);
    expect(changes).toHaveLength(2);
    expect(changes[1]).toMatchObject({
      fieldName: "referee_slot_1",
      oldValue: "John Doe (2. Schiedsrichter)",
      newValue: "Jane Roe (2. Schiedsrichter)",
    });
  });

  it("keys existing assignments by slot, so two slots on one match are independent", async () => {
    const world = await seedAssignmentWorld();

    const result = await runAssignments(world, [
      makeAssignment({ slotNumber: 1, schiedsrichterId: 100, schirirolleId: 1 }),
      makeAssignment({ slotNumber: 2, schiedsrichterId: 200, schirirolleId: 2 }),
    ]);

    expect(result.created).toBe(2);
    const rows = await liveAssignments();
    expect(rows.map((r) => r.slotNumber)).toEqual([1, 2]);
    expect(rows.map((r) => r.refereeId)).toEqual([
      world.refereeIds.get(100),
      world.refereeIds.get(200),
    ]);
  });

  it("does not resurrect a tombstoned row — a returning referee gets a fresh one", async () => {
    const world = await seedAssignmentWorld();
    await runAssignments(world, [makeAssignment()]);
    const [original] = await liveAssignments();
    await ctx.db
      .update(matchReferees)
      .set({ removedAt: new Date("2025-05-01T00:00:00Z") })
      .where(eq(matchReferees.id, original!.id));

    const result = await runAssignments(world, [makeAssignment()]);

    expect(result.created).toBe(1);
    const rows = await assignmentRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.removedAt).not.toBeNull();
    expect(rows[1]!.removedAt).toBeNull();
    expect(rows[1]!.id).not.toBe(original!.id);
  });

  it("reports a failure when the assignment write is rejected", async () => {
    const world = await seedAssignmentWorld();
    failTransactionWith(new Error("Insert failed"));
    const mockLogger = { log: vi.fn() };

    const result = await runAssignments(world, [makeAssignment()], mockLogger);

    expect(result.errors[0]).toContain("Failed to sync assignment for match");
    expect(result.errors[0]).toContain("Insert failed");
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "referee", action: "failed" }),
    );
  });

  it("reports a non-Error failure as 'Unknown error'", async () => {
    const world = await seedAssignmentWorld();
    failTransactionWith("string error");

    const result = await runAssignments(world, [makeAssignment()]);

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("logs the created assignment to the sync logger", async () => {
    const world = await seedAssignmentWorld();
    const mockLogger = { log: vi.fn() };

    await runAssignments(world, [makeAssignment()], mockLogger);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "referee",
        action: "created",
        entityId: `${world.matchId}-${world.refereeIds.get(100)}-${world.roleIds.get(1)}`,
      }),
    );
  });

  it("emits referee.assigned with the resolved names and syncRunId", async () => {
    const world = await seedAssignmentWorld();

    await runAssignments(world, [makeAssignment()], undefined, 42);

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "referee.assigned",
        source: "sync",
        entityType: "referee",
        entityId: world.matchId,
        entityName: "Match #7",
        deepLinkPath: `/admin/matches/${world.matchId}`,
        syncRunId: 42,
        payload: expect.objectContaining({
          matchNo: 7,
          homeTeam: "10",
          guestTeam: "20",
          refereeName: "John Doe",
          role: "1. Schiedsrichter",
          refereeId: world.refereeIds.get(100),
          teamIds: [10, 20],
        }),
      }),
      // Published with the transaction client: the event commits with the
      // assignment (issue #77).
      expect.anything(),
    );
  });

  it("passes a null syncRunId when none is provided", async () => {
    const world = await seedAssignmentWorld();

    await runAssignments(world, [makeAssignment()]);

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "referee.assigned", syncRunId: null }),
      expect.anything(),
    );
  });

  it("emits referee.reassigned with both referee names", async () => {
    const world = await seedAssignmentWorld();
    await runAssignments(world, [makeAssignment()]);
    mockPublishDomainEvent.mockClear();

    await runAssignments(world, [makeAssignment({ schiedsrichterId: 200 })], undefined, 42);

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "referee.reassigned",
        syncRunId: 42,
        payload: expect.objectContaining({
          oldRefereeName: "John Doe",
          newRefereeName: "Jane Roe",
          oldRefereeId: world.refereeIds.get(100),
          newRefereeId: world.refereeIds.get(200),
        }),
      }),
      expect.anything(),
    );
  });

  it("does not emit referee.reassigned when only the role changed", async () => {
    const world = await seedAssignmentWorld();
    await runAssignments(world, [makeAssignment()]);
    mockPublishDomainEvent.mockClear();

    await runAssignments(world, [makeAssignment({ schirirolleId: 2 })]);

    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
    expect((await liveAssignments())[0]!.roleId).toBe(world.roleIds.get(2));
  });

  it("rolls the assignment back when referee.assigned cannot be recorded (#77)", async () => {
    const world = await seedAssignmentWorld();
    mockPublishDomainEvent.mockRejectedValue(new Error("Event failed"));

    const result = await runAssignments(world, [makeAssignment()]);

    // The assignment, its history entry and the event are one unit of work.
    // Storing the assignment while losing the event left a referee assigned
    // that nobody was ever told about, with no outbox row to recover from; the
    // failure is now reported and the next sync retries the whole thing.
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(await liveAssignments()).toEqual([]);
    expect(await ctx.db.select().from(matchChanges)).toEqual([]);
  });

  it("rolls the reassignment back when referee.reassigned cannot be recorded (#77)", async () => {
    const world = await seedAssignmentWorld();
    await runAssignments(world, [makeAssignment()]);
    mockPublishDomainEvent.mockRejectedValue(new Error("Event failed"));

    const result = await runAssignments(world, [makeAssignment({ schiedsrichterId: 200 })]);

    expect(result.errors).toHaveLength(1);
    // The slot still holds the original referee.
    expect((await liveAssignments())[0]!.refereeId).toBe(world.refereeIds.get(100));
  });

  it("emits nothing when the lookup points at a match that does not exist", async () => {
    const world = await seedAssignmentWorld();
    world.matchIds.set(MATCH_API_ID, 999_999);

    const result = await runAssignments(world, [makeAssignment()]);

    // The FK rejects the write, so neither history nor an event is produced.
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
    expect(await ctx.db.select().from(matchChanges)).toEqual([]);
  });

  it("rolls the assignment back when the match-history write fails (#77)", async () => {
    const world = await seedAssignmentWorld();

    const result = await withFailingMatchChangesInsert(() =>
      runAssignments(world, [makeAssignment()]),
    );

    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    // The slot write is rolled back with the history write that failed after
    // it, rather than surviving as an assignment with no recorded provenance.
    expect(await liveAssignments()).toEqual([]);
  });

  it("rolls the reassignment back when the history write fails (#77)", async () => {
    const world = await seedAssignmentWorld();
    await runAssignments(world, [makeAssignment()]);

    const result = await withFailingMatchChangesInsert(() =>
      runAssignments(world, [makeAssignment({ schiedsrichterId: 200 })]),
    );

    expect(result.errors).toHaveLength(1);
    expect((await liveAssignments())[0]!.refereeId).toBe(world.refereeIds.get(100));
  });
});

describe("buildMatchIdLookup", () => {
  it("returns a map from apiMatchId to the generated row id", async () => {
    const world = await seedAssignmentWorld();

    const lookup = await buildMatchIdLookup();

    expect(lookup.size).toBe(1);
    expect(lookup.get(MATCH_API_ID)).toBe(world.matchId);
  });

  it("returns an empty map when there are no matches", async () => {
    expect((await buildMatchIdLookup()).size).toBe(0);
  });
});

/**
 * `confirmIntentsFromSync` returns `result.rowCount`, which the production
 * node-postgres driver supplies. The pglite driver returns `affectedRows`
 * instead, so under test the return value is always 0 — assert on the rows the
 * UPDATE actually touched, and cover the `?? 0` fallback with a stubbed
 * `execute` below.
 */
async function confirmedIntentIds(): Promise<number[]> {
  const rows = await ctx.db
    .select()
    .from(refereeAssignmentIntents)
    .orderBy(refereeAssignmentIntents.id);
  return rows.filter((r) => r.confirmedBySyncAt !== null).map((r) => r.id);
}

describe("confirmIntentsFromSync", () => {
  it("confirms only the intents backed by a live assignment in the same slot", async () => {
    const world = await seedAssignmentWorld();
    const refA = world.refereeIds.get(100)!;
    const refB = world.refereeIds.get(200)!;
    await ctx.db.insert(matchReferees).values({
      matchId: world.matchId,
      refereeId: refA,
      roleId: world.roleIds.get(1)!,
      slotNumber: 1,
    });
    await ctx.db.insert(refereeAssignmentIntents).values([
      { matchId: world.matchId, refereeId: refA, slotNumber: 1 }, // matches
      { matchId: world.matchId, refereeId: refA, slotNumber: 2 }, // wrong slot
      { matchId: world.matchId, refereeId: refB, slotNumber: 1 }, // wrong referee
    ]);

    await confirmIntentsFromSync();

    const rows = await ctx.db
      .select()
      .from(refereeAssignmentIntents)
      .orderBy(refereeAssignmentIntents.id);
    expect(rows[0]!.confirmedBySyncAt).not.toBeNull();
    expect(rows[1]!.confirmedBySyncAt).toBeNull(); // wrong slot
    expect(rows[2]!.confirmedBySyncAt).toBeNull(); // wrong referee
    expect(await confirmedIntentIds()).toEqual([rows[0]!.id]);
  });

  it("does not confirm an intent backed only by a tombstoned assignment", async () => {
    const world = await seedAssignmentWorld();
    const refA = world.refereeIds.get(100)!;
    await ctx.db.insert(matchReferees).values({
      matchId: world.matchId,
      refereeId: refA,
      roleId: world.roleIds.get(1)!,
      slotNumber: 1,
      removedAt: new Date("2025-05-01T00:00:00Z"),
    });
    await ctx.db
      .insert(refereeAssignmentIntents)
      .values({ matchId: world.matchId, refereeId: refA, slotNumber: 1 });

    await confirmIntentsFromSync();

    expect(await confirmedIntentIds()).toEqual([]);
  });

  it("does not re-confirm an already confirmed intent", async () => {
    const world = await seedAssignmentWorld();
    const refA = world.refereeIds.get(100)!;
    await ctx.db.insert(matchReferees).values({
      matchId: world.matchId,
      refereeId: refA,
      roleId: world.roleIds.get(1)!,
      slotNumber: 1,
    });
    await ctx.db.insert(refereeAssignmentIntents).values({
      matchId: world.matchId,
      refereeId: refA,
      slotNumber: 1,
      confirmedBySyncAt: new Date("2025-05-01T00:00:00Z"),
    });

    await confirmIntentsFromSync();

    const [row] = await ctx.db.select().from(refereeAssignmentIntents);
    expect(row!.confirmedBySyncAt!.toISOString()).toBe("2025-05-01T00:00:00.000Z");
  });

  it("returns 0 when there are no intents at all", async () => {
    await seedAssignmentWorld();

    expect(await confirmIntentsFromSync()).toBe(0);
  });

  it("treats a null rowCount as 0", async () => {
    overrideDbMethod("execute", async () => ({ rowCount: null }));

    expect(await confirmIntentsFromSync()).toBe(0);
  });

  it("treats an undefined rowCount as 0", async () => {
    overrideDbMethod("execute", async () => ({}));

    expect(await confirmIntentsFromSync()).toBe(0);
  });
});
