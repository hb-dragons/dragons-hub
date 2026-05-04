import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { db } from "../config/database";
import { redis } from "../config/redis";
import { sql, eq, isNull, and, desc } from "drizzle-orm";
import { domainEvents, syncRuns } from "@dragons/db/schema";
import { syncQueue, domainEventsQueue } from "../workers/queues";

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

healthRoutes.get(
  "/health/deep",
  describeRoute({
    description: "Deep health probe (DB, Redis, queues, outbox lag, sync freshness)",
    tags: ["Health"],
    responses: {
      200: { description: "Healthy" },
      503: { description: "Degraded" },
    },
  }),
  async (c) => {
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
      const [oldest] = await db
        .select({ createdAt: domainEvents.createdAt })
        .from(domainEvents)
        .where(isNull(domainEvents.enqueuedAt))
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
