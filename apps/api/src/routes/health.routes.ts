import { Hono } from "hono";
import { db } from "../config/database";
import { redis } from "../config/redis";
import { sql } from "drizzle-orm";

const healthRoutes = new Hono();

healthRoutes.get("/health", async (c) => {
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
});

export { healthRoutes };
