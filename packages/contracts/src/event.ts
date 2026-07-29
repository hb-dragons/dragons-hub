import { z } from "zod";
import {
  EVENT_ENTITY_TYPES,
  EVENT_SOURCES,
  EVENT_URGENCIES,
  EVENT_TYPE_VALUES,
  STORED_EVENT_ENTITY_TYPES,
  STORED_EVENT_TYPE_VALUES,
  dateSchema,
} from "@dragons/shared";

/**
 * Filters on the admin event listing.
 *
 * `type`, `entityType` and `source` were bare `z.string()`, so a typo returned
 * an empty page indistinguishable from a genuine no-results (#155). They
 * enumerate the **stored** vocabulary, not the publishable one: system-event
 * rows are in this table and an admin has to be able to filter to them, so
 * `admin.test_push` and `user` are valid filter values even though
 * `triggerEventSchema` below still refuses to let anyone create one.
 */
export const eventListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  type: z.enum(STORED_EVENT_TYPE_VALUES).optional(),
  entityType: z.enum(STORED_EVENT_ENTITY_TYPES).optional(),
  source: z.enum(EVENT_SOURCES).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  search: z.string().max(200).optional(),
  status: z.enum(["pending", "sent", "failed", "read"]).optional(),
});

export const triggerEventSchema = z.strictObject({
  type: z.enum(EVENT_TYPE_VALUES),
  entityType: z.enum(EVENT_ENTITY_TYPES),
  entityId: z.number().int().positive(),
  entityName: z.string().min(1).max(300),
  deepLinkPath: z.string().min(1).max(500),
  payload: z.record(z.string(), z.unknown()).default({}),
  urgencyOverride: z.enum(EVENT_URGENCIES).optional(),
});

export type EventListQuery = z.infer<typeof eventListQuerySchema>;
export type TriggerEventBody = z.infer<typeof triggerEventSchema>;
