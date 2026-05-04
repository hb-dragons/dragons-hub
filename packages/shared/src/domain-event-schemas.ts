import { z } from "zod";
import { EVENT_TYPES } from "./domain-events";
import type { EventType } from "./domain-events";

const fieldChangeSchema = z.object({
  field: z.string(),
  oldValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  newValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

// Match payload schemas

const matchCreatedSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  leagueId: z.number(),
  leagueName: z.string(),
  kickoffDate: z.string(),
  kickoffTime: z.string(),
  venueId: z.number().nullable(),
  venueName: z.string().nullable(),
  teamIds: z.array(z.number()),
});

const matchScheduleChangedSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  leagueName: z.string(),
  leagueId: z.number().nullish(),
  teamIds: z.array(z.number()),
  changes: z.array(fieldChangeSchema),
  kickoffDate: z.string().optional(),
});

const matchVenueChangedSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  leagueName: z.string(),
  leagueId: z.number().nullish(),
  teamIds: z.array(z.number()),
  oldVenueId: z.number().nullable(),
  oldVenueName: z.string().nullable(),
  newVenueId: z.number().nullable(),
  newVenueName: z.string().nullable(),
});

const matchOutcomeSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  leagueName: z.string(),
  leagueId: z.number().nullish(),
  teamIds: z.array(z.number()),
  reason: z.string().nullish(),
}).passthrough();

const matchScoreChangedSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  leagueName: z.string(),
  leagueId: z.number().nullish(),
  teamIds: z.array(z.number()),
  homeScore: z.number(),
  guestScore: z.number(),
  oldHomeScore: z.number().nullish(),
  oldGuestScore: z.number().nullish(),
});

const matchConfirmedSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  leagueName: z.string(),
  leagueId: z.number().nullish(),
  teamIds: z.array(z.number()),
  homeScore: z.number().nullable(),
  guestScore: z.number().nullable(),
});

const matchResultEnteredSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  leagueName: z.string(),
  leagueId: z.number().nullish(),
  teamIds: z.array(z.number()),
  homeScore: z.number(),
  guestScore: z.number(),
});

const matchResultChangedSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  leagueName: z.string(),
  leagueId: z.number().nullish(),
  teamIds: z.array(z.number()),
  oldHomeScore: z.number(),
  oldGuestScore: z.number(),
  newHomeScore: z.number(),
  newGuestScore: z.number(),
});

// Referee payload schemas

const refereeAssignmentSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  refereeName: z.string(),
  role: z.string(),
  teamIds: z.array(z.number()),
});

const refereeReassignedSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  oldRefereeName: z.string(),
  newRefereeName: z.string(),
  role: z.string(),
  teamIds: z.array(z.number()),
});

const refereeSlotsSchema = z.object({
  matchId: z.number().nullable(),
  matchNo: z.number().nullable(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  leagueId: z.number().nullable(),
  leagueName: z.string(),
  kickoffDate: z.string(),
  kickoffTime: z.string(),
  venueId: z.number().nullable(),
  venueName: z.string().nullable(),
  sr1Open: z.boolean(),
  sr2Open: z.boolean(),
  sr1Assigned: z.string().nullable(),
  sr2Assigned: z.string().nullable(),
  reminderLevel: z.number().optional(),
  deepLink: z.string(),
});

// Booking payload schemas

const bookingCreatedSchema = z.object({
  venueName: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  matchCount: z.number(),
});

const bookingStatusChangedSchema = z.object({
  venueName: z.string(),
  date: z.string(),
  oldStartTime: z.string().optional(),
  oldEndTime: z.string().optional(),
  newStartTime: z.string().optional(),
  newEndTime: z.string().optional(),
  oldStatus: z.string().optional(),
  newStatus: z.string().optional(),
  reason: z.string().optional(),
});

const bookingNeedsReconfirmationSchema = z.object({
  venueName: z.string(),
  date: z.string(),
  reason: z.string(),
});

// Override payload schemas

const overrideValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const overrideConflictSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  field: z.string().optional(),
  fieldName: z.string().optional(),
  overrideValue: overrideValueSchema.optional(),
  remoteValue: overrideValueSchema.optional(),
  localValue: overrideValueSchema.optional(),
  newRemoteValue: overrideValueSchema.optional(),
}).passthrough();

const overrideAppliedSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  field: z.string(),
  originalValue: overrideValueSchema,
  overrideValue: overrideValueSchema,
  appliedBy: z.string(),
}).passthrough();

const overrideRevertedSchema = z.object({
  matchNo: z.number(),
  homeTeam: z.string(),
  guestTeam: z.string(),
  field: z.string(),
  overrideValue: overrideValueSchema,
  revertedBy: z.string(),
}).passthrough();

// Sync payload schemas

const syncCompletedSchema = z.object({
  syncRunId: z.number(),
  syncType: z.string(),
  durationMs: z.number(),
  recordsProcessed: z.number(),
  recordsCreated: z.number(),
  recordsUpdated: z.number(),
  recordsFailed: z.number(),
  eventsEmitted: z.number(),
});

// Task payload schemas

const taskAssignedSchema = z.object({
  taskId: z.number(),
  boardId: z.number(),
  boardName: z.string(),
  title: z.string(),
  assigneeUserIds: z.array(z.string()),
  assignedBy: z.string(),
  dueDate: z.string().nullable(),
  priority: z.enum(["low", "normal", "high"]),
});

const taskUnassignedSchema = z.object({
  taskId: z.number(),
  boardId: z.number(),
  boardName: z.string(),
  title: z.string(),
  unassignedUserIds: z.array(z.string()),
  unassignedBy: z.string(),
});

const taskCommentAddedSchema = z.object({
  taskId: z.number(),
  boardId: z.number(),
  boardName: z.string(),
  title: z.string(),
  commentId: z.number(),
  authorId: z.string(),
  authorName: z.string(),
  bodyPreview: z.string(),
  recipientUserIds: z.array(z.string()),
});

const taskDueReminderSchema = z.object({
  taskId: z.number(),
  boardId: z.number(),
  boardName: z.string(),
  title: z.string(),
  dueDate: z.string(),
  reminderKind: z.enum(["lead", "day_of"]),
  assigneeUserIds: z.array(z.string()),
});

export const eventPayloadSchemas: Record<EventType, z.ZodType> = {
  [EVENT_TYPES.MATCH_CREATED]: matchCreatedSchema,
  [EVENT_TYPES.MATCH_SCHEDULE_CHANGED]: matchScheduleChangedSchema,
  [EVENT_TYPES.MATCH_VENUE_CHANGED]: matchVenueChangedSchema,
  [EVENT_TYPES.MATCH_CANCELLED]: matchOutcomeSchema,
  [EVENT_TYPES.MATCH_FORFEITED]: matchOutcomeSchema,
  [EVENT_TYPES.MATCH_SCORE_CHANGED]: matchScoreChangedSchema,
  [EVENT_TYPES.MATCH_REMOVED]: matchOutcomeSchema,
  [EVENT_TYPES.MATCH_CONFIRMED]: matchConfirmedSchema,
  [EVENT_TYPES.MATCH_RESULT_ENTERED]: matchResultEnteredSchema,
  [EVENT_TYPES.MATCH_RESULT_CHANGED]: matchResultChangedSchema,
  [EVENT_TYPES.REFEREE_ASSIGNED]: refereeAssignmentSchema,
  [EVENT_TYPES.REFEREE_UNASSIGNED]: refereeAssignmentSchema,
  [EVENT_TYPES.REFEREE_REASSIGNED]: refereeReassignedSchema,
  [EVENT_TYPES.REFEREE_SLOTS_NEEDED]: refereeSlotsSchema,
  [EVENT_TYPES.REFEREE_SLOTS_REMINDER]: refereeSlotsSchema,
  [EVENT_TYPES.BOOKING_CREATED]: bookingCreatedSchema,
  [EVENT_TYPES.BOOKING_STATUS_CHANGED]: bookingStatusChangedSchema,
  [EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION]: bookingNeedsReconfirmationSchema,
  [EVENT_TYPES.OVERRIDE_CONFLICT]: overrideConflictSchema,
  [EVENT_TYPES.OVERRIDE_APPLIED]: overrideAppliedSchema,
  [EVENT_TYPES.OVERRIDE_REVERTED]: overrideRevertedSchema,
  [EVENT_TYPES.SYNC_COMPLETED]: syncCompletedSchema,
  [EVENT_TYPES.TASK_ASSIGNED]: taskAssignedSchema,
  [EVENT_TYPES.TASK_UNASSIGNED]: taskUnassignedSchema,
  [EVENT_TYPES.TASK_COMMENT_ADDED]: taskCommentAddedSchema,
  [EVENT_TYPES.TASK_DUE_REMINDER]: taskDueReminderSchema,
};

export interface PayloadValidation {
  valid: boolean;
  issues?: string[];
}

export function validateEventPayload(
  type: EventType,
  payload: unknown,
): PayloadValidation {
  const schema = eventPayloadSchemas[type];
  if (!schema) return { valid: true };
  const result = schema.safeParse(payload);
  if (result.success) return { valid: true };
  return {
    valid: false,
    issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}
