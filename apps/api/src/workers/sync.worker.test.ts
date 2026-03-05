import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

vi.mock("../config/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
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
  syncOrchestrator: {
    fullSync: (...args: unknown[]) => mockFullSync(...args),
  },
}));

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
vi.mock("../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  syncRuns: { id: "id", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

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

  it("logger function calls job.log", async () => {
    mockFullSync.mockImplementation(async (_triggeredBy: unknown, logger: (msg: string) => Promise<void>) => {
      await logger("test message");
      return { status: "completed" };
    });
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
    it("logs completion without syncRunId", async () => {
      await mockOnCompleted({ id: "job-1", data: {} });

      expect(logger.info).toHaveBeenCalledWith({ jobId: "job-1" }, "Sync job completed");
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("verifies and fixes stale running sync run on completion", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ status: "running" }]),
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await mockOnCompleted({ id: "job-1", data: { syncRunId: 42 } });

      expect(mockDbSelect).toHaveBeenCalled();
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        { syncRunId: 42 },
        "Sync run still running after job completed, marking as completed",
      );
    });

    it("does not update when sync run is already completed", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ status: "completed" }]),
        }),
      });

      await mockOnCompleted({ id: "job-1", data: { syncRunId: 42 } });

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("does not update when sync run is not found", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await mockOnCompleted({ id: "job-1", data: { syncRunId: 999 } });

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });
  });

  describe("failed handler", () => {
    it("logs failure without syncRunId", async () => {
      const err = new Error("fail");
      await mockOnFailed({ id: "job-1", data: {} }, err);

      expect(logger.error).toHaveBeenCalledWith({ jobId: "job-1", err }, "Sync job failed");
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("marks sync run as failed in DB", async () => {
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const err = new Error("sync crashed");
      await mockOnFailed({ id: "job-1", data: { syncRunId: 42 } }, err);

      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("handles null job in failed handler", async () => {
      const err = new Error("fail");
      await mockOnFailed(null, err);

      expect(logger.error).toHaveBeenCalled();
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });
  });

  it("handles error event", () => {
    mockOnError(new Error("worker error"));
    // Should not throw
  });
});
