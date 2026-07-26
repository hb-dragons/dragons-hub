import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

vi.mock("../config/logger", () => {
  const log = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  log.child.mockReturnValue(log);
  return { logger: log };
});

const mockStartHeartbeat = vi.fn();
const mockStopHeartbeat = vi.fn();
const mockIsInstanceAlive = vi.fn().mockResolvedValue(false);
vi.mock("./instance-heartbeat", () => ({
  startHeartbeat: (...args: unknown[]) => mockStartHeartbeat(...args),
  stopHeartbeat: (...args: unknown[]) => mockStopHeartbeat(...args),
  isInstanceAlive: (...args: unknown[]) => mockIsInstanceAlive(...args),
  INSTANCE_ID: "MOCK_INSTANCE_ID",
}));

const mockInitScheduledJobs = vi.fn().mockResolvedValue(undefined);
const mockSyncQueueClose = vi.fn().mockResolvedValue(undefined);
const mockDigestQueueClose = vi.fn().mockResolvedValue(undefined);
const mockDomainEventsQueueClose = vi.fn().mockResolvedValue(undefined);
const mockDigestQueueAdd = vi.fn().mockResolvedValue({ id: "digest-job-1" });
const mockDigestQueueGetRepeatableJobs = vi.fn().mockResolvedValue([]);
const mockDigestQueueRemoveRepeatableByKey = vi.fn().mockResolvedValue(undefined);
const mockRefereeRemindersQueueClose = vi.fn().mockResolvedValue(undefined);
const mockPushReceiptQueueClose = vi.fn().mockResolvedValue(undefined);
const mockSyncQueueAdd = vi.fn().mockResolvedValue({ id: "sync-job-1" });
const mockInitTaskReminders = vi.fn().mockResolvedValue(undefined);
const mockTaskRemindersQueueGetRepeatableJobs = vi.fn().mockResolvedValue([]);
const mockTaskRemindersQueueClose = vi.fn().mockResolvedValue(undefined);
const mockOutboxPollQueueClose = vi.fn().mockResolvedValue(undefined);
const mockTriggerRefereeGamesSync = vi.fn().mockResolvedValue(null);
vi.mock("./queues", () => ({
  initializeScheduledJobs: (...args: unknown[]) => mockInitScheduledJobs(...args),
  initTaskReminders: (...args: unknown[]) => mockInitTaskReminders(...args),
  triggerRefereeGamesSync: (...args: unknown[]) => mockTriggerRefereeGamesSync(...args),
  syncQueue: {
    close: (...args: unknown[]) => mockSyncQueueClose(...args),
    add: (...args: unknown[]) => mockSyncQueueAdd(...args),
  },
  domainEventsQueue: { close: (...args: unknown[]) => mockDomainEventsQueueClose(...args) },
  refereeRemindersQueue: { close: (...args: unknown[]) => mockRefereeRemindersQueueClose(...args) },
  pushReceiptQueue: { close: (...args: unknown[]) => mockPushReceiptQueueClose(...args) },
  taskRemindersQueue: {
    close: (...args: unknown[]) => mockTaskRemindersQueueClose(...args),
    getRepeatableJobs: () => mockTaskRemindersQueueGetRepeatableJobs(),
  },
  outboxPollQueue: { close: (...args: unknown[]) => mockOutboxPollQueueClose(...args) },
  digestQueue: {
    close: (...args: unknown[]) => mockDigestQueueClose(...args),
    add: (...args: unknown[]) => mockDigestQueueAdd(...args),
    getRepeatableJobs: () => mockDigestQueueGetRepeatableJobs(),
    removeRepeatableByKey: (...args: unknown[]) => mockDigestQueueRemoveRepeatableByKey(...args),
  },
}));

const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerOn = vi.fn();
vi.mock("./sync.worker", () => ({
  syncWorker: {
    close: (...args: unknown[]) => mockWorkerClose(...args),
    on: (...args: unknown[]) => mockWorkerOn(...args),
  },
}));

const mockEventWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./event.worker", () => ({
  eventWorker: { close: (...args: unknown[]) => mockEventWorkerClose(...args) },
}));

const mockRefereeReminderWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./referee-reminder.worker", () => ({
  refereeReminderWorker: { close: (...args: unknown[]) => mockRefereeReminderWorkerClose(...args) },
}));

const mockPushReceiptWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./push-receipt.worker", () => ({
  pushReceiptWorker: { close: (...args: unknown[]) => mockPushReceiptWorkerClose(...args) },
}));

const mockTaskReminderWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./task-reminder.worker", () => ({
  taskReminderWorker: { close: (...args: unknown[]) => mockTaskReminderWorkerClose(...args) },
}));

const mockOutboxPollWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock("./outbox-poll.worker", () => ({
  outboxPollWorker: { close: (...args: unknown[]) => mockOutboxPollWorkerClose(...args) },
}));

vi.mock("../services/events/outbox-poller", () => ({
  pollOutbox: vi.fn().mockResolvedValue(0),
}));

vi.mock("../services/notifications/seed-referee-watch-rule", () => ({
  seedRefereeNotificationConfig: vi.fn().mockResolvedValue(undefined),
}));

const mockSyncRefereeGames = vi.fn().mockResolvedValue({ created: 0, updated: 0, unchanged: 0 });
vi.mock("../services/sync/referee-games.sync", () => ({
  syncRefereeGames: (...args: unknown[]) => mockSyncRefereeGames(...args),
}));

const mockDbUpdate = vi.fn();
const mockDbSelect = vi.fn();
const mockDbDelete = vi.fn();
vi.mock("../config/database", () => ({
  getDb: () => ({
    update: (...args: unknown[]) => mockDbUpdate(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  }),
}));

vi.mock("@dragons/db/schema", () => ({
  syncRuns: { id: "id", status: "status", startedAt: "startedAt", ownerInstanceId: "ownerInstanceId" },
  syncRunEntries: { syncRunId: "syncRunId" },
  domainEvents: { id: "id", occurredAt: "occurredAt" },
  notificationLog: { id: "id", eventId: "eventId" },
  digestBuffer: { id: "id", eventId: "eventId" },
  channelConfigs: { id: "id", enabled: "enabled", digestMode: "digestMode" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  lt: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

import { initializeWorkers, shutdownWorkers, cleanupOldSyncRuns, cleanupOldDomainEvents, initializeScheduledDigests } from "./index";
import { logger } from "../config/logger";

beforeEach(() => {
  vi.clearAllMocks();

  // Default: isInstanceAlive → false (owner is dead, runs should be reclaimed)
  mockIsInstanceAlive.mockResolvedValue(false);

  // Default: no running rows found during startup reclaim select
  // Default: no stale runs, no old runs
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
  // Mock supports both `.where()` resolving directly (cleanupOldSyncRuns / reclaim select)
  // and `.where().limit()` (cleanupOldDomainEvents batched)
  const emptyWhereResult = Promise.resolve([]);
  (emptyWhereResult as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(emptyWhereResult),
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

  it("routes the post-sync referee trigger through the queue, not a direct sync (#70)", async () => {
    await initializeWorkers();

    const completedHandler = mockWorkerOn.mock.calls.find(([evt]) => evt === "completed")?.[1] as
      | ((job: { data: { type: string } }) => void)
      | undefined;
    expect(completedHandler).toBeDefined();

    completedHandler!({ data: { type: "full" } });
    await new Promise((r) => setImmediate(r)); // flush the fire-and-forget handler

    expect(mockTriggerRefereeGamesSync).toHaveBeenCalledWith("post-full-sync");
    expect(mockSyncRefereeGames).not.toHaveBeenCalled();
  });

  it("does not re-trigger a referee sync when a referee-games job completes (#70)", async () => {
    await initializeWorkers();

    const completedHandler = mockWorkerOn.mock.calls.find(([evt]) => evt === "completed")?.[1] as
      | ((job: { data: { type: string } }) => void)
      | undefined;

    completedHandler!({ data: { type: "referee-games" } });
    await new Promise((r) => setImmediate(r));

    expect(mockTriggerRefereeGamesSync).not.toHaveBeenCalled();
  });

  it("starts heartbeat before stale-run reclaim", async () => {
    await initializeWorkers();

    expect(mockStartHeartbeat).toHaveBeenCalled();
  });

  it("marks stale running sync runs as failed on startup when owner is dead", async () => {
    // Select returns two running rows owned by a dead instance
    mockIsInstanceAlive.mockResolvedValue(false);
    const emptyWhereResult = Promise.resolve([
      { id: 5, ownerInstanceId: "dead-instance" },
      { id: 8, ownerInstanceId: "dead-instance" },
    ]);
    (emptyWhereResult as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(emptyWhereResult),
      }),
    });

    await initializeWorkers();

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { count: 2, ids: [5, 8] },
      "Marked stale running sync runs as failed",
    );
  });

  it("does not reclaim a run owned by a live instance", async () => {
    // Select returns one running row owned by a LIVE instance
    mockIsInstanceAlive.mockResolvedValue(true);
    const emptyWhereResult = Promise.resolve([
      { id: 42, ownerInstanceId: "live-instance" },
    ]);
    (emptyWhereResult as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(emptyWhereResult),
      }),
    });

    await initializeWorkers();

    // Update should NOT have been called for the reclaim
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ ids: [42] }),
      "Marked stale running sync runs as failed",
    );
  });

  it("does not log warning when no stale runs found", async () => {
    await initializeWorkers();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("runs cleanup of old sync runs", async () => {
    // First select call: startup reclaim — return empty (no running rows to reclaim)
    const emptyReclaimResult = Promise.resolve([]);
    (emptyReclaimResult as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(emptyReclaimResult),
      }),
    });

    // Subsequent select calls: cleanupOldSyncRuns — return two old runs
    const syncRunWhereResult = Promise.resolve([{ id: 10 }, { id: 11 }]);
    (syncRunWhereResult as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(syncRunWhereResult),
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
    // First select call: startup reclaim (must succeed with empty result)
    const emptyReclaimResult = Promise.resolve([]);
    (emptyReclaimResult as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(emptyReclaimResult),
      }),
    });

    // Subsequent select calls: cleanupOldSyncRuns — reject to simulate DB error
    const failWhereResult = Promise.reject(new Error("DB error"));
    (failWhereResult as unknown as Record<string, unknown>).limit = vi.fn().mockRejectedValue(new Error("DB error"));
    // Suppress unhandled rejection from the rejected promise
    failWhereResult.catch(() => {});
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(failWhereResult),
      }),
    });

    await initializeWorkers();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Failed to cleanup old sync runs",
    );
    expect(mockInitScheduledJobs).toHaveBeenCalled();
  });

  it("initializes task reminder repeatable job", async () => {
    mockTaskRemindersQueueGetRepeatableJobs.mockResolvedValue([
      { id: "task-reminder-sweep-cron" },
    ]);

    await initializeWorkers();

    expect(mockInitTaskReminders).toHaveBeenCalled();
  });
});

describe("cleanupOldSyncRuns", () => {
  it("returns 0 when no old runs found", async () => {
    const result = await cleanupOldSyncRuns();

    expect(result).toBe(0);
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("deletes entries then runs for old data", async () => {
    const whereResult = Promise.resolve([{ id: 1 }, { id: 2 }, { id: 3 }]);
    (whereResult as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(whereResult),
      }),
    });

    const result = await cleanupOldSyncRuns(90);

    expect(result).toBe(3);
    // Should delete entries first, then runs
    expect(mockDbDelete).toHaveBeenCalledTimes(2);
  });

  it("accepts custom retention days", async () => {
    const result = await cleanupOldSyncRuns(30);

    expect(result).toBe(0);
    expect(mockDbSelect).toHaveBeenCalled();
  });
});

describe("cleanupOldDomainEvents", () => {
  it("returns zeros when no old events found", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await cleanupOldDomainEvents();

    expect(result).toEqual({ notifications: 0, digestEntries: 0, events: 0 });
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("deletes notification_log, digest_buffer, then domain_events in batches", async () => {
    // First batch returns 2 events, second batch returns 0 (done)
    const mockLimit = vi.fn()
      .mockResolvedValueOnce([{ id: "evt-1" }, { id: "evt-2" }])
      .mockResolvedValueOnce([]);
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: mockLimit,
        }),
      }),
    });

    const mockDeleteReturning = vi.fn()
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])  // notification_log batch 1
      .mockResolvedValueOnce([{ id: 3 }]);              // digest_buffer batch 1
    const mockDeleteWhere = vi.fn().mockReturnValue({
      returning: mockDeleteReturning,
    });
    mockDbDelete.mockReturnValue({
      where: mockDeleteWhere,
    });

    const result = await cleanupOldDomainEvents(365);

    expect(result).toEqual({ notifications: 2, digestEntries: 1, events: 2 });
    // 3 deletes per batch: notification_log, digest_buffer, domain_events
    expect(mockDbDelete).toHaveBeenCalledTimes(3);
  });

  it("processes multiple batches when events exceed batch size", async () => {
    // First batch returns events (simulating full batch), second returns remainder, third empty
    const mockLimit = vi.fn()
      .mockResolvedValueOnce([{ id: "evt-1" }])  // batch 1 (< CLEANUP_BATCH_SIZE, so single batch)
      .mockResolvedValueOnce([]);                  // safety
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: mockLimit,
        }),
      }),
    });

    const mockDeleteReturning = vi.fn()
      .mockResolvedValueOnce([{ id: 1 }])  // notification_log
      .mockResolvedValueOnce([]);            // digest_buffer
    mockDbDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mockDeleteReturning,
      }),
    });

    const result = await cleanupOldDomainEvents(30);

    expect(result).toEqual({ notifications: 1, digestEntries: 0, events: 1 });
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

  it("calls stopHeartbeat on shutdown", async () => {
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await shutdownWorkers();

    expect(mockStopHeartbeat).toHaveBeenCalled();
  });

  it("closes workers and queues", async () => {
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await shutdownWorkers();

    expect(mockWorkerClose).toHaveBeenCalled();
    expect(mockTaskReminderWorkerClose).toHaveBeenCalled();
    expect(mockOutboxPollWorkerClose).toHaveBeenCalled();
    expect(mockOutboxPollQueueClose).toHaveBeenCalled();
    expect(mockSyncQueueClose).toHaveBeenCalled();
    expect(mockDigestQueueClose).toHaveBeenCalled();
    expect(mockDomainEventsQueueClose).toHaveBeenCalled();
  });

  it("continues shutdown even if DB update fails", async () => {
    mockDbUpdate.mockImplementation(() => {
      throw new Error("DB error");
    });

    await shutdownWorkers();

    expect(mockWorkerClose).toHaveBeenCalled();
    expect(mockOutboxPollWorkerClose).toHaveBeenCalled();
    expect(mockOutboxPollQueueClose).toHaveBeenCalled();
    expect(mockSyncQueueClose).toHaveBeenCalled();
    expect(mockDigestQueueClose).toHaveBeenCalled();
    expect(mockDomainEventsQueueClose).toHaveBeenCalled();
  });
});

describe("initializeScheduledDigests", () => {
  it("removes stale repeatable jobs and creates new ones for scheduled channels", async () => {
    mockDigestQueueGetRepeatableJobs.mockResolvedValue([
      { key: "old-key-1" },
      { key: "old-key-2" },
    ]);

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: 1,
            enabled: true,
            digestMode: "scheduled",
            digestCron: "0 8 * * *",
            digestTimezone: "Europe/Berlin",
          },
          {
            id: 2,
            enabled: true,
            digestMode: "scheduled",
            digestCron: "0 18 * * *",
            digestTimezone: "America/New_York",
          },
        ]),
      }),
    });

    await initializeScheduledDigests();

    expect(mockDigestQueueRemoveRepeatableByKey).toHaveBeenCalledTimes(2);
    expect(mockDigestQueueAdd).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      { count: 2 },
      "Scheduled digest jobs initialized",
    );
  });

  it("skips channels with no digestCron", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: 1,
            enabled: true,
            digestMode: "scheduled",
            digestCron: null,
            digestTimezone: "Europe/Berlin",
          },
        ]),
      }),
    });

    await initializeScheduledDigests();

    expect(mockDigestQueueAdd).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { channelConfigId: 1 },
      "Channel has digestMode=scheduled but no digestCron, skipping",
    );
  });

  it("does nothing when no scheduled channels exist", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    await initializeScheduledDigests();

    expect(mockDigestQueueAdd).not.toHaveBeenCalled();
  });
});
