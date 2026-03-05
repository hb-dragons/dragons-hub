import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

vi.mock("../config/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

vi.mock("../config/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockInitScheduledJobs = vi.fn().mockResolvedValue(undefined);
const mockSyncQueueClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./queues", () => ({
  initializeScheduledJobs: (...args: unknown[]) => mockInitScheduledJobs(...args),
  syncQueue: { close: (...args: unknown[]) => mockSyncQueueClose(...args) },
}));

const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./sync.worker", () => ({
  syncWorker: { close: (...args: unknown[]) => mockWorkerClose(...args) },
}));

const mockDbUpdate = vi.fn();
vi.mock("../config/database", () => ({
  db: {
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  syncRuns: { id: "id", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { initializeWorkers, shutdownWorkers } from "./index";
import { logger } from "../config/logger";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("initializeWorkers", () => {
  it("calls initializeScheduledJobs", async () => {
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await initializeWorkers();

    expect(mockInitScheduledJobs).toHaveBeenCalled();
  });

  it("marks stale running sync runs as failed on startup", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: 5 }, { id: 8 }]);
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      }),
    });

    await initializeWorkers();

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { count: 2, ids: [5, 8] },
      "Marked stale running sync runs as failed",
    );
  });

  it("does not log warning when no stale runs found", async () => {
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await initializeWorkers();

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("shutdownWorkers", () => {
  it("marks running syncs as failed", async () => {
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await shutdownWorkers();

    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("closes worker and queue", async () => {
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await shutdownWorkers();

    expect(mockWorkerClose).toHaveBeenCalled();
    expect(mockSyncQueueClose).toHaveBeenCalled();
  });

  it("continues shutdown even if DB update fails", async () => {
    mockDbUpdate.mockImplementation(() => {
      throw new Error("DB error");
    });

    await shutdownWorkers();

    expect(mockWorkerClose).toHaveBeenCalled();
    expect(mockSyncQueueClose).toHaveBeenCalled();
  });
});
