import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { getHomeDashboard } from "../../services/public/home-dashboard.service";

const publicHomeRoutes = new Hono();

// GET /public/home/dashboard - Aggregated home screen data (no auth required)
publicHomeRoutes.get(
  "/home/dashboard",
  describeRoute({
    description: "Aggregated home screen data: next game, recent results, upcoming games, club stats",
    tags: ["Public"],
    security: [],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const dashboard = await getHomeDashboard();
    return c.json(dashboard);
  },
);

export { publicHomeRoutes };
