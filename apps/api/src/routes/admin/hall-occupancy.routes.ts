import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { hallOccupancyQuerySchema } from "@dragons/contracts";
import { listHallOccupancy } from "../../services/hall-times/hall-occupancy.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";

const hallOccupancyRoutes = new Hono<AppEnv>();

// GET /admin/hall-occupancy?dateFrom&dateTo&venueId&coverage
hallOccupancyRoutes.get(
  "/hall-occupancy",
  requirePermission("booking", "view"),
  validator("query", hallOccupancyQuerySchema, validationHook),
  describeRoute({
    description:
      "Home games at the club's halls grouped by venue and day, with the hall window they need and how the day's hall time covers it",
    tags: ["Hall occupancy"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    return c.json(await listHallOccupancy(c.req.valid("query")));
  },
);

export { hallOccupancyRoutes };
