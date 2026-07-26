import { z } from "zod";
import { idParamSchema } from "./common";
import { CHANNEL_TYPES, EVENT_TYPE_VALUES, EVENT_URGENCIES } from "@dragons/shared";
import type { EventType } from "@dragons/shared";

export const watchRuleIdParamSchema = idParamSchema;

export const watchRuleListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const filterConditionSchema = z.strictObject({
  field: z.enum(["teamId", "leagueId", "venueId", "source"]),
  operator: z.enum(["eq", "neq", "in", "any"]),
  value: z.union([z.string(), z.array(z.string()), z.null()]),
});

// Derived from CHANNEL_TYPES rather than restated: a watch rule targeting a
// channel the pipeline has no adapter for delivers nothing and reports nothing.
const channelTargetSchema = z.strictObject({
  channel: z.enum(CHANNEL_TYPES),
  targetId: z.string().min(1),
});

/**
 * `eventTypes` used to be `z.array(z.string())`, so a typo'd event type saved
 * cleanly into a rule that could then never match anything. It is checked
 * against the shared EVENT_TYPES registry instead.
 */
const eventTypeSchema = z.enum(
  EVENT_TYPE_VALUES as unknown as [EventType, ...EventType[]],
);

/** Was a bare string, while the sibling `event.ts` already used an enum. */
const urgencyOverrideSchema = z.enum(EVENT_URGENCIES).nullable().optional();

export const createWatchRuleSchema = z.strictObject({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  eventTypes: z.array(eventTypeSchema).min(1),
  filters: z.array(filterConditionSchema).optional(),
  channels: z.array(channelTargetSchema).min(1),
  urgencyOverride: urgencyOverrideSchema,
  templateOverride: z.string().nullable().optional(),
});

export const updateWatchRuleSchema = z.strictObject({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  eventTypes: z.array(eventTypeSchema).min(1).optional(),
  filters: z.array(filterConditionSchema).optional(),
  channels: z.array(channelTargetSchema).min(1).optional(),
  urgencyOverride: urgencyOverrideSchema,
  templateOverride: z.string().nullable().optional(),
});

export type WatchRuleIdParam = z.infer<typeof watchRuleIdParamSchema>;
export type WatchRuleListQuery = z.infer<typeof watchRuleListQuerySchema>;
export type WatchRuleCreateBody = z.infer<typeof createWatchRuleSchema>;
export type WatchRuleUpdateBody = z.infer<typeof updateWatchRuleSchema>;
