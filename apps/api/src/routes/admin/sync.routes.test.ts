import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  triggerManualSync: vi.fn(),
  getJobStatus: vi.fn(),
  syncQueue: {
    getJobs: vi.fn(),
    getJob: vi.fn(),
    getJobLogs: vi.fn(),
  },
  getSyncStatus: vi.fn(),
  getSyncLogs: vi.fn(),
  getSyncRun: vi.fn(),
  getSyncRunEntries: vi.fn(),
  getSchedule: vi.fn(),
  upsertSchedule: vi.fn(),
  getMatchChangesForEntry: vi.fn(),
  redisInstances: [] as MockRedis[],
}));

interface MockRedis {
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  _emit: (event: string, ...args: unknown[]) => void;
}

vi.mock("../../workers/queues", () => ({
  triggerManualSync: mocks.triggerManualSync,
  getJobStatus: mocks.getJobStatus,
  syncQueue: mocks.syncQueue,
}));

vi.mock("../../services/admin/sync-admin.service", () => ({
  getSyncStatus: mocks.getSyncStatus,
  getSyncLogs: mocks.getSyncLogs,
  getSyncRun: mocks.getSyncRun,
  getSyncRunEntries: mocks.getSyncRunEntries,
  getSchedule: mocks.getSchedule,
  upsertSchedule: mocks.upsertSchedule,
  getMatchChangesForEntry: mocks.getMatchChangesForEntry,
}));

vi.mock("../../config/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("ioredis", () => {
  return {
    default: class MockRedisImpl {
      _handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      subscribe = vi.fn(async () => {});
      unsubscribe = vi.fn(async () => {});
      quit = vi.fn(async () => {});

      on(event: string, handler: (...args: unknown[]) => void) {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(handler);
        return this;
      }

      _emit(event: string, ...args: unknown[]) {
        this._handlers[event]?.forEach((h) => h(...args));
      }

      constructor() {
        mocks.redisInstances.push(this as unknown as MockRedis);
      }
    },
  };
});

// --- Imports (after mocks) ---

import { syncRoutes } from "./sync.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware
const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/", syncRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redisInstances.length = 0;
});

describe("POST /sync/trigger", () => {
  it("triggers manual sync", async () => {
    mocks.triggerManualSync.mockResolvedValue({
      jobId: "123",
      syncRunId: 42,
      status: "queued",
      message: "Sync job has been queued",
    });

    const res = await app.request("/sync/trigger", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      jobId: "123",
      syncRunId: 42,
      status: "queued",
      message: "Sync job has been queued",
    });
  });

  it("returns error when sync already queued", async () => {
    mocks.triggerManualSync.mockResolvedValue({
      error: "Sync already in progress or queued",
      code: "SYNC_ALREADY_QUEUED",
    });

    const res = await app.request("/sync/trigger", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ code: "SYNC_ALREADY_QUEUED" });
  });
});

describe("GET /sync/status", () => {
  it("returns sync status", async () => {
    const status = { lastSync: null, isRunning: false };
    mocks.getSyncStatus.mockResolvedValue(status);

    const res = await app.request("/sync/status");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(status);
  });
});

describe("GET /sync/status/:jobId", () => {
  it("returns job status", async () => {
    const jobStatus = { jobId: "1", state: "completed", progress: 100, result: null, error: null };
    mocks.getJobStatus.mockResolvedValue(jobStatus);

    const res = await app.request("/sync/status/1");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(jobStatus);
  });

  it("returns 404 for unknown job", async () => {
    mocks.getJobStatus.mockResolvedValue(null);

    const res = await app.request("/sync/status/nonexistent");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("GET /sync/jobs", () => {
  it("lists jobs with default statuses", async () => {
    const mockJob = {
      id: "1",
      name: "manual-sync",
      data: { type: "full" },
      getState: vi.fn().mockResolvedValue("completed"),
      progress: 100,
      timestamp: 1000,
      processedOn: 2000,
      finishedOn: 3000,
      failedReason: null,
    };
    mocks.syncQueue.getJobs.mockResolvedValue([mockJob]);

    const res = await app.request("/sync/jobs");

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual({
      id: "1",
      name: "manual-sync",
      data: { type: "full" },
      status: "completed",
      progress: 100,
      timestamp: 1000,
      processedOn: 2000,
      finishedOn: 3000,
      failedReason: null,
    });
    expect(mocks.syncQueue.getJobs).toHaveBeenCalledWith(
      ["active", "waiting", "delayed", "failed"],
      0,
      100,
      false,
    );
  });

  it("lists jobs with custom statuses", async () => {
    mocks.syncQueue.getJobs.mockResolvedValue([]);

    const res = await app.request("/sync/jobs?statuses=completed,failed");

    expect(res.status).toBe(200);
    expect(mocks.syncQueue.getJobs).toHaveBeenCalledWith(["completed", "failed"], 0, 100, false);
  });

  it("filters out invalid statuses from query", async () => {
    mocks.syncQueue.getJobs.mockResolvedValue([]);

    const res = await app.request("/sync/jobs?statuses=active,bogus");

    expect(res.status).toBe(200);
    expect(mocks.syncQueue.getJobs).toHaveBeenCalledWith(["active"], 0, 100, false);
  });
});

describe("POST /sync/jobs/:jobId/retry", () => {
  it("retries a failed job", async () => {
    const mockJob = {
      getState: vi.fn().mockResolvedValue("failed"),
      retry: vi.fn().mockResolvedValue(undefined),
    };
    mocks.syncQueue.getJob.mockResolvedValue(mockJob);

    const res = await app.request("/sync/jobs/1/retry", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ status: "retried" });
    expect(mockJob.retry).toHaveBeenCalled();
  });

  it("returns 404 for unknown job", async () => {
    mocks.syncQueue.getJob.mockResolvedValue(null);

    const res = await app.request("/sync/jobs/unknown/retry", { method: "POST" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects retrying non-failed job", async () => {
    mocks.syncQueue.getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("completed"),
    });

    const res = await app.request("/sync/jobs/1/retry", { method: "POST" });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("DELETE /sync/jobs/:jobId", () => {
  it("removes a job", async () => {
    const mockJob = { remove: vi.fn().mockResolvedValue(undefined) };
    mocks.syncQueue.getJob.mockResolvedValue(mockJob);

    const res = await app.request("/sync/jobs/1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ status: "removed" });
    expect(mockJob.remove).toHaveBeenCalled();
  });

  it("returns 404 for unknown job", async () => {
    mocks.syncQueue.getJob.mockResolvedValue(null);

    const res = await app.request("/sync/jobs/unknown", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("GET /sync/jobs/:jobId/logs", () => {
  it("returns job logs", async () => {
    mocks.syncQueue.getJob.mockResolvedValue({});
    mocks.syncQueue.getJobLogs.mockResolvedValue({
      logs: ["Step 1 done", "Step 2 done"],
      count: 2,
    });

    const res = await app.request("/sync/jobs/1/logs");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      logs: ["Step 1 done", "Step 2 done"],
      count: 2,
    });
  });

  it("returns 404 for unknown job", async () => {
    mocks.syncQueue.getJob.mockResolvedValue(null);

    const res = await app.request("/sync/jobs/unknown/logs");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("GET /sync/logs", () => {
  it("returns paginated sync logs", async () => {
    const logsResult = { items: [], total: 0, limit: 20, offset: 0, hasMore: false };
    mocks.getSyncLogs.mockResolvedValue(logsResult);

    const res = await app.request("/sync/logs");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(logsResult);
    expect(mocks.getSyncLogs).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  });

  it("passes status filter and pagination", async () => {
    mocks.getSyncLogs.mockResolvedValue({ items: [], total: 0, limit: 5, offset: 10, hasMore: false });

    const res = await app.request("/sync/logs?limit=5&offset=10&status=failed");

    expect(res.status).toBe(200);
    expect(mocks.getSyncLogs).toHaveBeenCalledWith({ limit: 5, offset: 10, status: "failed" });
  });

  it("returns 400 for invalid status", async () => {
    const res = await app.request("/sync/logs?status=invalid");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /sync/logs/:id/entries", () => {
  it("returns entries with summary", async () => {
    mocks.getSyncRun.mockResolvedValue({ id: 1, status: "completed" });
    const entriesResult = {
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
      summary: { created: 0, updated: 0, skipped: 0, failed: 0 },
    };
    mocks.getSyncRunEntries.mockResolvedValue(entriesResult);

    const res = await app.request("/sync/logs/1/entries");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(entriesResult);
  });

  it("passes filters to service", async () => {
    mocks.getSyncRun.mockResolvedValue({ id: 1 });
    mocks.getSyncRunEntries.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0, hasMore: false, summary: {} });

    await app.request("/sync/logs/1/entries?limit=10&entityType=league&action=created");

    expect(mocks.getSyncRunEntries).toHaveBeenCalledWith(1, {
      limit: 10,
      offset: 0,
      entityType: "league",
      action: "created",
    });
  });

  it("returns 404 when sync run not found", async () => {
    mocks.getSyncRun.mockResolvedValue(null);

    const res = await app.request("/sync/logs/999/entries");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid id param", async () => {
    const res = await app.request("/sync/logs/0/entries");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("passes search param to service", async () => {
    mocks.getSyncRun.mockResolvedValue({ id: 1 });
    mocks.getSyncRunEntries.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0, hasMore: false, summary: {} });

    await app.request("/sync/logs/1/entries?search=Dragons");

    expect(mocks.getSyncRunEntries).toHaveBeenCalledWith(1, {
      limit: 20,
      offset: 0,
      search: "Dragons",
    });
  });
});

describe("GET /sync/logs/:id/match-changes/:apiMatchId", () => {
  it("returns changes for a valid match and sync run", async () => {
    mocks.getSyncRun.mockResolvedValue({ id: 1, status: "completed" });
    mocks.getMatchChangesForEntry.mockResolvedValue({
      changes: [
        { fieldName: "homeScore", oldValue: "0", newValue: "85" },
        { fieldName: "guestScore", oldValue: "0", newValue: "72" },
      ],
    });

    const res = await app.request("/sync/logs/1/match-changes/5001");

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.changes).toHaveLength(2);
    expect(mocks.getMatchChangesForEntry).toHaveBeenCalledWith(1, 5001);
  });

  it("returns 404 when sync run not found", async () => {
    mocks.getSyncRun.mockResolvedValue(null);

    const res = await app.request("/sync/logs/999/match-changes/5001");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.getMatchChangesForEntry).not.toHaveBeenCalled();
  });

  it("returns 404 when match or version not found", async () => {
    mocks.getSyncRun.mockResolvedValue({ id: 1, status: "completed" });
    mocks.getMatchChangesForEntry.mockResolvedValue(null);

    const res = await app.request("/sync/logs/1/match-changes/9999");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 for invalid sync run id", async () => {
    const res = await app.request("/sync/logs/0/match-changes/5001");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for invalid apiMatchId", async () => {
    const res = await app.request("/sync/logs/1/match-changes/0");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("GET /sync/logs/:id/stream", () => {
  it("returns 404 when sync run not found", async () => {
    mocks.getSyncRun.mockResolvedValue(null);

    const res = await app.request("/sync/logs/999/stream");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 400 when sync is not running", async () => {
    mocks.getSyncRun.mockResolvedValue({ id: 1, status: "completed" });

    const res = await app.request("/sync/logs/1/stream");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "SYNC_NOT_RUNNING" });
  });

  it("returns 400 for invalid stream id", async () => {
    const res = await app.request("/sync/logs/0/stream");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("streams SSE events from Redis pub/sub", async () => {
    mocks.getSyncRun.mockResolvedValue({ id: 1, status: "running" });

    const res = await app.request("/sync/logs/1/stream");

    expect(res.headers.get("content-type")).toBe("text/event-stream");

    // Start consuming response body (waits for stream to close)
    const textPromise = res.text();

    // Give the async callback time to create Redis and subscribe
    await new Promise((r) => setTimeout(r, 50));

    expect(mocks.redisInstances.length).toBe(1);
    const redis = mocks.redisInstances[0];
    expect(redis.subscribe).toHaveBeenCalledWith("sync:1:logs");

    // Emit events through mock Redis
    redis._emit("message", "sync:1:logs", JSON.stringify({ entityType: "league", action: "created" }));
    redis._emit("message", "other-channel", "ignored");
    redis._emit("message", "sync:1:logs", "not-valid-json");
    redis._emit("message", "sync:1:logs", JSON.stringify({ type: "complete" }));

    const text = await textPromise;

    expect(text).toContain("event: connected");
    expect(text).toContain("event: entry");
    expect(text).toContain("event: complete");
    expect(text).toContain('"syncRunId"');
    expect(text).not.toContain("ignored");

    // Verify cleanup
    expect(redis.unsubscribe).toHaveBeenCalledWith("sync:1:logs");
    expect(redis.quit).toHaveBeenCalled();
  }, 10000);
});

describe("GET /sync/schedule", () => {
  it("returns the schedule", async () => {
    const schedule = {
      id: 1,
      enabled: true,
      cronExpression: "0 4 * * *",
      timezone: "Europe/Berlin",
    };
    mocks.getSchedule.mockResolvedValue(schedule);

    const res = await app.request("/sync/schedule");

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(schedule);
  });
});

describe("PUT /sync/schedule", () => {
  it("updates the schedule", async () => {
    const updated = {
      id: 1,
      enabled: false,
      cronExpression: "0 6 * * *",
      timezone: "UTC",
    };
    mocks.upsertSchedule.mockResolvedValue(updated);

    const res = await app.request("/sync/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false, cronExpression: "0 6 * * *", timezone: "UTC" }),
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual(updated);
    expect(mocks.upsertSchedule).toHaveBeenCalledWith({
      enabled: false,
      cronExpression: "0 6 * * *",
      timezone: "UTC",
    });
  });

  it("returns 400 for invalid cron expression", async () => {
    const res = await app.request("/sync/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cronExpression: "invalid cron" }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
