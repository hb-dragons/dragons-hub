import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// --- Mock setup ---

vi.mock("../../workers/instance-heartbeat", () => ({
  INSTANCE_ID: "TEST_INSTANCE_ID",
}));

const mockSyncLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => mockSyncLogger,
  },
}));

// Real Postgres (pglite) with real migrations and the real `eq` operator, so the
// sync_runs lifecycle (create → running → completed/partial/failed) is asserted
// against actual rows. The previous mocked-ORM version stubbed `eq` to a bare
// `vi.fn()` and inspected `.set()` call arguments, so `where(eq(syncRuns.id, ...))`
// never ran — pointing the completion UPDATE at the wrong row was invisible.
//
// The sub-syncs stay mocked on purpose: this file tests orchestration (step order,
// error classification, result aggregation), not the sub-syncs' own SQL.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

const mockPublishDomainEvent = vi.fn();
vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: (...args: unknown[]) => mockPublishDomainEvent(...args),
}));

const mockSyncLeagues = vi.fn();
vi.mock("./leagues.sync", () => ({
  syncLeagues: (...args: unknown[]) => mockSyncLeagues(...args),
}));

const mockSyncTeams = vi.fn();
vi.mock("./teams.sync", () => ({
  syncTeamsFromData: (...args: unknown[]) => mockSyncTeams(...args),
}));

const mockSyncMatches = vi.fn();
vi.mock("./matches.sync", () => ({
  syncMatchesFromData: (...args: unknown[]) => mockSyncMatches(...args),
}));

const mockSyncStandings = vi.fn();
vi.mock("./standings.sync", () => ({
  syncStandingsFromData: (...args: unknown[]) => mockSyncStandings(...args),
}));

const mockSyncVenues = vi.fn();
const mockBuildVenueLookup = vi.fn();
vi.mock("./venues.sync", () => ({
  syncVenuesFromData: (...args: unknown[]) => mockSyncVenues(...args),
  buildVenueIdLookup: (...args: unknown[]) => mockBuildVenueLookup(...args),
}));

const mockSyncReferees = vi.fn();
const mockSyncRoles = vi.fn();
const mockSyncAssignments = vi.fn();
const mockRemoveAssignments = vi.fn();
const mockBuildMatchLookup = vi.fn();
const mockConfirmIntents = vi.fn();
vi.mock("./referees.sync", () => ({
  syncRefereesFromData: (...args: unknown[]) => mockSyncReferees(...args),
  syncRefereeRolesFromData: (...args: unknown[]) => mockSyncRoles(...args),
  syncRefereeAssignmentsFromData: (...args: unknown[]) => mockSyncAssignments(...args),
  removeStaleRefereeAssignments: (...args: unknown[]) => mockRemoveAssignments(...args),
  buildMatchIdLookup: (...args: unknown[]) => mockBuildMatchLookup(...args),
  confirmIntentsFromSync: (...args: unknown[]) => mockConfirmIntents(...args),
}));

const mockSyncTeamEntries = vi.fn();
vi.mock("./team-entries.sync", () => ({
  syncTeamEntriesFromData: (...args: unknown[]) => mockSyncTeamEntries(...args),
}));

const mockCreateSyncLogger = vi.fn();
vi.mock("./sync-logger", () => ({
  createSyncLogger: (...args: unknown[]) => mockCreateSyncLogger(...args),
}));

const mockFetchAllSyncData = vi.fn();
const mockExtractAssignments = vi.fn();
vi.mock("./data-fetcher", () => ({
  fetchAllSyncData: (...args: unknown[]) => mockFetchAllSyncData(...args),
  extractRefereeAssignments: (...args: unknown[]) => mockExtractAssignments(...args),
}));

const mockReconcileAfterSync = vi.fn();
vi.mock("../venue-booking/venue-booking.service", () => ({
  reconcileAfterSync: (...args: unknown[]) => mockReconcileAfterSync(...args),
}));

import { fullSync } from "./index";
import { syncRuns } from "@dragons/db/schema";
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

afterAll(async () => {
  await closeTestDb(ctx);
});

/** Every sync_runs row, oldest first. */
async function syncRunRows() {
  return ctx.db.select().from(syncRuns).orderBy(syncRuns.id);
}

async function syncRunRow(id: number) {
  const [row] = await ctx.db.select().from(syncRuns).where(eq(syncRuns.id, id));
  return row;
}

/** Seed a sync_runs row the way the eager-creation path does. */
async function seedSyncRun(overrides: Partial<typeof syncRuns.$inferInsert> = {}) {
  const [row] = await ctx.db
    .insert(syncRuns)
    .values({
      syncType: "full",
      triggeredBy: "manual",
      status: "pending",
      startedAt: new Date("2025-01-01T00:00:00Z"),
      ...overrides,
    })
    .returning();
  return row!;
}

beforeEach(async () => {
  await resetTestDb(ctx);
  dbHolder.ref = ctx.db;
  vi.clearAllMocks();

  mockPublishDomainEvent.mockResolvedValue(undefined);

  mockCreateSyncLogger.mockReturnValue({
    close: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    getDroppedEntryCount: vi.fn().mockReturnValue(0),
  });

  mockSyncLeagues.mockResolvedValue({
    total: 2, created: 1, updated: 1, skipped: 0, failed: 0, errors: [], durationMs: 100,
  });

  mockFetchAllSyncData.mockResolvedValue({
    leagueData: [],
    teams: new Map(),
    venues: new Map(),
    referees: new Map(),
    refereeRoles: new Map(),
  });

  mockSyncTeams.mockResolvedValue({
    total: 5, created: 3, updated: 2, skipped: 0, failed: 0, errors: [], durationMs: 50,
  });

  mockSyncVenues.mockResolvedValue({
    total: 3, created: 2, updated: 1, skipped: 0, failed: 0, errors: [], durationMs: 30,
  });

  mockSyncReferees.mockResolvedValue({
    created: 1, updated: 1, skipped: 0, refereeIdLookup: new Map(), errors: [],
  });

  mockSyncRoles.mockResolvedValue({
    created: 1, updated: 1, skipped: 0, failed: 0, errors: [], roleIdLookup: new Map(),
  });

  mockSyncStandings.mockResolvedValue({
    total: 10, created: 5, updated: 5, skipped: 0, failed: 0, errors: [], durationMs: 40,
  });

  mockSyncTeamEntries.mockResolvedValue({
    total: 0, created: 0, moved: 0, unchanged: 0, supersededManual: 0, kept: 0, conflicts: 0,
    errors: [], durationMs: 5,
  });

  mockBuildVenueLookup.mockResolvedValue(new Map());
  mockBuildMatchLookup.mockResolvedValue(new Map());

  mockSyncMatches.mockResolvedValue({
    total: 20, created: 10, updated: 5, skipped: 5, failed: 0, errors: [], durationMs: 200,
  });

  mockExtractAssignments.mockReturnValue([]);
  mockSyncAssignments.mockResolvedValue({ created: 0, errors: [] });
  mockRemoveAssignments.mockResolvedValue({ removed: 0, skipped: false, reason: null, errors: [] });
  mockConfirmIntents.mockResolvedValue(0);

  mockReconcileAfterSync.mockResolvedValue(undefined);
});

describe("fullSync", () => {
  describe("sync pipeline", () => {
    it("completes a successful full sync and persists the run", async () => {
      const result = await fullSync("manual");

      expect(result.status).toBe("completed");
      expect(result.triggeredBy).toBe("manual");
      expect(result.leagues.created).toBe(1);
      expect(result.teams.created).toBe(3);
      expect(result.matches.created).toBe(10);

      const rows = await syncRunRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(result.syncRunId);
      expect(rows[0]!.status).toBe("completed");
      expect(rows[0]!.syncType).toBe("full");
      expect(rows[0]!.triggeredBy).toBe("manual");
      expect(rows[0]!.completedAt).not.toBeNull();
      expect(rows[0]!.errorMessage).toBeNull();
      expect(rows[0]!.failedStep).toBeNull();
      // 1 league + 3 teams + 10 matches + 5 standings + 2 venues + 1 referee + 1 role
      expect(rows[0]!.recordsCreated).toBe(23);
      expect(rows[0]!.recordsUpdated).toBe(1 + 2 + 5 + 5 + 1 + 1 + 1);
      expect(rows[0]!.summary).toMatchObject({
        leagues: { total: 2, created: 1, updated: 1, skipped: 0 },
        teams: { total: 5, created: 3, updated: 2, skipped: 0 },
      });
    });

    it("creates a sync run record stamped with this instance", async () => {
      const result = await fullSync("cron");

      const row = await syncRunRow(result.syncRunId);
      expect(row).toBeDefined();
      expect(row!.ownerInstanceId).toBe("TEST_INSTANCE_ID");
      expect(row!.triggeredBy).toBe("cron");
    });

    it("reuses the eagerly-created sync run when syncRunId is provided", async () => {
      const existing = await seedSyncRun({ status: "pending" });
      const bystander = await seedSyncRun({ status: "pending", triggeredBy: "cron" });

      const result = await fullSync("manual", undefined, existing.id);

      expect(result.syncRunId).toBe(existing.id);
      // No extra run row was inserted.
      expect(await syncRunRows()).toHaveLength(2);

      const row = await syncRunRow(existing.id);
      expect(row!.status).toBe("completed");
      expect(row!.ownerInstanceId).toBe("TEST_INSTANCE_ID");
      // The `where(eq(syncRuns.id, ...))` really targeted one row.
      expect((await syncRunRow(bystander.id))!.status).toBe("pending");
      expect((await syncRunRow(bystander.id))!.ownerInstanceId).toBeNull();
    });

    it("throws when the supplied syncRunId matches no row", async () => {
      await expect(fullSync("manual", undefined, 999)).rejects.toThrow(
        "Failed to update sync run",
      );
      expect(await syncRunRows()).toHaveLength(0);
    });

    it("updates the sync run record on completion", async () => {
      const result = await fullSync("manual");

      const row = await syncRunRow(result.syncRunId);
      expect(row!.status).toBe("completed");
      expect(row!.durationMs).toBeGreaterThanOrEqual(0);
      expect(row!.recordsFailed).toBe(0);
    });

    it("logs a warning when the completion update matches no rows", async () => {
      // The run row disappears mid-sync (e.g. an admin purge), so the completion
      // UPDATE legitimately matches nothing.
      let deletedId: number | undefined;
      mockReconcileAfterSync.mockImplementation(async () => {
        const [row] = await syncRunRows();
        deletedId = row!.id;
        await ctx.db.delete(syncRuns).where(eq(syncRuns.id, row!.id));
      });

      await fullSync("manual");

      expect(mockSyncLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ syncRunId: deletedId }),
        "Completion update did not match any rows",
      );
    });

    it("reports team-entry supersessions and conflicts as sync steps", async () => {
      mockSyncTeamEntries.mockResolvedValue({
        total: 3, created: 0, moved: 1, unchanged: 1, supersededManual: 1, kept: 1, conflicts: 1,
        errors: [], durationMs: 5,
      });

      await fullSync("manual");

      const messages = mockSyncLogger.info.mock.calls.map((c) => String(c[0]));
      expect(messages).toContain(
        "Superseded 1 manual league links with federation evidence",
      );
      expect(messages.some((m) => m.includes("appeared in more than one league of a season"))).toBe(true);
    });

    it("says nothing about team entries when the run is unambiguous", async () => {
      await fullSync("manual");

      const messages = mockSyncLogger.info.mock.calls.map((c) => String(c[0]));
      expect(messages.some((m) => m.includes("more than one league"))).toBe(false);
      expect(messages.some((m) => m.includes("Superseded"))).toBe(false);
    });

    it("calls all sync steps in order", async () => {
      await fullSync("manual");

      expect(mockSyncLeagues).toHaveBeenCalled();
      expect(mockFetchAllSyncData).toHaveBeenCalled();
      expect(mockSyncTeams).toHaveBeenCalled();
      expect(mockSyncVenues).toHaveBeenCalled();
      expect(mockSyncReferees).toHaveBeenCalled();
      expect(mockSyncRoles).toHaveBeenCalled();
      expect(mockSyncStandings).toHaveBeenCalled();
      expect(mockBuildVenueLookup).toHaveBeenCalled();
      expect(mockSyncMatches).toHaveBeenCalled();
      expect(mockExtractAssignments).toHaveBeenCalled();
      expect(mockBuildMatchLookup).toHaveBeenCalled();
      expect(mockSyncAssignments).toHaveBeenCalled();
    });

    it("does not start standings until teams sync has resolved (FK ordering, issue #47)", async () => {
      // standings.teamApiId has a non-deferrable FK on teams.apiTeamPermanentId, so the
      // standings INSERT must run only after teams have committed. Running both in the
      // same Step-3 Promise.all raced the teams upsert and dropped the whole standings
      // batch on a league's first sync.
      const events: string[] = [];
      let resolveTeams!: (value: unknown) => void;

      mockSyncTeams.mockImplementation(() => {
        events.push("teams:start");
        return new Promise((resolve) => {
          resolveTeams = (value) => {
            events.push("teams:resolve");
            resolve(value);
          };
        });
      });

      mockSyncStandings.mockImplementation(() => {
        events.push("standings:start");
        return Promise.resolve({
          total: 10, created: 5, updated: 5, skipped: 0, failed: 0, errors: [], durationMs: 40,
        });
      });

      const syncPromise = fullSync("manual");

      // Flush all pending microtasks so the orchestrator reaches (and runs past) Step 3.
      // Teams is still pending, so if standings runs concurrently it gets invoked here.
      await new Promise((resolve) => setImmediate(resolve));

      expect(events).toContain("teams:start");
      expect(events).not.toContain("standings:start");

      resolveTeams({
        total: 5, created: 3, updated: 2, skipped: 0, failed: 0, errors: [], durationMs: 50,
      });
      await syncPromise;

      expect(events).toContain("standings:start");
      expect(events.indexOf("standings:start")).toBeGreaterThan(events.indexOf("teams:resolve"));
    });

    it("calls the jobLogger", async () => {
      const jobLogger = vi.fn();

      await fullSync("manual", jobLogger);

      expect(jobLogger).toHaveBeenCalled();
    });

    it("collects errors from all steps", async () => {
      mockSyncLeagues.mockResolvedValue({
        total: 0, created: 0, updated: 0, skipped: 0, failed: 0,
        errors: ["league error"], durationMs: 0,
      });
      mockSyncTeams.mockResolvedValue({
        total: 0, created: 0, updated: 0, skipped: 0, failed: 0,
        errors: ["team error"], durationMs: 0,
      });

      const result = await fullSync("manual");

      expect(result.totalErrors).toContain("league error");
      expect(result.totalErrors).toContain("team error");
    });

    // Regression: rolesRes was the only one of the five entity results whose
    // errors were never pushed into allErrors, so a total role-sync failure
    // finished the run as "completed" with recordsFailed 0 and no errorMessage.
    it("collects errors from the role sync step", async () => {
      mockSyncRoles.mockResolvedValue({
        created: 0, updated: 0, skipped: 0, failed: 3,
        errors: ["Batch role sync failed: DB error"], roleIdLookup: new Map(),
      });

      const result = await fullSync("manual");

      expect(result.totalErrors).toContain("Batch role sync failed: DB error");

      const [row] = await ctx.db.select().from(syncRuns);
      expect(row!.recordsFailed).toBe(1);
      expect(row!.errorMessage).toBe("Batch role sync failed: DB error");
    });

    it("handles fatal error during sync", async () => {
      mockSyncLeagues.mockRejectedValue(new Error("Fatal crash"));

      const result = await fullSync("manual");

      expect(result.status).toBe("failed");
      expect(result.totalErrors[0]).toContain("Fatal sync error");
    });

    it("handles non-Error fatal exception", async () => {
      mockSyncLeagues.mockRejectedValue("string crash");

      const result = await fullSync("manual");

      expect(result.status).toBe("failed");
      expect(result.totalErrors[0]).toContain("Unknown error");
    });

    it("sets status=partial and failedStep when a step fails after a write has committed", async () => {
      // Step 1 (leagues) succeeds → committedAny = true
      // Step 2 (fetch) is read-only
      // Step 3 (entities) throws → failedStep = "entities"
      mockSyncTeams.mockRejectedValue(new Error("Entity crash mid-run"));

      const result = await fullSync("manual");

      expect(result.status).toBe("partial");
      const row = await syncRunRow(result.syncRunId);
      expect(row!.status).toBe("partial");
      expect(row!.failedStep).toBe("entities");
      expect(row!.errorMessage).toBe("Entity crash mid-run");
      expect(row!.errorStack).toContain("Entity crash mid-run");
      expect(row!.completedAt).not.toBeNull();
    });

    it("sets status=failed and failedStep when the first step fails (no writes committed)", async () => {
      // Step 1 (leagues) throws immediately → committedAny = false
      mockSyncLeagues.mockRejectedValue(new Error("Leagues crash on first step"));

      const result = await fullSync("manual");

      expect(result.status).toBe("failed");
      const row = await syncRunRow(result.syncRunId);
      expect(row!.status).toBe("failed");
      expect(row!.failedStep).toBe("leagues");
      expect(row!.errorMessage).toBe("Leagues crash on first step");
    });

    it("closes sync logger on success", async () => {
      const mockLogger = {
        close: vi.fn().mockResolvedValue(undefined),
        log: vi.fn(),
        getDroppedEntryCount: vi.fn().mockReturnValue(0),
      };
      mockCreateSyncLogger.mockReturnValue(mockLogger);

      await fullSync("manual");

      expect(mockLogger.close).toHaveBeenCalled();
    });

    it("closes sync logger on failure", async () => {
      const mockLogger = {
        close: vi.fn().mockResolvedValue(undefined),
        log: vi.fn(),
        getDroppedEntryCount: vi.fn().mockReturnValue(0),
      };
      mockCreateSyncLogger.mockReturnValue(mockLogger);
      mockSyncLeagues.mockRejectedValue(new Error("crash"));

      await fullSync("manual");

      expect(mockLogger.close).toHaveBeenCalled();
    });

    it("throws when sync run creation returns no row", async () => {
      const real = ctx.db as unknown as Record<string | symbol, unknown>;
      dbHolder.ref = new Proxy(
        {},
        {
          get: (_t, prop) =>
            prop === "insert"
              ? () => ({ values: () => ({ returning: async () => [] }) })
              : real[prop],
        },
      );

      await expect(fullSync("manual")).rejects.toThrow("Failed to create sync run");
    });

    it("returns zero counts on fatal failure", async () => {
      mockSyncLeagues.mockRejectedValue(new Error("crash"));

      const result = await fullSync("manual");

      expect(result.leagues.created).toBe(0);
      expect(result.teams.created).toBe(0);
      expect(result.matches.created).toBe(0);
      expect(result.referees.assignmentsCreated).toBe(0);
      expect(result.referees.rolesCreated).toBe(0);
      expect(result.referees.rolesUpdated).toBe(0);
      expect(result.referees.rolesSkipped).toBe(0);
    });

    it("includes durationMs", async () => {
      const result = await fullSync("manual");

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("publishes sync.completed with the persisted run id", async () => {
      const result = await fullSync("manual");

      expect(mockPublishDomainEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "sync.completed",
          source: "sync",
          syncRunId: result.syncRunId,
          deepLinkPath: `/admin/sync/logs/${result.syncRunId}`,
          payload: expect.objectContaining({
            syncRunId: result.syncRunId,
            syncType: "full",
            recordsFailed: 0,
          }),
        }),
      );
    });

    it("completes the run even when the sync.completed event fails to publish", async () => {
      mockPublishDomainEvent.mockRejectedValue(new Error("queue down"));

      const result = await fullSync("manual");

      expect(result.status).toBe("completed");
      expect((await syncRunRow(result.syncRunId))!.status).toBe("completed");
    });

    it("aggregates referee stats", async () => {
      mockSyncReferees.mockResolvedValue({
        created: 2, updated: 1, skipped: 0, refereeIdLookup: new Map(), errors: [],
      });
      mockSyncRoles.mockResolvedValue({ created: 1, updated: 2, skipped: 1, failed: 0, errors: [], roleIdLookup: new Map() });
      mockSyncAssignments.mockResolvedValue({ created: 5, errors: [] });

      const result = await fullSync("manual");

      expect(result.referees.created).toBe(2);
      expect(result.referees.updated).toBe(1);
      expect(result.referees.rolesCreated).toBe(1);
      expect(result.referees.rolesUpdated).toBe(2);
      expect(result.referees.rolesSkipped).toBe(1);
      expect(result.referees.assignmentsCreated).toBe(5);
    });

    it("calls venue booking reconciliation after sync steps", async () => {
      await fullSync("manual");

      expect(mockReconcileAfterSync).toHaveBeenCalled();
    });

    it("collects error when venue booking reconciliation fails", async () => {
      mockReconcileAfterSync.mockRejectedValue(new Error("Booking DB error"));

      const result = await fullSync("manual");

      expect(result.status).toBe("completed");
      expect(result.totalErrors).toContain(
        "Venue booking reconciliation failed: Booking DB error",
      );
    });

    it("handles non-Error venue booking reconciliation failure", async () => {
      mockReconcileAfterSync.mockRejectedValue("string error");

      const result = await fullSync("manual");

      expect(result.status).toBe("completed");
      expect(result.totalErrors).toContain(
        "Venue booking reconciliation failed: Unknown error",
      );
    });
  });
});
