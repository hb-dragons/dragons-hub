import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { describeRoute } from "hono-openapi";
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
import {
  syncLogsQuerySchema,
  syncEntryIdParamSchema,
  syncEntriesQuerySchema,
  syncStreamParamSchema,
  jobStatusesQuerySchema,
  updateScheduleBodySchema,
  matchChangesParamSchema,
} from "./sync.schemas";
import type { JobType } from "bullmq";
import Redis from "ioredis";
import { env } from "../../config/env";

const syncRoutes = new Hono<AppEnv>();

const DEFAULT_JOB_STATUSES: JobType[] = ["active", "waiting", "delayed", "failed"];

// POST /admin/sync/trigger - Trigger manual sync via queue (non-blocking)
syncRoutes.post(
  "/sync/trigger",
  describeRoute({
    description: "Trigger manual sync via queue (non-blocking)",
    tags: ["Sync"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const userId = c.get("user")?.id;
    const result = await triggerManualSync(userId);
    return c.json(result);
  },
);

// GET /admin/sync/status - Overall sync status
syncRoutes.get(
  "/sync/status",
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
  describeRoute({
    description: "List queue jobs with status filtering",
    tags: ["Sync"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { statuses } = jobStatusesQuerySchema.parse({
      statuses: c.req.query("statuses"),
    });

    const jobStatuses: JobType[] = statuses && statuses.length > 0 ? statuses : DEFAULT_JOB_STATUSES;
    const jobs = await syncQueue.getJobs(jobStatuses, 0, 100, false);

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
  describeRoute({
    description: "List sync run history with pagination and status filtering",
    tags: ["Sync"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = syncLogsQuerySchema.parse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      status: c.req.query("status"),
      syncType: c.req.query("syncType"),
    });
    const result = await getSyncLogs(query);
    return c.json(result);
  },
);

// GET /admin/sync/logs/:id/entries - Per-item entries with filtering + summary
syncRoutes.get(
  "/sync/logs/:id/entries",
  describeRoute({
    description: "Get per-item entries for a sync run",
    tags: ["Sync"],
    responses: {
      200: { description: "Success" },
      404: { description: "Sync run not found" },
    },
  }),
  async (c) => {
    const { id } = syncEntryIdParamSchema.parse({ id: c.req.param("id") });
    const query = syncEntriesQuerySchema.parse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      entityType: c.req.query("entityType"),
      action: c.req.query("action"),
      search: c.req.query("search"),
    });

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
  describeRoute({
    description: "Get field-level changes for a match entry",
    tags: ["Sync"],
    responses: {
      200: { description: "Success" },
      404: { description: "Sync run or match not found" },
    },
  }),
  async (c) => {
    const { id } = syncEntryIdParamSchema.parse({ id: c.req.param("id") });
    const { apiMatchId } = matchChangesParamSchema.parse({ apiMatchId: c.req.param("apiMatchId") });

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
    const { id: syncRunId } = syncStreamParamSchema.parse({ id: c.req.param("id") });

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

    const channelName = `sync:${syncRunId}:logs`;

    return streamSSE(c, async (stream) => {
      const redisSubscriber = new Redis(env.REDIS_URL);

      try {
        await redisSubscriber.subscribe(channelName);

        await stream.writeSSE({
          event: "connected",
          data: JSON.stringify({ syncRunId, channelName }),
        });

        let streamDone: () => void;
        const donePromise = new Promise<void>((resolve) => {
          streamDone = resolve;
        });

        redisSubscriber.on("message", async (channel, message) => {
          if (channel === channelName) {
            try {
              const data = JSON.parse(message);
              if (data.type === "complete") {
                await stream.writeSSE({
                  event: "complete",
                  data: JSON.stringify({ syncRunId }),
                });
                streamDone();
              } else {
                await stream.writeSSE({
                  event: "entry",
                  data: message,
                });
              }
            } catch {
              // Ignore parse errors
            }
          }
        });

        const pingInterval = setInterval(async () => {
          try {
            await stream.writeSSE({
              event: "ping",
              data: JSON.stringify({ timestamp: Date.now() }),
            });
          } catch {
            clearInterval(pingInterval);
          }
        }, 30000);

        stream.onAbort(() => {
          clearInterval(pingInterval);
          streamDone();
        });

        await donePromise;
        clearInterval(pingInterval);
      } finally {
        await redisSubscriber.unsubscribe(channelName);
        await redisSubscriber.quit();
      }
    });
  },
);

// GET /admin/sync/schedule - Get current schedule
syncRoutes.get(
  "/sync/schedule",
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
  describeRoute({
    description: "Update sync schedule",
    tags: ["Sync"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const body = updateScheduleBodySchema.parse(await c.req.json());
    const schedule = await upsertSchedule(body);
    return c.json(schedule);
  },
);

export { syncRoutes };
