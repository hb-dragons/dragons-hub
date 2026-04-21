import { z } from "zod";
import { ENTITY_TYPES, ENTRY_ACTIONS } from "@dragons/shared";

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const syncRunStatusEnum = z.enum(["running", "completed", "failed"]);

export const syncLogsQuerySchema = paginationSchema.extend({
  status: syncRunStatusEnum.optional(),
  syncType: z.string().optional(),
});

export const syncEntryIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const entityTypeEnum = z.enum(ENTITY_TYPES);
const entryActionEnum = z.enum(ENTRY_ACTIONS);

export const syncEntriesQuerySchema = paginationSchema.extend({
  entityType: entityTypeEnum.optional(),
  action: entryActionEnum.optional(),
  search: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
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
  syncType: z.string().optional(),
  enabled: z.boolean().optional(),
  cronExpression: z
    .string()
    .regex(/^[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+$/, "Invalid cron expression")
    .optional()
    .nullable(),
  intervalMinutes: z.number().int().min(5).max(1440).optional(),
  timezone: z.string().min(1).optional(),
  updatedBy: z.string().optional(),
});

export const matchChangesParamSchema = z.object({
  apiMatchId: z.coerce.number().int().positive(),
});

export type SyncLogsQuery = z.infer<typeof syncLogsQuerySchema>;
export type SyncEntriesQuery = z.infer<typeof syncEntriesQuerySchema>;
export type UpdateScheduleBody = z.infer<typeof updateScheduleBodySchema>;
