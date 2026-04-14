// ── Types ───────────────────────────────────────────────────────────────────

export interface DefaultNotification {
  audience: "admin" | "referee";
  channel: "in_app";
  refereeId?: number; // present for referee audience
}

// ── Event type prefixes that admins receive ─────────────────────────────────

const ADMIN_EVENT_PREFIXES = [
  "match.",
  "booking.",
  "override.",
  "referee.",
] as const;

// ── Referee assignment event types ──────────────────────────────────────────

const REFEREE_SELF_EVENTS = new Set([
  "referee.assigned",
  "referee.unassigned",
]);

// ── getDefaultNotificationsForEvent ─────────────────────────────────────────

/**
 * Determine the default set of notifications to emit for a domain event,
 * based on role-based rules rather than user-created watch rules.
 *
 * Phase 1:
 * - Admins receive all match.*, booking.*, override.*, referee.* events.
 * - Referees receive referee.assigned / unassigned / reassigned for their own
 *   refereeId. For reassigned events, both old and new referee are notified.
 */
export function getDefaultNotificationsForEvent(
  eventType: string,
  payload: Record<string, unknown>,
  _source: string,
): DefaultNotification[] {
  const results: DefaultNotification[] = [];

  // Admin defaults
  if (isAdminEvent(eventType)) {
    results.push({ audience: "admin", channel: "in_app" });
  }

  // Referee defaults
  if (REFEREE_SELF_EVENTS.has(eventType)) {
    const refereeId = toNumber(payload["refereeId"]);
    if (refereeId != null) {
      results.push({ audience: "referee", channel: "in_app", refereeId });
    }
  }

  if (eventType === "referee.reassigned") {
    const oldRefereeId = toNumber(payload["oldRefereeId"]);
    const newRefereeId = toNumber(payload["newRefereeId"]);

    if (oldRefereeId != null) {
      results.push({
        audience: "referee",
        channel: "in_app",
        refereeId: oldRefereeId,
      });
    }
    if (newRefereeId != null) {
      results.push({
        audience: "referee",
        channel: "in_app",
        refereeId: newRefereeId,
      });
    }
  }

  // Referee slot events → admin in-app notification
  if (eventType === "referee.slots.needed" || eventType === "referee.slots.reminder") {
    results.push({ audience: "admin", channel: "in_app" });
  }

  return results;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isAdminEvent(eventType: string): boolean {
  return ADMIN_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
