import { Hono } from "hono";
import { db } from "../../config/database";
import { teams } from "@dragons/db/schema";

const publicTeamRoutes = new Hono();

// GET /public/teams - List all teams (no auth required)
publicTeamRoutes.get("/teams", async (c) => {
  const result = await db.select().from(teams);
  return c.json(result);
});

export { publicTeamRoutes };
