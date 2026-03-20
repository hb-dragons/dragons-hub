import { z } from "zod";

export const channelConfigIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const channelConfigListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

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

const emailConfigSchema = z.object({
  locale: localeSchema,
});

const configSchemaByType = {
  in_app: inAppConfigSchema,
  whatsapp_group: whatsappGroupConfigSchema,
  email: emailConfigSchema,
} as const;

// ── Create schema ───────────────────────────────────────────────────────────

const channelTypeSchema = z.enum(["in_app", "whatsapp_group", "email"]);

export const createChannelConfigSchema = z
  .object({
    name: z.string().min(1),
    type: channelTypeSchema,
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()),
    digestMode: z.enum(["per_sync", "scheduled", "none"]).optional(),
    digestCron: z.string().nullable().optional(),
    digestTimezone: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const schema = configSchemaByType[data.type];
    const result = schema.safeParse(data.config);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ["config", ...issue.path],
        });
      }
    }
  });

// ── Update schema ───────────────────────────────────────────────────────────

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

// ── Config validation helper (for update route) ─────────────────────────────

export function validateConfigForType(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> | null {
  const schema = configSchemaByType[type as keyof typeof configSchemaByType];
  if (!schema) return null;
  const result = schema.safeParse(config);
  return result.success ? (result.data as Record<string, unknown>) : null;
}
