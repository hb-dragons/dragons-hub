import { EVENT_TYPES, type EventUrgency } from "@dragons/shared";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Check whether a date string falls within 7 days of now (past or future).
 */
export function isWithin7Days(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return Math.abs(date.getTime() - now.getTime()) <= SEVEN_DAYS_MS;
}

// Events that are always immediate regardless of dates
const ALWAYS_IMMEDIATE = new Set<string>([
  EVENT_TYPES.MATCH_CANCELLED,
  EVENT_TYPES.MATCH_FORFEITED,
  EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION,
  EVENT_TYPES.OVERRIDE_CONFLICT,
]);

// Events whose urgency depends on whether affected dates are within 7 days
const DATE_DEPENDENT = new Set<string>([
  EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
  EVENT_TYPES.MATCH_VENUE_CHANGED,
  EVENT_TYPES.OVERRIDE_REVERTED,
]);

/**
 * Extract date strings from an event payload that are relevant for urgency.
 * Looks for common date-related fields in changes arrays and top-level fields.
 */
function extractRelevantDates(payload: Record<string, unknown>): string[] {
  const dates: string[] = [];

  // Check top-level date fields
  if (typeof payload.kickoffDate === "string") dates.push(payload.kickoffDate);
  if (typeof payload.date === "string") dates.push(payload.date);

  // Check changes array for date/time fields
  const changes = payload.changes;
  if (Array.isArray(changes)) {
    for (const change of changes) {
      if (typeof change !== "object" || change === null) continue;
      const c = change as Record<string, unknown>;
      // Include both old and new values for date/time fields
      if (
        typeof c.field === "string" &&
        /date|time|kickoff/i.test(c.field)
      ) {
        if (typeof c.oldValue === "string") dates.push(c.oldValue);
        if (typeof c.newValue === "string") dates.push(c.newValue);
      }
    }
  }

  return dates;
}

/**
 * Classify a domain event as "immediate" or "routine" based on its type
 * and, for date-dependent events, whether the affected dates are within 7 days.
 */
export function classifyUrgency(
  eventType: string,
  payload: Record<string, unknown>,
): EventUrgency {
  if (ALWAYS_IMMEDIATE.has(eventType)) {
    return "immediate";
  }

  if (DATE_DEPENDENT.has(eventType)) {
    const dates = extractRelevantDates(payload);
    if (dates.some((d) => isWithin7Days(d))) {
      return "immediate";
    }
    return "routine";
  }

  // Everything else is routine
  return "routine";
}
