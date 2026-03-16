// ── Event metadata types ─────────────────────────────────────────────────────

export type EventSource = "sync" | "manual" | "reconciliation";
export type EventUrgency = "immediate" | "routine";
export type EventEntityType = "match" | "booking" | "referee";

// ── Event type constants ─────────────────────────────────────────────────────

export const EVENT_TYPES = {
  // Match events
  MATCH_SCHEDULED: "match.scheduled",
  MATCH_TIME_CHANGED: "match.time_changed",
  MATCH_VENUE_CHANGED: "match.venue_changed",
  MATCH_CANCELLED: "match.cancelled",
  MATCH_FORFEITED: "match.forfeited",
  MATCH_RESULT_ENTERED: "match.result_entered",
  MATCH_RESULT_CHANGED: "match.result_changed",

  // Referee events
  REFEREE_ASSIGNED: "referee.assigned",
  REFEREE_REMOVED: "referee.removed",
  REFEREE_CHANGED: "referee.changed",

  // Booking events
  BOOKING_CREATED: "booking.created",
  BOOKING_TIME_CHANGED: "booking.time_changed",
  BOOKING_CANCELLED: "booking.cancelled",
  BOOKING_NEEDS_RECONFIRMATION: "booking.needs_reconfirmation",

  // Override events
  OVERRIDE_APPLIED: "override.applied",
  OVERRIDE_REVERTED: "override.reverted",

  // Sync events
  SYNC_COMPLETED: "sync.completed",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// ── Payload interfaces ───────────────────────────────────────────────────────

export interface FieldChange {
  field: string;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
}

export interface MatchScheduledPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueId: number;
  leagueName: string;
  kickoffDate: string;
  kickoffTime: string;
  venueId: number | null;
  venueName: string | null;
}

export interface MatchTimeChangedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  changes: FieldChange[];
}

export interface MatchVenueChangedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
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
  reason: string | null;
}

export interface MatchForfeitedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
}

export interface MatchResultEnteredPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
  homeScore: number;
  guestScore: number;
}

export interface MatchResultChangedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  leagueName: string;
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
}

export interface RefereeRemovedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  refereeName: string;
  role: string;
}

export interface RefereeChangedPayload {
  matchNo: number;
  homeTeam: string;
  guestTeam: string;
  oldRefereeName: string;
  newRefereeName: string;
  role: string;
}

export interface BookingCreatedPayload {
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  matchCount: number;
}

export interface BookingTimeChangedPayload {
  venueName: string;
  date: string;
  oldStartTime: string;
  oldEndTime: string;
  newStartTime: string;
  newEndTime: string;
}

export interface BookingCancelledPayload {
  venueName: string;
  date: string;
  reason: string;
}

export interface BookingNeedsReconfirmationPayload {
  venueName: string;
  date: string;
  reason: string;
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

// ── Union payload type ───────────────────────────────────────────────────────

export type DomainEventPayload =
  | MatchScheduledPayload
  | MatchTimeChangedPayload
  | MatchVenueChangedPayload
  | MatchCancelledPayload
  | MatchForfeitedPayload
  | MatchResultEnteredPayload
  | MatchResultChangedPayload
  | RefereeAssignedPayload
  | RefereeRemovedPayload
  | RefereeChangedPayload
  | BookingCreatedPayload
  | BookingTimeChangedPayload
  | BookingCancelledPayload
  | BookingNeedsReconfirmationPayload
  | OverrideAppliedPayload
  | OverrideRevertedPayload
  | SyncCompletedPayload;

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
