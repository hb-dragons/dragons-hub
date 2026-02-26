import { z } from "zod";

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const syncRunStatusEnum = z.enum(["running", "completed", "failed"]);

export const syncLogsQuerySchema = paginationSchema.extend({
  status: syncRunStatusEnum.optional(),
});

export const syncEntryIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const entityTypeEnum = z.enum([
  "league",
  "match",
  "standing",
  "team",
  "venue",
  "referee",
  "refereeRole",
]);

const entryActionEnum = z.enum(["created", "updated", "skipped", "failed"]);

export const syncEntriesQuerySchema = paginationSchema.extend({
  entityType: entityTypeEnum.optional(),
  action: entryActionEnum.optional(),
});

export const syncStreamParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const validJobStatuses = ["active", "waiting", "delayed", "completed", "failed"] as const;

export const jobStatusesQuerySchema = z.object({
  statuses: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      return val
        .split(",")
        .filter((s): s is (typeof validJobStatuses)[number] =>
          validJobStatuses.includes(s as (typeof validJobStatuses)[number]),
        );
    }),
});

export const updateScheduleBodySchema = z.object({
  enabled: z.boolean().optional(),
  cronExpression: z
    .string()
    .regex(/^[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+$/, "Invalid cron expression")
    .optional(),
  timezone: z.string().min(1).optional(),
  updatedBy: z.string().optional(),
});

export const matchChangesParamSchema = z.object({
  apiMatchId: z.coerce.number().int().positive(),
});

export type SyncLogsQuery = z.infer<typeof syncLogsQuerySchema>;
export type SyncEntriesQuery = z.infer<typeof syncEntriesQuerySchema>;
export type UpdateScheduleBody = z.infer<typeof updateScheduleBodySchema>;
