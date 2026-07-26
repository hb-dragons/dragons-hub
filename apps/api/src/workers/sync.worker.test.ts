import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock setup ---
//
// drizzle-orm is NOT mocked here. This worker's sync_runs bookkeeping is all
// `where(eq(syncRuns.id, syncRunId))`: claim the run as running, then stamp it
// completed or failed. With `eq` stubbed to a bare `vi.fn()` and a chainable db
// mock, `expect(mockDbUpdate).toHaveBeenCalled()` passes even when the update
// hits every referee-games run in the table, and neither the status nor the
// record counts are checked at all. So this runs against a real (PGlite,
// in-process) Postgres and reads the rows back.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

const mockChildLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../config/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnValue(mockChildLogger),
  },
}));

const mockFullSync = vi.fn();
vi.mock("../services/sync/index", () => ({
  fullSync: (...args: unknown[]) => mockFullSync(...args),
}));

const mockSyncRefereeGames = vi.fn();
vi.mock("../services/sync/referee-games.sync", () => ({
  syncRefereeGames: (...args: unknown[]) => mockSyncRefereeGames(...args),
}));

const mockSyncLoggerClose = vi.fn();
const mockSyncLogger = { close: mockSyncLoggerClose, info: vi.fn(), error: vi.fn() };
const mockCreateSyncLogger = vi.fn().mockReturnValue(mockSyncLogger);
vi.mock("../services/sync/sync-logger", () => ({
  createSyncLogger: (...args: unknown[]) => mockCreateSyncLogger(...args),
}));

const mockOnCompleted = vi.fn();
const mockOnFailed = vi.fn();
const mockOnError = vi.fn();
const mockClose = vi.fn();

// Capture the processor function for testing
let processorFn: (job: unknown) => Promise<unknown>;

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>) {
      processorFn = processor;
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      if (event === "completed") mockOnCompleted.mockImplementation(handler);
      if (event === "failed") mockOnFailed.mockImplementation(handler);
      if (event === "error") mockOnError.mockImplementation(handler);
      return this;
    }
    close = mockClose;
  },
}));

// Import after mocks
await import("./sync.worker");
import { logger } from "../config/logger";
import { INSTANCE_ID } from "./instance-heartbeat";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mockCreateSyncLogger.mockReturnValue(mockSyncLogger);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

interface SyncRunRow {
  id: number;
  sync_type: string;
  status: string;
  triggered_by: string;
  owner_instance_id: string | null;
  records_created: number | null;
  records_updated: number | null;
  records_skipped: number | null;
  records_failed: number | null;
  duration_ms: number | null;
  error_message: string | null;
  completed_at: Date | null;
}

async function syncRunRows(): Promise<SyncRunRow[]> {
  const r = await ctx.client.query<SyncRunRow>(
    `SELECT id, sync_type, status, triggered_by, owner_instance_id, records_created,
            records_updated, records_skipped, records_failed, duration_ms,
            error_message, completed_at
     FROM sync_runs ORDER BY id`,
  );
  return r.rows;
}

/**
 * The `completed` / `failed` handlers kick off their DB work in a
 * `void (async () => ...)()`, so awaiting the handler itself proves nothing.
 * Wait for that detached work to drain before asserting — including for the
 * negative assertions, where the point is that nothing landed.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
}

async function seedRun(opts: {
  syncType?: string;
  status?: string;
  triggeredBy?: string;
} = {}): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO sync_runs (sync_type, status, triggered_by, started_at)
     VALUES ($1, $2, $3, now()) RETURNING id`,
    [opts.syncType ?? "referee-games", opts.status ?? "pending", opts.triggeredBy ?? "manual"],
  );
  return r.rows[0]!.id;
}

// --- Tests ---

describe("sync worker processor", () => {
  it("runs full sync for type=full", async () => {
    mockFullSync.mockResolvedValue({ status: "completed" });

    const result = await processorFn({
      id: "job-1",
      name: "daily-sync",
      data: { type: "full" },
      log: vi.fn(),
    });

    expect(result).toEqual({
      completed: true,
      type: "full",
      result: { status: "completed" },
    });
    expect(mockFullSync).toHaveBeenCalledWith("cron", expect.any(Function), undefined);
    // fullSync owns its own sync_runs bookkeeping; the worker adds none.
    expect(await syncRunRows()).toEqual([]);
  });

  it("uses manual trigger for non-daily jobs", async () => {
    mockFullSync.mockResolvedValue({ status: "completed" });

    await processorFn({
      id: "job-2",
      name: "manual-sync",
      data: { type: "full" },
      log: vi.fn(),
    });

    expect(mockFullSync).toHaveBeenCalledWith("manual", expect.any(Function), undefined);
  });

  it("passes syncRunId to fullSync when present in job data", async () => {
    mockFullSync.mockResolvedValue({ status: "completed" });

    await processorFn({
      id: "job-6",
      name: "manual-sync",
      data: { type: "full", syncRunId: 42 },
      log: vi.fn(),
    });

    expect(mockFullSync).toHaveBeenCalledWith("manual", expect.any(Function), 42);
  });

  it("throws for unsupported sync type", async () => {
    await expect(
      processorFn({
        id: "job-3",
        name: "manual-sync",
        data: { type: "leagues" },
        log: vi.fn(),
      }),
    ).rejects.toThrow("Unsupported sync type: leagues");
  });

  it("re-throws errors", async () => {
    mockFullSync.mockRejectedValue(new Error("sync failed"));

    await expect(
      processorFn({
        id: "job-4",
        name: "daily-sync",
        data: { type: "full" },
        log: vi.fn(),
      }),
    ).rejects.toThrow("sync failed");
  });

  it("claims and completes the given referee-games run without touching a sibling run", async () => {
    const target = await seedRun({ status: "pending" });
    // A second referee-games run that must be left exactly as it is.
    const bystander = await seedRun({ status: "running" });
    mockSyncRefereeGames.mockResolvedValue({ created: 5, updated: 3, unchanged: 10 });

    const result = await processorFn({
      id: "job-ref-1",
      name: "manual-sync",
      data: { type: "referee-games", syncRunId: target },
      log: vi.fn(),
    });

    expect(result).toEqual({
      completed: true,
      type: "referee-games",
      created: 5,
      updated: 3,
      unchanged: 10,
    });
    expect(mockCreateSyncLogger).toHaveBeenCalledWith(target);
    expect(mockSyncRefereeGames).toHaveBeenCalledWith(mockSyncLogger, target);
    expect(mockSyncLoggerClose).toHaveBeenCalled();

    const rows = await syncRunRows();
    // No extra run created when the job already carries one.
    expect(rows).toHaveLength(2);
    const targetRow = rows.find((r) => r.id === target)!;
    expect(targetRow).toMatchObject({
      status: "completed",
      records_created: 5,
      records_updated: 3,
      records_skipped: 10,
      records_failed: 0,
      owner_instance_id: INSTANCE_ID,
    });
    expect(targetRow.completed_at).not.toBeNull();
    expect(targetRow.duration_ms).not.toBeNull();

    const bystanderRow = rows.find((r) => r.id === bystander)!;
    expect(bystanderRow).toMatchObject({
      status: "running",
      owner_instance_id: null,
      completed_at: null,
    });
  });

  it("creates its own pending run when the job carries no syncRunId", async () => {
    mockSyncRefereeGames.mockResolvedValue({ created: 1, updated: 0, unchanged: 2 });

    await processorFn({
      id: "job-ref-2",
      name: "manual-sync",
      data: { type: "referee-games" },
      log: vi.fn(),
    });

    const rows = await syncRunRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sync_type: "referee-games",
      triggered_by: "manual",
      status: "completed",
      records_created: 1,
      records_skipped: 2,
      owner_instance_id: INSTANCE_ID,
    });
    // The created run is the one the sync logger and sync were handed.
    expect(mockCreateSyncLogger).toHaveBeenCalledWith(rows[0]!.id);
  });

  it("marks only the failing run as failed with its error message", async () => {
    const bystander = await seedRun({ status: "running" });
    mockSyncRefereeGames.mockRejectedValue(new Error("referee sync failed"));

    await expect(
      processorFn({
        id: "job-ref-3",
        name: "manual-sync",
        data: { type: "referee-games" },
        log: vi.fn(),
      }),
    ).rejects.toThrow("referee sync failed");

    expect(mockSyncLoggerClose).toHaveBeenCalled();
    const rows = await syncRunRows();
    const created = rows.find((r) => r.id !== bystander)!;
    expect(created).toMatchObject({
      status: "failed",
      error_message: "referee sync failed",
    });
    expect(created.completed_at).not.toBeNull();
    expect(rows.find((r) => r.id === bystander)).toMatchObject({
      status: "running",
      error_message: null,
    });
  });

  it("records 'cron' as triggeredBy for the scheduled referee-games job", async () => {
    mockSyncRefereeGames.mockResolvedValue({ created: 0, updated: 0, unchanged: 0 });

    await processorFn({
      id: "job-ref-4",
      name: "referee-games-sync-scheduled",
      data: { type: "referee-games" },
      log: vi.fn(),
    });

    const rows = await syncRunRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.triggered_by).toBe("cron");
  });

  it("logger function calls job.log", async () => {
    mockFullSync.mockImplementation(
      async (_triggeredBy: unknown, log: (msg: string) => Promise<void>) => {
        await log("test message");
        return { status: "completed" };
      },
    );
    const mockLog = vi.fn();

    await processorFn({
      id: "job-5",
      name: "daily-sync",
      data: { type: "full" },
      log: mockLog,
    });

    expect(mockLog).toHaveBeenCalledWith("test message");
  });
});

describe("sync worker event handlers", () => {
  describe("completed handler", () => {
    it("logs completion without syncRunId and touches no row", async () => {
      const id = await seedRun({ status: "running" });

      await mockOnCompleted({ id: "job-1", data: {} });
      await settle();

      expect(logger.info).toHaveBeenCalledWith({ jobId: "job-1" }, "Sync job completed");
      expect((await syncRunRows()).find((r) => r.id === id)!.status).toBe("running");
    });

    it("reconciles only the still-running run named by the job", async () => {
      const target = await seedRun({ status: "running" });
      const bystander = await seedRun({ status: "running" });

      await mockOnCompleted({ id: "job-1", data: { syncRunId: target } });
      await settle();

      const rows = await syncRunRows();
      expect(rows.find((r) => r.id === target)).toMatchObject({ status: "completed" });
      expect(rows.find((r) => r.id === target)!.completed_at).not.toBeNull();
      expect(rows.find((r) => r.id === bystander)).toMatchObject({ status: "running" });
      expect(logger.warn).toHaveBeenCalledWith(
        { syncRunId: target },
        "Sync run still running after job completed, marking as completed",
      );
    });

    it("does not touch a run that already completed itself", async () => {
      const id = await seedRun({ status: "completed" });

      await mockOnCompleted({ id: "job-1", data: { syncRunId: id } });
      await settle();

      const row = (await syncRunRows()).find((r) => r.id === id)!;
      expect(row.status).toBe("completed");
      expect(row.completed_at).toBeNull();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("does nothing when the sync run is not found", async () => {
      await mockOnCompleted({ id: "job-1", data: { syncRunId: 999 } });
      await settle();

      expect(await syncRunRows()).toEqual([]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("logs an error when reconciliation DB work throws", async () => {
      dbHolder.ref = {
        select: () => {
          throw new Error("db down");
        },
      };
      try {
        await mockOnCompleted({ id: "job-1", data: { syncRunId: 42 } });
        await settle();
      } finally {
        dbHolder.ref = ctx.db;
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: "job-1", syncRunId: 42 }),
        "Failed to reconcile sync run on completion",
      );
    });
  });

  describe("failed handler", () => {
    it("logs failure without syncRunId and touches no row", async () => {
      const id = await seedRun({ status: "running" });
      const err = new Error("fail");

      await mockOnFailed({ id: "job-1", data: {} }, err);
      await settle();

      expect(logger.error).toHaveBeenCalledWith({ jobId: "job-1", err }, "Sync job failed");
      expect((await syncRunRows()).find((r) => r.id === id)!.status).toBe("running");
    });

    it("marks only the job's own sync run as failed", async () => {
      const target = await seedRun({ status: "running" });
      const bystander = await seedRun({ status: "running" });
      const err = new Error("sync crashed");

      await mockOnFailed({ id: "job-1", data: { syncRunId: target } }, err);
      await settle();

      const rows = await syncRunRows();
      expect(rows.find((r) => r.id === target)).toMatchObject({
        status: "failed",
        error_message: "sync crashed",
      });
      expect(rows.find((r) => r.id === target)!.completed_at).not.toBeNull();
      expect(rows.find((r) => r.id === bystander)).toMatchObject({
        status: "running",
        error_message: null,
      });
    });

    it("handles null job in failed handler", async () => {
      const id = await seedRun({ status: "running" });
      const err = new Error("fail");

      await mockOnFailed(null, err);
      await settle();

      expect(logger.error).toHaveBeenCalled();
      expect((await syncRunRows()).find((r) => r.id === id)!.status).toBe("running");
    });

    it("logs an error when the DB update throws", async () => {
      dbHolder.ref = {
        update: () => {
          throw new Error("db down");
        },
      };
      const err = new Error("sync crashed");
      try {
        await mockOnFailed({ id: "job-1", data: { syncRunId: 42 } }, err);
        await settle();
      } finally {
        dbHolder.ref = ctx.db;
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: "job-1", syncRunId: 42 }),
        "Failed to mark sync run as failed",
      );
    });
  });

  it("handles error event", () => {
    mockOnError(new Error("worker error"));
    // Should not throw
  });
});
