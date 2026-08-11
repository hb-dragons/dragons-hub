import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { getDb } from "../config/database";
import { getRedis } from "../config/redis";
import { sql, eq, isNull, and, desc } from "drizzle-orm";
import { domainEvents, syncRuns } from "@dragons/db/schema";
import { syncQueue, domainEventsQueue, outboxPollQueue } from "../workers/queues";
import { requireAnyRole } from "../middleware/rbac";

const healthRoutes = new Hono();

healthRoutes.get(
  "/health",
  describeRoute({
    description: "Check API, database, and Redis health",
    tags: ["Health"],
    responses: {
      200: { description: "All services healthy" },
      503: { description: "One or more services degraded" },
    },
  }),
  async (c) => {
    const db = getDb();
    const redis = getRedis();
    let dbStatus: "ok" | "error" = "error";
    let redisStatus: "ok" | "error" = "error";

    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = "ok";
    } catch {
      // db unreachable
    }

    try {
      await redis.ping();
      redisStatus = "ok";
    } catch {
      // redis unreachable
    }

    const allOk = dbStatus === "ok" && redisStatus === "ok";

    return c.json(
      { status: allOk ? "ok" : "degraded", db: dbStatus, redis: redisStatus },
      allOk ? 200 : 503,
    );
  },
);

// Admin-only. Unlike the shallow `/health` above (which uptime probes poll and
// which only reports up/down per dependency), the deep probe reports queue
// depths, outbox lag and sync freshness — an operational picture of the club's
// pipeline that does not belong in an anonymous response.
healthRoutes.get(
  "/health/deep",
  requireAnyRole("admin"),
  describeRoute({
    description: "Deep health probe (DB, Redis, queues, outbox lag, sync freshness)",
    tags: ["Health"],
    responses: {
      200: { description: "Healthy" },
      401: { description: "Unauthenticated" },
      403: { description: "Not an admin" },
      503: { description: "Degraded" },
    },
  }),
  async (c) => {
    const db = getDb();
    const redis = getRedis();
    const checks: Record<string, unknown> = {};

    try {
      await db.execute(sql`SELECT 1`);
      checks.db = "ok";
    } catch {
      checks.db = "error";
    }

    try {
      await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    try {
      // Measure lag over *unprocessed* events (processed_at IS NULL), not merely
      // un-enqueued ones — so an event that was enqueued but never delivered
      // (stranded) shows up as lag and trips `degraded`.
      const [oldest] = await db
        .select({ createdAt: domainEvents.createdAt })
        .from(domainEvents)
        .where(isNull(domainEvents.processedAt))
        .orderBy(domainEvents.createdAt)
        .limit(1);
      checks.outboxLagSeconds = oldest
        ? Math.floor((Date.now() - oldest.createdAt.getTime()) / 1000)
        : 0;
    } catch {
      checks.outboxLagSeconds = "error";
    }

    try {
      const [last] = await db
        .select({ completedAt: syncRuns.completedAt, status: syncRuns.status })
        .from(syncRuns)
        .where(and(eq(syncRuns.syncType, "full"), eq(syncRuns.status, "completed")))
        .orderBy(desc(syncRuns.completedAt))
        .limit(1);
      checks.lastSuccessfulSyncAgeSeconds = last?.completedAt
        ? Math.floor((Date.now() - last.completedAt.getTime()) / 1000)
        : null;
    } catch {
      checks.lastSuccessfulSyncAgeSeconds = "error";
    }

    try {
      const counts = await syncQueue.getJobCounts("waiting", "active", "delayed", "failed");
      checks.syncQueue = counts;
    } catch {
      checks.syncQueue = "error";
    }

    try {
      const counts = await domainEventsQueue.getJobCounts("waiting", "active", "delayed", "failed");
      checks.eventsQueue = counts;
    } catch {
      checks.eventsQueue = "error";
    }

    try {
      const counts = await outboxPollQueue.getJobCounts("waiting", "active", "delayed", "failed");
      checks.outboxPollQueue = counts;
    } catch {
      checks.outboxPollQueue = "error";
    }

    const degraded =
      checks.db !== "ok" ||
      checks.redis !== "ok" ||
      (typeof checks.outboxLagSeconds === "number" && checks.outboxLagSeconds > 300);

    return c.json(
      { status: degraded ? "degraded" : "ok", checks },
      degraded ? 503 : 200,
    );
  },
);

export { healthRoutes };
