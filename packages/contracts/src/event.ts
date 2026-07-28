import { z } from "zod";
import {
  EVENT_ENTITY_TYPES,
  EVENT_URGENCIES,
  EVENT_TYPE_VALUES,
  dateSchema,
} from "@dragons/shared";

export const eventListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  type: z.string().optional(),
  entityType: z.string().optional(),
  source: z.string().optional(),
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
