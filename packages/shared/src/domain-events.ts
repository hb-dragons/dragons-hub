// ── Event metadata types ─────────────────────────────────────────────────────

export type EventSource = "sync" | "manual" | "reconciliation";
/**
 * Delivery urgency. Single source of truth — both the manual-trigger contract
 * and the watch-rule `urgencyOverride` derive their enum from this array rather
 * than restating the literals (watch-rule used to take a bare string, so a
 * typo'd urgency saved cleanly and did nothing).
 */
export const EVENT_URGENCIES = ["immediate", "routine"] as const;
export type EventUrgency = (typeof EVENT_URGENCIES)[number];
/**
 * Every entity a domain event can be raised against. Single source of truth —
 * the manual-trigger request contract derives its `entityType` enum from this
 * array rather than restating the literals.
 */
export const EVENT_ENTITY_TYPES = [
  "match",
  "booking",
  "referee",
  "task",
] as const;
export type EventEntityType = (typeof EVENT_ENTITY_TYPES)[number];

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

/**
 * Every event type as a flat array. Watch rules validate their `eventTypes`
 * against this, so a typo'd type is rejected at the boundary instead of being
 * saved into a rule that then never fires.
 */
export const EVENT_TYPE_VALUES = Object.values(EVENT_TYPES) as readonly EventType[];

// ── Payload interfaces ───────────────────────────────────────────────────────
//
// The runtime contract for every event payload lives in `domain-event-schemas.ts`
// (zod), which `validateEventPayload` enforces before an event is published.
// Only payloads a caller needs to name in a type position are declared here.

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

/** Response of POST /admin/events/trigger — the event that was created and queued. */
export interface TriggerEventResult {
  eventId: string;
  type: EventType;
  urgency: EventUrgency;
  entityType: EventEntityType;
  entityId: number;
}
