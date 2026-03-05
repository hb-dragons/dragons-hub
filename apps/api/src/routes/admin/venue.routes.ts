import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import {
  searchVenues,
  getVenues,
} from "../../services/admin/venue-admin.service";
import { venueSearchQuerySchema } from "./venue.schemas";

const venueRoutes = new Hono();

// GET /admin/venues - List all venues
venueRoutes.get(
  "/venues",
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
  describeRoute({
    description: "Search venues by name",
    tags: ["Venues"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { q, limit } = venueSearchQuerySchema.parse(c.req.query());
    const venues = await searchVenues(q, limit);
    return c.json({ venues });
  },
);

export { venueRoutes };
