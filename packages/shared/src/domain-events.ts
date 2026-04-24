// ── Event metadata types ─────────────────────────────────────────────────────

export type EventSource = "sync" | "manual" | "reconciliation";
export type EventUrgency = "immediate" | "routine";
export type EventEntityType = "match" | "booking" | "referee" | "task";

// ── Event type constants ─────────────────────────────────────────────────────

export const EVENT_TYPES = {
  // Match events
  MATCH_CREATED: "match.created",
  MATCH_SCHEDULE_CHANGED: "match.schedule.changed",
  MATCH_VENUE_CHANGED: "match.venue.changed",
  MATCH_CANCELLED: "match.cancelled",
  MATCH_FORFEITED: "match.forfeited",
  MATCH_SCORE_CHANGED: "match.score.changed",
  MATCH_REMOVED: "match.removed",
  MATCH_CONFIRMED: "match.confirmed",
  // Extra match events (not in spec but valid)
  MATCH_RESULT_ENTERED: "match.result_entered",
  MATCH_RESULT_CHANGED: "match.result_changed",

  // Referee events
  REFEREE_ASSIGNED: "referee.assigned",
  REFEREE_UNASSIGNED: "referee.unassigned",
  REFEREE_REASSIGNED: "referee.reassigned",

  // Referee slot events
  REFEREE_SLOTS_NEEDED: "referee.slots.needed",
  REFEREE_SLOTS_REMINDER: "referee.slots.reminder",

  // Booking events
  BOOKING_CREATED: "booking.created",
  BOOKING_STATUS_CHANGED: "booking.status.changed",
  BOOKING_NEEDS_RECONFIRMATION: "booking.needs_reconfirmation",

  // Override events
  OVERRIDE_CONFLICT: "override.conflict",
  OVERRIDE_APPLIED: "override.applied",
  // Extra override events (not in spec but valid)
  OVERRIDE_REVERTED: "override.reverted",

  // Sync events
  SYNC_COMPLETED: "sync.completed",

  // Task events
  TASK_ASSIGNED: "task.assigned",
  TASK_UNASSIGNED: "task.unassigned",
  TASK_COMMENT_ADDED: "task.comment.added",
  TASK_DUE_REMINDER: "task.due.reminder",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// ── Payload interfaces ───────────────────────────────────────────────────────

export interface FieldChange {
  field: string;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
}

export interface MatchCreatedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueId: number;
  leagueName: string;
  kickoffDate: string;
  kickoffTime: string;
  venueId: number | null;
  venueName: string | null;
  teamIds: number[];
}

export interface MatchScheduleChangedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  leagueId?: number | null;
  teamIds: number[];
  changes: FieldChange[];
}

export interface MatchVenueChangedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  leagueId?: number | null;
  teamIds: number[];
  oldVenueId: number | null;
  oldVenueName: string | null;
  newVenueId: number | null;
  newVenueName: string | null;
}

export interface MatchCancelledPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  leagueId?: number | null;
  teamIds: number[];
  reason: string | null;
}

export interface MatchForfeitedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  leagueId?: number | null;
  teamIds: number[];
}

export interface MatchScoreChangedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  leagueId?: number | null;
  teamIds: number[];
  homeScore: number;
  guestScore: number;
  oldHomeScore?: number | null;
  oldGuestScore?: number | null;
}

export interface MatchRemovedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  leagueId?: number | null;
  teamIds: number[];
}

export interface MatchConfirmedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  leagueId?: number | null;
  teamIds: number[];
  homeScore: number | null;
  guestScore: number | null;
}

export interface MatchResultEnteredPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  leagueId?: number | null;
  teamIds: number[];
  homeScore: number;
  guestScore: number;
}

export interface MatchResultChangedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  leagueId?: number | null;
  teamIds: number[];
  oldHomeScore: number;
  oldGuestScore: number;
  newHomeScore: number;
  newGuestScore: number;
}

export interface RefereeAssignedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  refereeName: string;
  role: string;
  teamIds: number[];
}

export interface RefereeUnassignedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  refereeName: string;
  role: string;
  teamIds: number[];
}

export interface RefereeReassignedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  oldRefereeName: string;
  newRefereeName: string;
  role: string;
  teamIds: number[];
}

export interface RefereeSlotsPayload {
  matchId: number | null;
  matchNo: number | null;
  homeTeam: string;
  guestTeam: string;
  leagueId: number | null;
  leagueName: string;
  kickoffDate: string;
  kickoffTime: string;
  venueId: number | null;
  venueName: string | null;
  sr1Open: boolean;
  sr2Open: boolean;
  sr1Assigned: string | null;
  sr2Assigned: string | null;
  reminderLevel?: number;
  deepLink: string;
}

export interface BookingCreatedPayload {
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  matchCount: number;
}

export interface BookingStatusChangedPayload {
  venueName: string;
  date: string;
  oldStartTime?: string;
  oldEndTime?: string;
  newStartTime?: string;
  newEndTime?: string;
  oldStatus?: string;
  newStatus?: string;
  reason?: string;
}

export interface BookingNeedsReconfirmationPayload {
  venueName: string;
  date: string;
  reason: string;
}

export interface OverrideConflictPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  field: string;
  overrideValue: string | number | boolean | null;
  remoteValue: string | number | boolean | null;
}

export interface OverrideAppliedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  field: string;
  originalValue: string | number | boolean | null;
  overrideValue: string | number | boolean | null;
  appliedBy: string;
}

export interface OverrideRevertedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  field: string;
  overrideValue: string | number | boolean | null;
  revertedBy: string;
}

export interface SyncCompletedPayload {
  syncRunId: number;
  syncType: string;
  durationMs: number;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  eventsEmitted: number;
}

export interface TaskAssignedPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  assigneeUserIds: string[];   // recipient userIds
  assignedBy: string;          // display name of the acting user (for templates)
  dueDate: string | null;
  priority: "low" | "normal" | "high";
}

export interface TaskUnassignedPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  unassignedUserIds: string[]; // recipient userIds
  unassignedBy: string;        // display name of the acting user (for templates)
}

export interface TaskCommentAddedPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  commentId: number;
  authorId: string;            // userId of comment author
  authorName: string;          // display name (for templates)
  bodyPreview: string;
  recipientUserIds: string[];
}

export interface TaskDueReminderPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  dueDate: string;
  reminderKind: "lead" | "day_of";
  assigneeUserIds: string[];
}

// ── Union payload type ───────────────────────────────────────────────────────

export type DomainEventPayload =
  | MatchCreatedPayload
  | MatchScheduleChangedPayload
  | MatchVenueChangedPayload
  | MatchCancelledPayload
  | MatchForfeitedPayload
  | MatchScoreChangedPayload
  | MatchRemovedPayload
  | MatchConfirmedPayload
  | MatchResultEnteredPayload
  | MatchResultChangedPayload
  | RefereeAssignedPayload
  | RefereeUnassignedPayload
  | RefereeReassignedPayload
  | RefereeSlotsPayload
  | BookingCreatedPayload
  | BookingStatusChangedPayload
  | BookingNeedsReconfirmationPayload
  | OverrideConflictPayload
  | OverrideAppliedPayload
  | OverrideRevertedPayload
  | SyncCompletedPayload
  | TaskAssignedPayload
  | TaskUnassignedPayload
  | TaskCommentAddedPayload
  | TaskDueReminderPayload;

// ── API response types ───────────────────────────────────────────────────────

export interface DomainEventItem {
  id: string;
  type: EventType;
  source: EventSource;
  urgency: EventUrgency;
  occurredAt: string;
  actor: string | null;
  syncRunId: number | null;
  entityType: EventEntityType;
  entityId: number;
  entityName: string;
  deepLinkPath: string;
  enqueuedAt: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DomainEventListResult {
  events: DomainEventItem[];
  total: number;
}
