// ── Event metadata types ─────────────────────────────────────────────────────

/**
 * Where an event came from. Single source of truth — the admin listing's
 * `source` filter derives its enum from this array rather than restating the
 * literals, which is what let it accept any string and silently return nothing.
 * `publishSystemEvent` writes `"manual"`, so system events need no extra member.
 */
export const EVENT_SOURCES = ["sync", "manual", "reconciliation"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];
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

// ── System event constants ───────────────────────────────────────────────────

/**
 * Types that exist only to anchor rows the schema requires an event for, never
 * to notify anyone.
 *
 * Deliberately **not** part of `EVENT_TYPES`: `notification_log` has a foreign
 * key to `domain_events`, so the admin test-push route needs a row to point at,
 * but the type must stay out of the public vocabulary or an admin could aim a
 * watch rule at it or fire one from the manual trigger. Watch rules and
 * `triggerEventSchema` validate against `EVENT_TYPE_VALUES`, which is why that
 * array stays domain-only — see `STORED_EVENT_TYPE_VALUES` for the wider set
 * that describes what the table can actually hold.
 */
export const SYSTEM_EVENT_TYPES = ["admin.test_push"] as const;
export type SystemEventType = (typeof SYSTEM_EVENT_TYPES)[number];

/**
 * Entity types only system events use. A system event is about an account
 * action rather than one of the tracked entities in `EVENT_ENTITY_TYPES`.
 */
export const SYSTEM_EVENT_ENTITY_TYPES = ["user"] as const;
export type SystemEventEntityType = (typeof SYSTEM_EVENT_ENTITY_TYPES)[number];

/**
 * What a persisted `domain_events` row can actually hold, domain and system
 * events together — the type of the columns and of anything that reads them
 * back out, such as the admin event listing.
 *
 * Kept separate from `EventType` / `EventEntityType` on purpose. Those two are
 * the *publishable* vocabulary and are what write-side contracts validate
 * against; these two are the *readable* one. Collapsing them would let an admin
 * trigger `admin.test_push` by hand, which is the thing the split prevents.
 */
export type StoredEventType = EventType | SystemEventType;
export type StoredEventEntityType = EventEntityType | SystemEventEntityType;

/** Runtime counterparts, for filters that must accept any stored value. */
export const STORED_EVENT_TYPE_VALUES = [
  ...EVENT_TYPE_VALUES,
  ...SYSTEM_EVENT_TYPES,
] as readonly StoredEventType[];
export const STORED_EVENT_ENTITY_TYPES = [
  ...EVENT_ENTITY_TYPES,
  ...SYSTEM_EVENT_ENTITY_TYPES,
] as readonly StoredEventEntityType[];

// ── Payload types ────────────────────────────────────────────────────────────
//
// The contract for every event payload lives in `domain-event-schemas.ts` (zod),
// which `validateEventPayload` enforces at publish time. Payloads a caller needs
// to name in a type position — `RefereeSlotsPayload`, or `EventPayload<E>` for
// any event — are derived from those schemas there, never restated by hand: a
// second declaration is free to drift from what producers actually publish.

// ── API response types ───────────────────────────────────────────────────────

/**
 * One row of the admin event listing.
 *
 * `type` and `entityType` are the **stored** unions, not the publishable ones:
 * `listDomainEvents` returns system-event rows too, and declaring the narrower
 * union here told consumers a `switch` was exhaustive when live rows fell
 * outside it (#154).
 */
export interface DomainEventItem {
  id: string;
  type: StoredEventType;
  source: EventSource;
  urgency: EventUrgency;
  occurredAt: string;
  actor: string | null;
  syncRunId: number | null;
  entityType: StoredEventEntityType;
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
