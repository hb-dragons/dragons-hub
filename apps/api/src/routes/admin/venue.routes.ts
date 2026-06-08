import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import {
  searchVenues,
  getVenues,
} from "../../services/admin/venue-admin.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import type { AppEnv } from "../../types";
import { venueSearchQuerySchema } from "@dragons/contracts";

const venueRoutes = new Hono<AppEnv>();

// GET /admin/venues - List all venues
venueRoutes.get(
  "/venues",
  requirePermission("venue", "view"),
  describeRoute({
    description: "List all venues",
    tags: ["Venues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const result = await getVenues();
    return c.json(result);
  },
);

// GET /admin/venues/search?q=<query>&limit=<n>
venueRoutes.get(
  "/venues/search",
  requirePermission("venue", "view"),
  validator("query", venueSearchQuerySchema, validationHook),
  describeRoute({
    description: "Search venues by name",
    tags: ["Venues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { q, limit } = c.req.valid("query");
    const venues = await searchVenues(q, limit);
    return c.json({ venues });
  },
);

export { venueRoutes };
