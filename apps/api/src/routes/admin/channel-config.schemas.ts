import { z } from "zod";

export const channelConfigIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const channelConfigListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const createChannelConfigSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["in_app", "whatsapp_group", "push", "email"]),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  digestMode: z.enum(["per_sync", "scheduled", "none"]).optional(),
  digestCron: z.string().nullable().optional(),
  digestTimezone: z.string().optional(),
});

export const updateChannelConfigSchema = z.object({
  name: z.string().min(1).optional(),
  // type is immutable after creation — changing it would invalidate
  // existing watch rules and notification_log entries referencing this config.
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  digestMode: z.enum(["per_sync", "scheduled", "none"]).optional(),
  digestCron: z.string().nullable().optional(),
  digestTimezone: z.string().optional(),
});
