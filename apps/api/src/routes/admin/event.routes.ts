import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppEnv } from "../../types";
import {
  listDomainEvents,
  triggerManualEvent,
  listFailedNotifications,
} from "../../services/admin/event-admin.service";
import { requirePermission } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { eventListQuerySchema, triggerEventSchema } from "@dragons/contracts";

const eventRoutes = new Hono<AppEnv>();
const settingsUpdate = requirePermission("settings", "update");

// GET /admin/events - List domain events
eventRoutes.get(
  "/events",
  settingsUpdate,
  validator("query", eventListQuerySchema, validationHook),
  describeRoute({
    description: "List domain events with filtering and pagination",
    tags: ["Events"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const result = await listDomainEvents(query);
    return c.json(result);
  },
);

// POST /admin/events/trigger - Manually trigger a domain event
eventRoutes.post(
  "/events/trigger",
  settingsUpdate,
  validator("json", triggerEventSchema, validationHook),
  describeRoute({
    description: "Manually trigger a domain event for notification processing",
    tags: ["Events"],
    responses: {
      201: { description: "Event created and queued" },
      400: { description: "Validation error" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
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
  settingsUpdate,
  validator("query", eventListQuerySchema, validationHook),
  describeRoute({
    description: "List failed notification deliveries with event context",
    tags: ["Events"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const result = await listFailedNotifications({
      page: query.page,
      limit: query.limit,
    });
    return c.json(result);
  },
);

export { eventRoutes };
