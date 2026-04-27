import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { db } from "../../config/database";
import { teams } from "@dragons/db/schema";
import { desc, asc } from "drizzle-orm";
import { getTeamStats } from "../../services/public/team-stats.service";

const publicTeamRoutes = new Hono();

// GET /public/teams - List all teams (no auth required)
publicTeamRoutes.get(
  "/teams",
  describeRoute({
    description: "List all teams (public)",
    tags: ["Public"],
    security: [],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const result = await db
      .select()
      .from(teams)
      .orderBy(desc(teams.isOwnClub), asc(teams.displayOrder), asc(teams.name));
    return c.json(result);
  },
);

// GET /public/teams/:id/stats - Season stats and recent form for a team
publicTeamRoutes.get(
  "/teams/:id/stats",
  describeRoute({
    description: "Get season stats and recent form for a team (public)",
    tags: ["Public"],
    security: [],
    responses: {
      200: { description: "Team stats" },
      400: { description: "Invalid team id" },
      404: { description: "Team not found" },
    },
  }),
  async (c) => {
    const raw = Number(c.req.param("id"));
    if (!Number.isInteger(raw) || raw <= 0) {
      return c.json({ error: "Invalid team id" }, 400);
    }
    const stats = await getTeamStats(raw);
    if (!stats) {
      return c.json({ error: "Team not found" }, 404);
    }
    return c.json(stats);
  },
);

export { publicTeamRoutes };
