import { Hono } from "hono";
import {
  searchVenues,
  getVenues,
} from "../../services/admin/venue-admin.service";
import { venueSearchQuerySchema } from "./venue.schemas";

const venueRoutes = new Hono();

// GET /admin/venues - List all venues
venueRoutes.get("/venues", async (c) => {
  const result = await getVenues();
  return c.json(result);
});

// GET /admin/venues/search?q=<query>&limit=<n>
venueRoutes.get("/venues/search", async (c) => {
  const { q, limit } = venueSearchQuerySchema.parse(c.req.query());
  const venues = await searchVenues(q, limit);
  return c.json({ venues });
});

export { venueRoutes };
