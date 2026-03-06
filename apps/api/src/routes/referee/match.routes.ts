import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { requireReferee, requireAdmin } from "../../middleware/auth";
import { getMatchesWithOpenSlots, recordTakeIntent, cancelTakeIntent, verifyMatchAssignment } from "../../services/referee/referee-match.service";
import { db } from "../../config/database";
import { user as userTable } from "@dragons/db/schema";
import { eq } from "drizzle-orm";

const refereeMatchRoutes = new Hono<AppEnv>();

refereeMatchRoutes.use("/*", requireReferee);

refereeMatchRoutes.get("/matches", async (c) => {
  const sessionUser = c.get("user");

  const [dbUser] = await db
    .select({ refereeId: userTable.refereeId })
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id))
    .limit(1);

  // Admins can view matches even without a linked referee record
  if (!dbUser?.refereeId && sessionUser.role !== "admin") {
    return c.json({ error: "User not linked to a referee record" }, 400);
  }

  const limit = Math.min(Number(c.req.query("limit") || 50), 100);
  const offset = Number(c.req.query("offset") || 0);
  const leagueId = c.req.query("leagueId") ? Number(c.req.query("leagueId")) : undefined;
  const dateFrom = c.req.query("dateFrom") || undefined;
  const dateTo = c.req.query("dateTo") || undefined;

  const result = await getMatchesWithOpenSlots(
    { limit, offset, leagueId, dateFrom, dateTo },
    dbUser?.refereeId ?? null,
  );

  return c.json(result);
});

refereeMatchRoutes.post("/matches/:id/take", async (c) => {
  const sessionUser = c.get("user");

  const [dbUser] = await db
    .select({ refereeId: userTable.refereeId })
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id))
    .limit(1);

  if (!dbUser?.refereeId) {
    return c.json({ error: "User not linked to a referee record" }, 400);
  }

  const matchId = Number(c.req.param("id"));
  const body = await c.req.json<{ slotNumber: number }>();

  if (![1, 2].includes(body.slotNumber)) {
    return c.json({ error: "slotNumber must be 1 or 2" }, 400);
  }

  const result = await recordTakeIntent(matchId, dbUser.refereeId, body.slotNumber);

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as 400 | 404);
  }

  return c.json(result, 201);
});

refereeMatchRoutes.delete("/matches/:id/take", async (c) => {
  const sessionUser = c.get("user");

  const [dbUser] = await db
    .select({ refereeId: userTable.refereeId })
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id))
    .limit(1);

  if (!dbUser?.refereeId) {
    return c.json({ error: "User not linked to a referee record" }, 400);
  }

  const matchId = Number(c.req.param("id"));
  const body = await c.req.json<{ slotNumber: number }>();

  if (![1, 2].includes(body.slotNumber)) {
    return c.json({ error: "slotNumber must be 1 or 2" }, 400);
  }

  const result = await cancelTakeIntent(matchId, dbUser.refereeId, body.slotNumber);

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as 404);
  }

  return c.json(result);
});

refereeMatchRoutes.post("/matches/:id/verify", async (c) => {
  const sessionUser = c.get("user");

  const [dbUser] = await db
    .select({ refereeId: userTable.refereeId })
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id))
    .limit(1);

  if (!dbUser?.refereeId) {
    return c.json({ error: "User not linked to a referee record" }, 400);
  }

  const matchId = Number(c.req.param("id"));
  const result = await verifyMatchAssignment(matchId, dbUser.refereeId);

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as 400 | 404 | 502);
  }

  return c.json(result);
});

// Admin-only: cancel any referee's pending intent
refereeMatchRoutes.delete("/matches/:id/intent/:refereeId", requireAdmin, async (c) => {
  const matchId = Number(c.req.param("id"));
  const targetRefereeId = Number(c.req.param("refereeId"));
  const body = await c.req.json<{ slotNumber: number }>();

  if (![1, 2].includes(body.slotNumber)) {
    return c.json({ error: "slotNumber must be 1 or 2" }, 400);
  }

  const result = await cancelTakeIntent(matchId, targetRefereeId, body.slotNumber);

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as 404);
  }

  return c.json(result);
});

export { refereeMatchRoutes };
