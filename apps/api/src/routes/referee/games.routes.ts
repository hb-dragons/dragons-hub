import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../../types";
import { requireReferee } from "../../middleware/auth";
import { getRefereeGames } from "../../services/referee/referee-games.service";
import { getVisibleRefereeGames } from "../../services/referee/referee-game-visibility.service";
import { db } from "../../config/database";
import { user as userTable } from "@dragons/db/schema";

const refereeGamesRoutes = new Hono<AppEnv>();
refereeGamesRoutes.use("/*", requireReferee);

refereeGamesRoutes.get("/games", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 100), 500);
  const offset = Number(c.req.query("offset") || 0);
  const search = c.req.query("search") || undefined;
  const status = (c.req.query("status") || "active") as "active" | "cancelled" | "forfeited" | "all";
  const league = c.req.query("league") || undefined;
  const dateFrom = c.req.query("dateFrom") || undefined;
  const dateTo = c.req.query("dateTo") || undefined;

  const sessionUser = c.get("user");
  const params = { limit, offset, search, status, league, dateFrom, dateTo };

  if (sessionUser.role === "admin") {
    const result = await getRefereeGames(params);
    return c.json(result);
  }

  // Referee: look up linked refereeId
  const [userRow] = await db
    .select({ refereeId: userTable.refereeId })
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id))
    .limit(1);

  if (!userRow?.refereeId) {
    return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
  }

  const result = await getVisibleRefereeGames(userRow.refereeId, params);
  return c.json(result);
});

export { refereeGamesRoutes };
