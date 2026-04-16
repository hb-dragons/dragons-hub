import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

vi.mock("../config/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockInsert = vi.fn();
vi.mock("../config/database", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: mockLimit,
        }),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  syncSchedule: Symbol("syncSchedule"),
  syncRuns: Symbol("syncRuns"),
}));

const {
  mockAdd,
  mockGetRepeatableJobs,
  mockRemoveRepeatableByKey,
  mockGetJobs,
  mockGetJob,
  mockLimit,
} = vi.hoisted(() => ({
  mockAdd: vi.fn().mockResolvedValue({ id: "job-1" }),
  mockGetRepeatableJobs: vi.fn().mockResolvedValue([]),
  mockRemoveRepeatableByKey: vi.fn().mockResolvedValue(undefined),
  mockGetJobs: vi.fn().mockResolvedValue([]),
  mockGetJob: vi.fn(),
  mockLimit: vi.fn().mockResolvedValue([]),
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    add = mockAdd;
    getRepeatableJobs = mockGetRepeatableJobs;
    removeRepeatableByKey = mockRemoveRepeatableByKey;
    getJobs = mockGetJobs;
    getJob = mockGetJob;
    close = vi.fn();
  },
}));

import {
  initializeScheduledJobs,
  triggerManualSync,
  triggerRefereeGamesSync,
  getJobStatus,
  updateSyncSchedule,
  updateRefereeSyncSchedule,
} from "./queues";

beforeEach(() => {
  vi.clearAllMocks();
  mockLimit.mockResolvedValue([]);
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 42 }]),
    }),
  });
});

describe("initializeScheduledJobs", () => {
  it("removes existing repeatable jobs", async () => {
    mockGetRepeatableJobs.mockResolvedValue([{ key: "old-key" }]);

    await initializeScheduledJobs();

    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith("old-key");
  });

  it("adds scheduled job with default cron", async () => {
    await initializeScheduledJobs();

    expect(mockAdd).toHaveBeenCalledWith(
      "daily-sync",
      { type: "full" },
      expect.objectContaining({
        repeat: expect.objectContaining({
          pattern: "0 4 * * *",
          tz: "Europe/Berlin",
        }),
      }),
    );
  });

  it("reads schedule from DB", async () => {
    // First call: full sync schedule, second call: referee schedule
    mockLimit
      .mockResolvedValueOnce([{
        cronExpression: "0 6 * * *",
        timezone: "UTC",
        enabled: true,
      }])
      .mockResolvedValueOnce([]);

    await initializeScheduledJobs();

    expect(mockAdd).toHaveBeenCalledWith(
      "daily-sync",
      { type: "full" },
      expect.objectContaining({
        repeat: expect.objectContaining({ pattern: "0 6 * * *", tz: "UTC" }),
      }),
    );
  });

  it("does not add daily-sync job when schedule is disabled", async () => {
    // First call: full sync disabled, second call: referee schedule (default)
    mockLimit
      .mockResolvedValueOnce([{
        cronExpression: "0 4 * * *",
        timezone: "Europe/Berlin",
        enabled: false,
      }])
      .mockResolvedValueOnce([]);

    await initializeScheduledJobs();

    // daily-sync should not be added, but referee-games-sync-scheduled should be
    expect(mockAdd).not.toHaveBeenCalledWith(
      "daily-sync",
      expect.anything(),
      expect.anything(),
    );
    expect(mockAdd).toHaveBeenCalledWith(
      "referee-games-sync-scheduled",
      { type: "referee-games" },
      expect.objectContaining({
        repeat: { every: 30 * 60 * 1000 },
      }),
    );
  });

  it("also schedules referee-games sync", async () => {
    // First call: full sync default, second call: referee with custom interval
    mockLimit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        intervalMinutes: 15,
        enabled: true,
      }]);

    await initializeScheduledJobs();

    expect(mockAdd).toHaveBeenCalledWith(
      "referee-games-sync-scheduled",
      { type: "referee-games" },
      expect.objectContaining({
        repeat: { every: 15 * 60 * 1000 },
      }),
    );
  });

  it("does not schedule referee sync when disabled", async () => {
    // First call: full sync default, second call: referee disabled
    mockLimit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        intervalMinutes: 30,
        enabled: false,
      }]);

    await initializeScheduledJobs();

    expect(mockAdd).not.toHaveBeenCalledWith(
      "referee-games-sync-scheduled",
      expect.anything(),
      expect.anything(),
    );
  });

  it("uses defaults on DB read error", async () => {
    mockLimit.mockRejectedValue(new Error("DB error"));

    await initializeScheduledJobs();

    expect(mockAdd).toHaveBeenCalledWith(
      "daily-sync",
      { type: "full" },
      expect.objectContaining({
        repeat: expect.objectContaining({ pattern: "0 4 * * *" }),
      }),
    );
  });
});

describe("triggerManualSync", () => {
  it("adds a manual sync job", async () => {
    mockGetJobs.mockResolvedValue([]);

    const result = await triggerManualSync("user-1");

    expect(result).toEqual({
      jobId: "job-1",
      syncRunId: 42,
      status: "queued",
      message: "Sync job has been queued",
    });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledWith("manual-sync", {
      type: "full",
      triggeredBy: "user-1",
      syncRunId: 42,
    });
  });

  it("prevents duplicate manual sync", async () => {
    mockGetJobs.mockResolvedValue([{ name: "manual-sync" }]);

    const result = await triggerManualSync();

    expect(result).toEqual({
      error: "Sync already in progress or queued",
      code: "SYNC_ALREADY_QUEUED",
    });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("prevents duplicate when daily-sync is running", async () => {
    mockGetJobs.mockResolvedValue([{ name: "daily-sync", data: { type: "full" } }]);

    const result = await triggerManualSync();

    expect(result).toEqual(expect.objectContaining({ code: "SYNC_ALREADY_QUEUED" }));
  });
});

describe("getJobStatus", () => {
  it("returns null for unknown job", async () => {
    mockGetJob.mockResolvedValue(null);

    const result = await getJobStatus("unknown");

    expect(result).toBeNull();
  });

  it("returns job status", async () => {
    mockGetJob.mockResolvedValue({
      id: "job-1",
      progress: 50,
      returnvalue: null,
      failedReason: null,
      getState: vi.fn().mockResolvedValue("active"),
    });

    const result = await getJobStatus("job-1");

    expect(result).toEqual({
      jobId: "job-1",
      state: "active",
      progress: 50,
      result: null,
      error: null,
    });
  });
});

describe("updateSyncSchedule", () => {
  it("removes existing daily-sync jobs", async () => {
    mockGetRepeatableJobs.mockResolvedValue([
      { name: "daily-sync", key: "key-1" },
      { name: "other", key: "key-2" },
    ]);

    await updateSyncSchedule(true, "0 5 * * *", "UTC");

    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith("key-1");
    expect(mockRemoveRepeatableByKey).not.toHaveBeenCalledWith("key-2");
  });

  it("adds new schedule when enabled", async () => {
    await updateSyncSchedule(true, "0 5 * * *", "UTC");

    expect(mockAdd).toHaveBeenCalledWith(
      "daily-sync",
      { type: "full" },
      expect.objectContaining({
        repeat: expect.objectContaining({ pattern: "0 5 * * *", tz: "UTC" }),
      }),
    );
  });

  it("does not add job when disabled", async () => {
    await updateSyncSchedule(false, "0 5 * * *", "UTC");

    expect(mockAdd).not.toHaveBeenCalled();
  });
});

describe("updateRefereeSyncSchedule", () => {
  it("removes existing referee jobs and adds new one", async () => {
    mockGetRepeatableJobs.mockResolvedValue([
      { name: "referee-games-sync-scheduled", key: "ref-key-1" },
      { name: "daily-sync", key: "daily-key-1" },
    ]);

    await updateRefereeSyncSchedule(true, 15);

    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith("ref-key-1");
    expect(mockRemoveRepeatableByKey).not.toHaveBeenCalledWith("daily-key-1");
    expect(mockAdd).toHaveBeenCalledWith(
      "referee-games-sync-scheduled",
      { type: "referee-games" },
      expect.objectContaining({
        repeat: { every: 15 * 60 * 1000 },
      }),
    );
  });

  it("only removes jobs when disabled", async () => {
    mockGetRepeatableJobs.mockResolvedValue([
      { name: "referee-games-sync-scheduled", key: "ref-key-1" },
    ]);

    await updateRefereeSyncSchedule(false, 30);

    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith("ref-key-1");
    expect(mockAdd).not.toHaveBeenCalled();
  });
});

describe("triggerRefereeGamesSync", () => {
  it("adds referee-games sync job and returns syncRunId", async () => {
    mockGetJobs.mockResolvedValue([]);

    const result = await triggerRefereeGamesSync("admin-user");

    expect(result).toEqual({ syncRunId: 42, status: "queued" });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledWith(
      "referee-games-sync",
      { type: "referee-games", syncRunId: 42 },
      expect.objectContaining({
        jobId: "referee-games-sync-42",
        removeOnComplete: true,
        removeOnFail: 100,
      }),
    );
  });

  it("returns null when referee-games job already pending", async () => {
    mockGetJobs.mockResolvedValue([{ data: { type: "referee-games" } }]);

    const result = await triggerRefereeGamesSync();

    expect(result).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("uses 'manual' as default triggeredBy", async () => {
    mockGetJobs.mockResolvedValue([]);

    await triggerRefereeGamesSync();

    expect(mockInsert).toHaveBeenCalled();
  });

  it("passes triggeredBy param when provided", async () => {
    mockGetJobs.mockResolvedValue([]);

    await triggerRefereeGamesSync("cron");

    expect(mockInsert).toHaveBeenCalled();
  });
});
