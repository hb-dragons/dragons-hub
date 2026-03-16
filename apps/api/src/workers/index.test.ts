import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

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

const mockEventWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./event.worker", () => ({
  eventWorker: { close: (...args: unknown[]) => mockEventWorkerClose(...args) },
}));

const mockStartOutboxPoller = vi.fn();
const mockStopOutboxPoller = vi.fn();
vi.mock("../services/events/outbox-poller", () => ({
  startOutboxPoller: (...args: unknown[]) => mockStartOutboxPoller(...args),
  stopOutboxPoller: (...args: unknown[]) => mockStopOutboxPoller(...args),
}));

const mockDbUpdate = vi.fn();
const mockDbSelect = vi.fn();
const mockDbDelete = vi.fn();
vi.mock("../config/database", () => ({
  db: {
    update: (...args: unknown[]) => mockDbUpdate(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  syncRuns: { id: "id", status: "status", startedAt: "startedAt" },
  syncRunEntries: { syncRunId: "syncRunId" },
  domainEvents: { id: "id", occurredAt: "occurredAt" },
  notificationLog: { id: "id", eventId: "eventId" },
  digestBuffer: { id: "id", eventId: "eventId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  lt: vi.fn(),
  inArray: vi.fn(),
}));

import { initializeWorkers, shutdownWorkers, cleanupOldSyncRuns, cleanupOldDomainEvents } from "./index";
import { logger } from "../config/logger";

beforeEach(() => {
  vi.clearAllMocks();

  // Default: no stale runs, no old runs
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
  mockDbDelete.mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
    }),
  });
});

describe("initializeWorkers", () => {
  it("calls initializeScheduledJobs", async () => {
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
    await initializeWorkers();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("runs cleanup of old sync runs", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }]),
      }),
    });

    await initializeWorkers();

    expect(mockDbDelete).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { count: 2 },
      "Cleaned up old sync runs",
    );
  });

  it("continues if cleanup fails", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("DB error")),
      }),
    });

    await initializeWorkers();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Failed to cleanup old sync runs",
    );
    expect(mockInitScheduledJobs).toHaveBeenCalled();
  });
});

describe("cleanupOldSyncRuns", () => {
  it("returns 0 when no old runs found", async () => {
    const result = await cleanupOldSyncRuns();

    expect(result).toBe(0);
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("deletes entries then runs for old data", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]),
      }),
    });

    const result = await cleanupOldSyncRuns(90);

    expect(result).toBe(3);
    // Should delete entries first, then runs
    expect(mockDbDelete).toHaveBeenCalledTimes(2);
  });

  it("accepts custom retention days", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await cleanupOldSyncRuns(30);

    expect(result).toBe(0);
    expect(mockDbSelect).toHaveBeenCalled();
  });
});

describe("cleanupOldDomainEvents", () => {
  it("returns zeros when no old events found", async () => {
    const result = await cleanupOldDomainEvents();

    expect(result).toEqual({ notifications: 0, digestEntries: 0, events: 0 });
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("deletes notification_log, digest_buffer, then domain_events", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: "evt-1" }, { id: "evt-2" }]),
      }),
    });

    const mockDeleteReturning = vi.fn()
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])  // notification_log
      .mockResolvedValueOnce([{ id: 3 }]);              // digest_buffer
    const mockDeleteWhere = vi.fn().mockReturnValue({
      returning: mockDeleteReturning,
    });
    mockDbDelete.mockReturnValue({
      where: mockDeleteWhere,
    });

    const result = await cleanupOldDomainEvents(365);

    expect(result).toEqual({ notifications: 2, digestEntries: 1, events: 2 });
    // 3 deletes: notification_log, digest_buffer, domain_events
    expect(mockDbDelete).toHaveBeenCalledTimes(3);
  });

  it("accepts custom retention days", async () => {
    const result = await cleanupOldDomainEvents(30);

    expect(result).toEqual({ notifications: 0, digestEntries: 0, events: 0 });
    expect(mockDbSelect).toHaveBeenCalled();
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
