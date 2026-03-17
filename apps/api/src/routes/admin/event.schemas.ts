import { z } from "zod";

export const eventListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  type: z.string().optional(),
  entityType: z.string().optional(),
  source: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().max(200).optional(),
  status: z.enum(["pending", "sent", "failed", "read"]).optional(),
});

export const triggerEventSchema = z.object({
  type: z.string().min(1).max(100),
  entityType: z.enum(["match", "booking", "referee"]),
  entityId: z.number().int().positive(),
  entityName: z.string().min(1).max(300),
  deepLinkPath: z.string().min(1).max(500),
  payload: z.record(z.string(), z.unknown()).default({}),
  urgencyOverride: z.enum(["immediate", "routine"]).optional(),
});
