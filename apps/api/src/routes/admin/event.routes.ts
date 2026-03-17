import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { AppEnv } from "../../types";
import {
  listDomainEvents,
  triggerManualEvent,
  listFailedNotifications,
} from "../../services/admin/event-admin.service";
import { eventListQuerySchema, triggerEventSchema } from "./event.schemas";

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

// POST /admin/events/trigger - Manually trigger a domain event
eventRoutes.post(
  "/events/trigger",
  describeRoute({
    description: "Manually trigger a domain event for notification processing",
    tags: ["Events"],
    responses: {
      201: { description: "Event created and queued" },
      400: { description: "Validation error" },
    },
  }),
  async (c) => {
    const body = triggerEventSchema.parse(await c.req.json());
    const user = c.get("user");
    const result = await triggerManualEvent({
      ...body,
      actor: user?.id ?? "unknown",
    });
    return c.json(result, 201);
  },
);

// GET /admin/events/failed - List failed notification deliveries
eventRoutes.get(
  "/events/failed",
  describeRoute({
    description: "List failed notification deliveries with event context",
    tags: ["Events"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = eventListQuerySchema.parse(c.req.query());
    const result = await listFailedNotifications({
      page: query.page,
      limit: query.limit,
    });
    return c.json(result);
  },
);

export { eventRoutes };
