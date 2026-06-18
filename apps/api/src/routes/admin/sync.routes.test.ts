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
  subscribeSyncLog: vi.fn(),
  unsubscribe: vi.fn(async () => {}),
  syncLogListeners: [] as ((payload: unknown) => void)[],
}));

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

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() =>
    async (_c: unknown, next: () => Promise<void>) => next(),
  ),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("../../services/sync/sync-log-stream", () => ({
  syncLogChannel: (id: number) => `sync:${id}:logs`,
  subscribeSyncLog: (id: number, onMessage: (payload: unknown) => void) =>
    mocks.subscribeSyncLog(id, onMessage),
}));

// --- Imports (after mocks) ---

import { syncRoutes } from "./sync.routes";
import { errorHandler } from "../../middleware/error";

// Test app without auth middleware — inject a fake user for routes that need it
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("user", { id: "test-user-123" } as AppEnv["Variables"]["user"]);
  await next();
});
app.onError(errorHandler);
app.route("/", syncRoutes);

function json(response: Response) {
  return response.json();
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncLogListeners.length = 0;
  mocks.subscribeSyncLog.mockImplementation(
    (_id: number, onMessage: (payload: unknown) => void) => {
      mocks.syncLogListeners.push(onMessage);
      return Promise.resolve(mocks.unsubscribe);
    },
  );
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
    expect(mocks.triggerManualSync).toHaveBeenCalledWith("test-user-123");
  });

  it("returns error when sync already queued", async () => {
    mocks.triggerManualSync.mockResolvedValue({
      error: "Sync already in progress or queued",
      code: "SYNC_ALREADY_QUEUED",
    });

    const res = await app.request("/sync/trigger", { method: "POST" });

    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({
      error: "Sync already in progress or queued",
      code: "SYNC_ALREADY_QUEUED",
    });
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

  it("streams SSE events from the shared sync-log subscriber", async () => {
    mocks.getSyncRun.mockResolvedValue({ id: 1, status: "running" });

    const res = await app.request("/sync/logs/1/stream");

    expect(res.headers.get("content-type")).toBe("text/event-stream");

    // Start consuming response body (waits for stream to close)
    const textPromise = res.text();

    // Give the async callback time to attach the shared subscriber
    await new Promise((r) => setTimeout(r, 50));

    expect(mocks.subscribeSyncLog).toHaveBeenCalledWith(1, expect.any(Function));
    const listener = mocks.syncLogListeners[0]!;

    // The shared fanout delivers already-parsed payloads (not raw strings).
    listener({ entityType: "league", action: "created" });
    listener({ type: "complete" });

    const text = await textPromise;

    expect(text).toContain("event: connected");
    expect(text).toContain("event: entry");
    expect(text).toContain("event: complete");
    expect(text).toContain('"syncRunId"');

    // Verify cleanup goes through the shared subscriber, not a per-conn client
    expect(mocks.unsubscribe).toHaveBeenCalled();
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
    expect(mocks.upsertSchedule).toHaveBeenCalledWith(
      {
        enabled: false,
        cronExpression: "0 6 * * *",
        timezone: "UTC",
      },
      "test-user-123",
    );
  });

  it("ignores a client-supplied updatedBy and uses the session user id", async () => {
    mocks.upsertSchedule.mockResolvedValue({ id: 1, enabled: true });

    const res = await app.request("/sync/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, updatedBy: "attacker-spoof" }),
    });

    expect(res.status).toBe(200);
    // The spoofed audit field must never reach the service; the actor is
    // derived server-side from the session.
    expect(mocks.upsertSchedule).toHaveBeenCalledWith(
      expect.not.objectContaining({ updatedBy: "attacker-spoof" }),
      "test-user-123",
    );
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
