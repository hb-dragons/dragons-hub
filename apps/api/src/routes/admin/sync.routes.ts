import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { describeRoute, validator } from "hono-openapi";
import type { AppEnv } from "../../types";
import { triggerManualSync, getJobStatus, syncQueue } from "../../workers/queues";
import {
  getSyncStatus,
  getSyncLogs,
  getSyncRun,
  getSyncRunEntries,
  getSchedule,
  upsertSchedule,
  getMatchChangesForEntry,
} from "../../services/admin/sync-admin.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import {
  syncLogsQuerySchema,
  syncEntryIdParamSchema,
  syncEntriesQuerySchema,
  syncStreamParamSchema,
  syncJobStatusesQuerySchema,
  syncUpdateScheduleBodySchema,
  syncMatchChangesParamSchema,
} from "@dragons/contracts";
import type { JobType } from "bullmq";
import { subscribeSyncLog, syncLogChannel } from "../../services/sync/sync-log-stream";

const syncRoutes = new Hono<AppEnv>();

const DEFAULT_JOB_STATUSES: JobType[] = ["active", "waiting", "delayed", "failed"];

// POST /admin/sync/trigger - Trigger manual sync via queue (non-blocking)
syncRoutes.post(
  "/sync/trigger",
  requirePermission("sync", "trigger"),
  describeRoute({
    description: "Trigger manual sync via queue (non-blocking)",
    tags: ["Sync"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const userId = c.get("user")?.id;
    const result = await triggerManualSync(userId);
    // triggerManualSync returns an error envelope when a sync is already
    // active/queued — surface it as 409 so the typed client throws instead of
    // treating the rejected trigger as a successful TriggerResponse.
    if ("code" in result) {
      return c.json(result, 409);
    }
    return c.json(result);
  },
);

// GET /admin/sync/status - Overall sync status
syncRoutes.get(
  "/sync/status",
  requirePermission("sync", "view"),
  describeRoute({
    description: "Get overall sync status",
    tags: ["Sync"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const syncType = c.req.query("syncType");
    const result = await getSyncStatus(syncType);
    return c.json(result);
  },
);

// GET /admin/sync/status/:jobId - Specific job status
syncRoutes.get(
  "/sync/status/:jobId",
  requirePermission("sync", "view"),
  describeRoute({
    description: "Get specific job status",
    tags: ["Sync"],
    responses: {
      200: { description: "Success" },
      404: { description: "Job not found" },
    },
  }),
  async (c) => {
    const jobId = c.req.param("jobId");
    const status = await getJobStatus(jobId);

    if (!status) {
      return c.json({ error: "Job not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(status);
  },
);

// GET /admin/sync/jobs - List queue jobs with status filtering
syncRoutes.get(
  "/sync/jobs",
  requirePermission("sync", "view"),
  validator("query", syncJobStatusesQuerySchema, validationHook),
  describeRoute({
    description: "List queue jobs with status filtering",
    tags: ["Sync"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { statuses } = c.req.valid("query");
    const limitRaw = Number(c.req.query("limit"));
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 500 ? limitRaw : 100;

    const jobStatuses: JobType[] = statuses && statuses.length > 0 ? statuses : DEFAULT_JOB_STATUSES;
    const jobs = await syncQueue.getJobs(jobStatuses, 0, limit, false);

    const formattedJobs = await Promise.all(
      jobs.map(async (job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        status: await job.getState(),
        progress: job.progress,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
      })),
    );

    return c.json({
      items: formattedJobs,
      validStatuses: ["active", "waiting", "delayed", "completed", "failed"],
    });
  },
);

// POST /admin/sync/jobs/:jobId/retry - Retry failed job
syncRoutes.post(
  "/sync/jobs/:jobId/retry",
  requirePermission("sync", "trigger"),
  describeRoute({
    description: "Retry a failed job",
    tags: ["Sync"],
    responses: {
      200: { description: "Success" },
      400: { description: "Job is not in failed state" },
      404: { description: "Job not found" },
    },
  }),
  async (c) => {
    const jobId = c.req.param("jobId");
    const job = await syncQueue.getJob(jobId);

    if (!job) {
      return c.json({ error: "Job not found", code: "NOT_FOUND" }, 404);
    }

    const state = await job.getState();
    if (state !== "failed") {
      return c.json({ error: `Job is not in failed state (current: ${state})`, code: "INVALID_STATE" }, 400);
    }

    await job.retry();
    return c.json({ status: "retried" });
  },
);

// DELETE /admin/sync/jobs/:jobId - Remove job
syncRoutes.delete(
  "/sync/jobs/:jobId",
  requirePermission("sync", "trigger"),
  describeRoute({
    description: "Remove a job from the queue",
    tags: ["Sync"],
    responses: {
      200: { description: "Success" },
      404: { description: "Job not found" },
    },
  }),
  async (c) => {
    const jobId = c.req.param("jobId");
    const job = await syncQueue.getJob(jobId);

    if (!job) {
      return c.json({ error: "Job not found", code: "NOT_FOUND" }, 404);
    }

    await job.remove();
    return c.json({ status: "removed" });
  },
);

// GET /admin/sync/jobs/:jobId/logs - BullMQ job logs
syncRoutes.get(
  "/sync/jobs/:jobId/logs",
  requirePermission("sync", "view"),
  describeRoute({
    description: "Get BullMQ logs for a job",
    tags: ["Sync"],
    responses: {
      200: { description: "Success" },
      404: { description: "Job not found" },
    },
  }),
  async (c) => {
    const jobId = c.req.param("jobId");
    const job = await syncQueue.getJob(jobId);

    if (!job) {
      return c.json({ error: "Job not found", code: "NOT_FOUND" }, 404);
    }

    const logs = await syncQueue.getJobLogs(jobId);
    return c.json({ logs: logs.logs, count: logs.count });
  },
);

// GET /admin/sync/logs - Sync run history with pagination + status filtering
syncRoutes.get(
  "/sync/logs",
  requirePermission("sync", "view"),
  validator("query", syncLogsQuerySchema, validationHook),
  describeRoute({
    description: "List sync run history with pagination and status filtering",
    tags: ["Sync"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const result = await getSyncLogs(query);
    return c.json(result);
  },
);

// GET /admin/sync/logs/:id/entries - Per-item entries with filtering + summary
syncRoutes.get(
  "/sync/logs/:id/entries",
  requirePermission("sync", "view"),
  validator("param", syncEntryIdParamSchema, validationHook),
  validator("query", syncEntriesQuerySchema, validationHook),
  describeRoute({
    description: "Get per-item entries for a sync run",
    tags: ["Sync"],
    responses: {
      200: { description: "Success" },
      404: { description: "Sync run not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const query = c.req.valid("query");

    const syncRun = await getSyncRun(id);
    if (!syncRun) {
      return c.json({ error: "Sync run not found", code: "NOT_FOUND" }, 404);
    }

    const result = await getSyncRunEntries(id, query);
    return c.json(result);
  },
);

// GET /admin/sync/logs/:id/match-changes/:apiMatchId - Field-level changes for a match entry
syncRoutes.get(
  "/sync/logs/:id/match-changes/:apiMatchId",
  requirePermission("sync", "view"),
  validator("param", syncEntryIdParamSchema.merge(syncMatchChangesParamSchema), validationHook),
  describeRoute({
    description: "Get field-level changes for a match entry",
    tags: ["Sync"],
    responses: {
      200: { description: "Success" },
      404: { description: "Sync run or match not found" },
    },
  }),
  async (c) => {
    const { id, apiMatchId } = c.req.valid("param");

    const syncRun = await getSyncRun(id);
    if (!syncRun) {
      return c.json({ error: "Sync run not found", code: "NOT_FOUND" }, 404);
    }

    const result = await getMatchChangesForEntry(id, apiMatchId);
    if (!result) {
      return c.json({ error: "Match or version not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// GET /admin/sync/logs/:id/stream - SSE real-time streaming via Redis pub/sub
syncRoutes.get(
  "/sync/logs/:id/stream",
  requirePermission("sync", "view"),
  validator("param", syncStreamParamSchema, validationHook),
  describeRoute({
    description: "Stream real-time sync entries via SSE",
    tags: ["Sync"],
    responses: {
      200: { description: "Success" },
      400: { description: "Sync is not running" },
      404: { description: "Sync run not found" },
    },
  }),
  async (c) => {
    const { id: syncRunId } = c.req.valid("param");

    const syncRun = await getSyncRun(syncRunId);
    if (!syncRun) {
      return c.json({ error: "Sync run not found", code: "NOT_FOUND" }, 404);
    }

    if (syncRun.status !== "running") {
      return c.json(
        { error: "Sync is not running", code: "SYNC_NOT_RUNNING", status: syncRun.status },
        400,
      );
    }

    const channelName = syncLogChannel(syncRunId);

    return streamSSE(c, async (stream) => {
      let streamDone: () => void;
      const donePromise = new Promise<void>((resolve) => {
        streamDone = resolve;
      });

      // One shared process subscriber fans this connection out (was a fresh
      // `new Redis()` per connection — a Redis client-exhaustion vector).
      const unsubscribe = await subscribeSyncLog(syncRunId, (payload) => {
        void (async () => {
          const data = payload as { type?: string };
          if (data?.type === "complete") {
            await stream.writeSSE({
              event: "complete",
              data: JSON.stringify({ syncRunId }),
            });
            streamDone();
          } else {
            await stream.writeSSE({
              event: "entry",
              data: JSON.stringify(payload),
            });
          }
        })();
      });

      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ syncRunId, channelName }),
      });

      const pingInterval = setInterval(() => {
        void (async () => {
          try {
            await stream.writeSSE({
              event: "ping",
              data: JSON.stringify({ timestamp: Date.now() }),
            });
          } catch {
            clearInterval(pingInterval);
          }
        })();
      }, 30000);

      stream.onAbort(() => {
        clearInterval(pingInterval);
        streamDone();
      });

      try {
        await donePromise;
      } finally {
        clearInterval(pingInterval);
        await unsubscribe();
      }
    });
  },
);

// GET /admin/sync/schedule - Get current schedule
syncRoutes.get(
  "/sync/schedule",
  requirePermission("sync", "view"),
  describeRoute({
    description: "Get current sync schedule",
    tags: ["Sync"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const syncType = c.req.query("syncType") ?? "full";
    const schedule = await getSchedule(syncType);
    return c.json(schedule);
  },
);

// PUT /admin/sync/schedule - Update schedule
syncRoutes.put(
  "/sync/schedule",
  requirePermission("sync", "trigger"),
  validator("json", syncUpdateScheduleBodySchema, validationHook),
  describeRoute({
    description: "Update sync schedule",
    tags: ["Sync"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const schedule = await upsertSchedule(body);
    return c.json(schedule);
  },
);

export { syncRoutes };
