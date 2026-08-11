import { z } from "zod";
import { idParamSchema } from "./common";
import { ENTITY_TYPES, ENTRY_ACTIONS, SYNC_STATUSES } from "@dragons/shared";

export const syncPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const syncRunStatusEnum = z.enum(SYNC_STATUSES);

export const syncLogsQuerySchema = syncPaginationSchema.extend({
  status: syncRunStatusEnum.optional(),
  syncType: z.string().optional(),
});

export type SyncLogsQuery = z.infer<typeof syncLogsQuerySchema>;

/**
 * The `syncType` filter on `GET /admin/sync/status` and `GET /admin/sync/schedule`.
 *
 * Free string, not an enum, and deliberately so: `PUT /admin/sync/schedule`
 * takes an arbitrary `syncType` in its body and `upsertSchedule` writes it to
 * `sync_schedule.sync_type` (a varchar), so the set of readable types is open at
 * runtime even though the pipeline itself only ever writes `full` and
 * `referee-games`. Enumerating it here would reject types the sibling write
 * endpoint happily creates. `syncLogsQuerySchema.syncType` is free for the same
 * reason.
 */
export const syncTypeQuerySchema = z.object({
  syncType: z.string().optional(),
});

export const syncEntryIdParamSchema = idParamSchema;

const entityTypeEnum = z.enum(ENTITY_TYPES);
const entryActionEnum = z.enum(ENTRY_ACTIONS);

export const syncEntriesQuerySchema = syncPaginationSchema.extend({
  entityType: entityTypeEnum.optional(),
  action: entryActionEnum.optional(),
  search: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});

export type SyncEntriesQuery = z.infer<typeof syncEntriesQuerySchema>;

export const syncStreamParamSchema = idParamSchema;

/**
 * The queue job statuses the `statuses` query filter accepts. Exported because
 * `GET /admin/sync/jobs` echoes the same list back to the client as
 * `validStatuses`; the route used to repeat the literal, so widening the filter
 * here silently left the advertised list behind.
 */
export const SYNC_JOB_STATUSES = ["active", "waiting", "delayed", "completed", "failed"] as const;

const validJobStatuses = SYNC_JOB_STATUSES;

export const syncJobStatusesQuerySchema = z.object({
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
  limit: z.coerce.number().int().positive().max(500).default(100),
});

/**
 * The `:jobId` path parameter of the queue-job routes. BullMQ job ids are opaque
 * strings (`manual-sync`, `referee-games-sync-42`, or a generated counter), so
 * there is nothing to coerce — only a non-empty string to insist on.
 */
export const syncJobIdParamSchema = z.object({
  jobId: z.string().min(1),
});

export const syncUpdateScheduleBodySchema = z.strictObject({
  syncType: z.string().optional(),
  enabled: z.boolean().optional(),
  cronExpression: z
    .string()
    .regex(/^[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+\s[\d*,\-/]+$/, "Invalid cron expression")
    .optional()
    .nullable(),
  intervalMinutes: z.number().int().min(5).max(1440).optional(),
  timezone: z.string().min(1).optional(),
  // No updatedBy: the audit actor is set server-side from the session, never
  // accepted from the client (it would be spoofable otherwise).
});

export type SyncUpdateScheduleBody = z.infer<typeof syncUpdateScheduleBodySchema>;

export const syncMatchChangesParamSchema = z.object({
  apiMatchId: z.coerce.number().int().positive(),
});
