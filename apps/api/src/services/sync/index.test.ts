import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

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

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  syncRuns: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
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
const mockBuildMatchLookup = vi.fn();
const mockConfirmIntents = vi.fn();
vi.mock("./referees.sync", () => ({
  syncRefereesFromData: (...args: unknown[]) => mockSyncReferees(...args),
  syncRefereeRolesFromData: (...args: unknown[]) => mockSyncRoles(...args),
  syncRefereeAssignmentsFromData: (...args: unknown[]) => mockSyncAssignments(...args),
  buildMatchIdLookup: (...args: unknown[]) => mockBuildMatchLookup(...args),
  confirmIntentsFromSync: (...args: unknown[]) => mockConfirmIntents(...args),
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

beforeEach(() => {
  vi.clearAllMocks();

  // Setup default mock implementations for the happy path
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    }),
  });
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(
        Object.assign(Promise.resolve(undefined), {
          returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      ),
    }),
  });

  mockCreateSyncLogger.mockReturnValue({
    close: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
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
    created: 1, updated: 1, skipped: 0, failed: 0, roleIdLookup: new Map(),
  });

  mockSyncStandings.mockResolvedValue({
    total: 10, created: 5, updated: 5, skipped: 0, failed: 0, errors: [], durationMs: 40,
  });

  mockBuildVenueLookup.mockResolvedValue(new Map());
  mockBuildMatchLookup.mockResolvedValue(new Map());

  mockSyncMatches.mockResolvedValue({
    total: 20, created: 10, updated: 5, skipped: 5, failed: 0, errors: [], durationMs: 200,
  });

  mockExtractAssignments.mockReturnValue([]);
  mockSyncAssignments.mockResolvedValue({ created: 0, errors: [] });
  mockConfirmIntents.mockResolvedValue(0);

  mockReconcileAfterSync.mockResolvedValue(undefined);
});

describe("fullSync", () => {
  describe("sync pipeline", () => {
    it("completes a successful full sync", async () => {
      const result = await fullSync("manual");

      expect(result.status).toBe("completed");
      expect(result.triggeredBy).toBe("manual");
      expect(result.syncRunId).toBe(1);
      expect(result.leagues.created).toBe(1);
      expect(result.teams.created).toBe(3);
      expect(result.matches.created).toBe(10);
    });

    it("creates sync run record", async () => {
      await fullSync("cron");

      expect(mockInsert).toHaveBeenCalled();
    });

    it("reuses existing sync run when syncRunId is provided", async () => {
      const mockSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 99 }]),
        }),
      });
      mockUpdate.mockReturnValueOnce({ set: mockSet });
      // Subsequent update calls (completion) use the default mock
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(
            Object.assign(Promise.resolve(undefined), {
              returning: vi.fn().mockResolvedValue([{ id: 99 }]),
            }),
          ),
        }),
      });

      const result = await fullSync("manual", undefined, 99);

      expect(result.syncRunId).toBe(99);
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running" }),
      );
    });

    it("throws when sync run update fails", async () => {
      mockUpdate.mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(fullSync("manual", undefined, 999)).rejects.toThrow(
        "Failed to update sync run",
      );
    });

    it("updates sync run record on completion with returning", async () => {
      await fullSync("manual");

      // update called at end
      expect(mockUpdate).toHaveBeenCalled();
      const setCall = mockUpdate.mock.results[0]!.value.set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed" }),
      );
    });

    it("logs warning when completion update matches no rows", async () => {
      // Override default mock for this test — returning empty array
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(
            Object.assign(Promise.resolve(undefined), {
              returning: vi.fn().mockResolvedValue([]),
            }),
          ),
        }),
      });

      await fullSync("manual");

      expect(mockSyncLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ syncRunId: 1 }),
        "Completion update did not match any rows",
      );
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

    it("closes sync logger on success", async () => {
      const mockLogger = { close: vi.fn().mockResolvedValue(undefined), log: vi.fn() };
      mockCreateSyncLogger.mockReturnValue(mockLogger);

      await fullSync("manual");

      expect(mockLogger.close).toHaveBeenCalled();
    });

    it("closes sync logger on failure", async () => {
      const mockLogger = { close: vi.fn().mockResolvedValue(undefined), log: vi.fn() };
      mockCreateSyncLogger.mockReturnValue(mockLogger);
      mockSyncLeagues.mockRejectedValue(new Error("crash"));

      await fullSync("manual");

      expect(mockLogger.close).toHaveBeenCalled();
    });

    it("throws when sync run creation fails", async () => {
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(fullSync("manual")).rejects.toThrow(
        "Failed to create sync run",
      );
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

    it("aggregates referee stats", async () => {
      mockSyncReferees.mockResolvedValue({
        created: 2, updated: 1, skipped: 0, refereeIdLookup: new Map(), errors: [],
      });
      mockSyncRoles.mockResolvedValue({ created: 1, updated: 2, skipped: 1, failed: 0, roleIdLookup: new Map() });
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
