import type { EventType } from "./domain-events";

/**
 * The event types a user may mute in their own notification preferences.
 *
 * A deliberate subset of `EVENT_TYPES`: muting is offered only for events
 * addressed to a *person* (their task assignments and comments). Club-wide
 * match, referee, booking and sync events are not the user's to silence, so
 * they are absent here and rejected by `notificationPreferencesBodySchema`.
 *
 * `satisfies readonly EventType[]` is the load-bearing part — it stops this
 * list drifting into a type the domain never publishes, which is how
 * `match.updated` (issue #156) survived in fixtures for as long as it did.
 */
export const USER_TOGGLEABLE_EVENT_TYPES = [
  "task.assigned",
  "task.unassigned",
  "task.comment.added",
  "task.due.reminder",
] as const satisfies readonly EventType[];

export type UserToggleableEventType = (typeof USER_TOGGLEABLE_EVENT_TYPES)[number];

/**
 * A `Record` rather than a parallel array so it is exhaustive by construction:
 * adding a type above without giving it a label fails to compile, instead of
 * silently dropping a checkbox from the preferences card.
 */
const LABEL_KEYS = {
  "task.assigned": "events.taskAssigned",
  "task.unassigned": "events.taskUnassigned",
  "task.comment.added": "events.taskComment",
  "task.due.reminder": "events.taskDueReminder",
} as const satisfies Record<UserToggleableEventType, string>;

/** The same vocabulary, paired with the i18n key the preferences UI renders. */
export const USER_TOGGLEABLE_EVENTS = USER_TOGGLEABLE_EVENT_TYPES.map((type) => ({
  type,
  labelKey: LABEL_KEYS[type],
}));

export function isUserToggleableEventType(value: string): value is UserToggleableEventType {
  return (USER_TOGGLEABLE_EVENT_TYPES as readonly string[]).includes(value);
}
