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
} = vi.hoisted(() => ({
  mockAdd: vi.fn().mockResolvedValue({ id: "job-1" }),
  mockGetRepeatableJobs: vi.fn().mockResolvedValue([]),
  mockRemoveRepeatableByKey: vi.fn().mockResolvedValue(undefined),
  mockGetJobs: vi.fn().mockResolvedValue([]),
  mockGetJob: vi.fn(),
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
  getJobStatus,
  updateSyncSchedule,
} from "./queues";

beforeEach(() => {
  vi.clearAllMocks();
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
    const { db } = await import("../config/database");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{
          cronExpression: "0 6 * * *",
          timezone: "UTC",
          enabled: true,
        }]),
      }),
    } as never);

    await initializeScheduledJobs();

    expect(mockAdd).toHaveBeenCalledWith(
      "daily-sync",
      { type: "full" },
      expect.objectContaining({
        repeat: expect.objectContaining({ pattern: "0 6 * * *", tz: "UTC" }),
      }),
    );
  });

  it("does not add job when schedule is disabled", async () => {
    const { db } = await import("../config/database");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{
          cronExpression: "0 4 * * *",
          timezone: "Europe/Berlin",
          enabled: false,
        }]),
      }),
    } as never);

    await initializeScheduledJobs();

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("uses defaults on DB read error", async () => {
    const { db } = await import("../config/database");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue(new Error("DB error")),
      }),
    } as never);

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
