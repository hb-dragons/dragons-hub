// ── Types ───────────────────────────────────────────────────────────────────

export type Channel = "in_app" | "push";

export interface DefaultNotification {
  audience: "admin" | "referee" | "user";
  channel: Channel;
  refereeId?: number; // present for referee audience
  userId?: string; // present for user audience
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

// ── Push-eligible event types ───────────────────────────────────────────────

/**
 * Events where users should receive a native push notification in addition
 * to the in-app entry. Limited to personal + high-urgency events to avoid
 * notification noise.
 */
const PUSH_ELIGIBLE_EVENTS = new Set([
  "referee.assigned",
  "referee.unassigned",
  "referee.reassigned",
  "referee.slots.needed",
  "referee.slots.reminder",
  "match.cancelled",
  "match.rescheduled",
  "task.assigned",
  "task.unassigned",
  "task.comment.added",
  "task.due.reminder",
]);

// ── Task event recipient field map ───────────────────────────────────────────

const TASK_RECIPIENT_FIELDS: Record<string, string> = {
  "task.assigned": "assigneeUserIds",
  "task.unassigned": "unassignedUserIds",
  "task.comment.added": "recipientUserIds",
  "task.due.reminder": "assigneeUserIds",
};

// ── getDefaultNotificationsForEvent ─────────────────────────────────────────

/**
 * Determine the default set of notifications to emit for a domain event,
 * based on role-based rules rather than user-created watch rules.
 *
 * Admins receive all match.*, booking.*, override.*, referee.* events on
 * in-app. Referees receive referee.assigned / unassigned / reassigned on
 * in-app for their own refereeId. For reassigned events, both old and new
 * referee are notified.
 *
 * For events in PUSH_ELIGIBLE_EVENTS, a parallel push-channel entry is added
 * for every in-app entry emitted.
 */
export function getDefaultNotificationsForEvent(
  eventType: string,
  payload: Record<string, unknown>,
  _source: string,
): DefaultNotification[] {
  const results: DefaultNotification[] = [];
  const pushEligible = PUSH_ELIGIBLE_EVENTS.has(eventType);

  const emit = (n: DefaultNotification) => {
    results.push(n);
    if (pushEligible) {
      results.push({ ...n, channel: "push" });
    }
  };

  if (isAdminEvent(eventType)) {
    emit({ audience: "admin", channel: "in_app" });
  }

  if (REFEREE_SELF_EVENTS.has(eventType)) {
    const refereeId = toNumber(payload["refereeId"]);
    if (refereeId != null) {
      emit({ audience: "referee", channel: "in_app", refereeId });
    }
  }

  if (eventType === "referee.reassigned") {
    const oldRefereeId = toNumber(payload["oldRefereeId"]);
    const newRefereeId = toNumber(payload["newRefereeId"]);

    if (oldRefereeId != null) {
      emit({ audience: "referee", channel: "in_app", refereeId: oldRefereeId });
    }
    if (newRefereeId != null) {
      emit({ audience: "referee", channel: "in_app", refereeId: newRefereeId });
    }
  }

  const taskField = TASK_RECIPIENT_FIELDS[eventType];
  if (taskField) {
    const raw = payload[taskField];
    const userIds = Array.isArray(raw) ? raw.filter((x) => typeof x === "string") as string[] : [];
    for (const userId of userIds) {
      emit({ audience: "user", channel: "in_app", userId });
    }
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
