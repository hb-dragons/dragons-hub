import { z } from "zod";

export const watchRuleIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const watchRuleListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const filterConditionSchema = z.object({
  field: z.enum(["teamId", "leagueId", "venueId", "source"]),
  operator: z.enum(["eq", "neq", "in", "any"]),
  value: z.union([z.string(), z.array(z.string()), z.null()]),
});

const channelTargetSchema = z.object({
  channel: z.enum(["in_app", "whatsapp_group", "push", "email"]),
  targetId: z.string().min(1),
});

export const createWatchRuleSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  eventTypes: z.array(z.string().min(1)).min(1),
  filters: z.array(filterConditionSchema).optional(),
  channels: z.array(channelTargetSchema).min(1),
  urgencyOverride: z.string().nullable().optional(),
  templateOverride: z.string().nullable().optional(),
});

export const updateWatchRuleSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  eventTypes: z.array(z.string().min(1)).min(1).optional(),
  filters: z.array(filterConditionSchema).optional(),
  channels: z.array(channelTargetSchema).min(1).optional(),
  urgencyOverride: z.string().nullable().optional(),
  templateOverride: z.string().nullable().optional(),
});
