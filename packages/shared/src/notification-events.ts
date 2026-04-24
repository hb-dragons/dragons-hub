export const USER_TOGGLEABLE_EVENTS = [
  { type: "task.assigned", labelKey: "events.taskAssigned" },
  { type: "task.unassigned", labelKey: "events.taskUnassigned" },
  { type: "task.comment.added", labelKey: "events.taskComment" },
  { type: "task.due.reminder", labelKey: "events.taskDueReminder" },
] as const;

export type UserToggleableEventType = (typeof USER_TOGGLEABLE_EVENTS)[number]["type"];

export function isUserToggleableEventType(value: string): value is UserToggleableEventType {
  return USER_TOGGLEABLE_EVENTS.some((e) => e.type === value);
}
