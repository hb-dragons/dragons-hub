import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { AppEnv } from "../../types";
import { listDomainEvents } from "../../services/admin/event-admin.service";
import { eventListQuerySchema } from "./event.schemas";

const eventRoutes = new Hono<AppEnv>();

// GET /admin/events - List domain events
eventRoutes.get(
  "/events",
  describeRoute({
    description: "List domain events with filtering and pagination",
    tags: ["Events"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = eventListQuerySchema.parse(c.req.query());
    const result = await listDomainEvents(query);
    return c.json(result);
  },
);

export { eventRoutes };
