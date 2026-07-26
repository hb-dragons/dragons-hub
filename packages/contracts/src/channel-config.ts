import { z } from "zod";
import { idParamSchema } from "./common";
import { CHANNEL_TYPES } from "@dragons/shared";
import type { ChannelConfig, ChannelType } from "@dragons/shared";

export const channelConfigIdParamSchema = idParamSchema;

export const channelConfigListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type ChannelConfigIdParam = z.infer<typeof channelConfigIdParamSchema>;
export type ChannelConfigListQuery = z.infer<
  typeof channelConfigListQuerySchema
>;

// ── Per-channel config schemas ──────────────────────────────────────────────

const localeSchema = z.enum(["de", "en"]);

const inAppConfigSchema = z.object({
  audienceRole: z.enum(["admin", "referee"]),
  locale: localeSchema,
});

const whatsappGroupConfigSchema = z.object({
  groupId: z.string().min(1),
  locale: localeSchema,
});

// Push delivery is fanned out per user device by the Expo adapter, so the
// config carries the provider rather than a fixed target. Locale is optional:
// the pipeline prefers the recipient's own preference.
const pushConfigSchema = z.object({
  provider: z.literal("expo"),
  locale: localeSchema.optional(),
});

/**
 * Exhaustive over ChannelType — a channel type added to CHANNEL_TYPES is a
 * compile error here until it is given a config shape.
 */
const configSchemaByType: Record<ChannelType, z.ZodType> = {
  in_app: inAppConfigSchema,
  whatsapp_group: whatsappGroupConfigSchema,
  push: pushConfigSchema,
};

// ── Create schema ───────────────────────────────────────────────────────────

const channelTypeSchema = z.enum(CHANNEL_TYPES);

/**
 * `config` is parsed *and replaced* by the per-type shape, so the value that
 * reaches the `jsonb` column (typed `$type<ChannelConfig>()`) carries only the
 * keys that type declares. A `superRefine` could reject a bad config but had no
 * way to hand back the stripped one, so the raw body was persisted instead and
 * arbitrary keys accumulated in the column.
 */
export const createChannelConfigSchema = z
  .strictObject({
    name: z.string().min(1),
    type: channelTypeSchema,
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()),
    digestMode: z.enum(["per_sync", "scheduled", "none"]).optional(),
    digestCron: z.string().nullable().optional(),
    digestTimezone: z.string().optional(),
  })
  .transform((data, ctx) => {
    const result = configSchemaByType[data.type].safeParse(data.config);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ["config", ...issue.path],
        });
      }
      return z.NEVER;
    }
    return { ...data, config: result.data as ChannelConfig };
  });

/**
 * Request (input) type — `config` is a transform whose input is a plain record,
 * so callers build bodies with `z.input`, not the parsed output.
 */
export type ChannelConfigCreateBody = z.input<typeof createChannelConfigSchema>;
/** What the route receives from `c.req.valid("json")`: `config` already narrowed. */
export type ChannelConfigCreateBodyParsed = z.infer<
  typeof createChannelConfigSchema
>;

// ── Update schema ───────────────────────────────────────────────────────────

/**
 * `config` cannot be narrowed here: which shape applies depends on the stored
 * `type`, which only the route knows. The route runs `validateConfigForType`
 * against the persisted type and must write *that* result, not the raw body.
 */
export const updateChannelConfigSchema = z.strictObject({
  name: z.string().min(1).optional(),
  // type is immutable after creation — changing it would invalidate
  // existing watch rules and notification_log entries referencing this config.
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  digestMode: z.enum(["per_sync", "scheduled", "none"]).optional(),
  digestCron: z.string().nullable().optional(),
  digestTimezone: z.string().optional(),
});

export type ChannelConfigUpdateBody = z.infer<
  typeof updateChannelConfigSchema
>;
/**
 * What the update route hands to the service: `config` already run through
 * `validateConfigForType` against the persisted channel type, so it is a
 * `ChannelConfig` and not an arbitrary record.
 */
export type ChannelConfigUpdateBodyParsed = Omit<
  ChannelConfigUpdateBody,
  "config"
> & { config?: ChannelConfig };

// ── Config validation helper (for update route) ─────────────────────────────

/**
 * Parses `config` against the shape for `type`, returning the *stripped* value
 * (unknown keys removed) or null if it does not match. Callers must persist the
 * returned object rather than what they passed in.
 */
export function validateConfigForType(
  type: string,
  config: Record<string, unknown>,
): ChannelConfig | null {
  const schema = configSchemaByType[type as keyof typeof configSchemaByType];
  if (!schema) return null;
  const result = schema.safeParse(config);
  return result.success ? (result.data as ChannelConfig) : null;
}

