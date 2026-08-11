import type { SFSymbol } from "expo-symbols";

/**
 * The actions a task carries, in the order a menu lists them (issue #220).
 *
 * There used to be two lists: one for the iOS action sheet, one for the
 * Android fallback sheet the board mounted next to it. Both are gone, and the
 * native context menu on a task card is built from this one — which is why the
 * labels are named here and nowhere else (`task-actions.test.ts` fails the
 * build on a second site spelling `board.task.actions.*`).
 *
 * A context menu is hidden until someone holds a card, so per the HIG every
 * entry also has a visible control: `mirroredBy` names it, and the same test
 * checks the task detail sheet still calls it.
 */
export type TaskActionKey = "move" | "priority" | "due" | "delete";

export interface TaskActionSpec {
  key: TaskActionKey;
  /** i18n key of the label, the app's only spelling of it. */
  labelKey: string;
  /**
   * SF Symbol drawn beside the label.
   *
   * A literal rather than a role from `lib/ui/icons.ts`: UIKit draws these
   * inside the menu, so nothing here goes through `<Icon>`, and the registry's
   * Android tier would name a fallback for a menu that only exists on iOS.
   * Same constraint as the registry, though — the app's floor is iOS 16.4, so
   * every name below is SF Symbols 4.0 or older.
   */
  icon: SFSymbol;
  /**
   * UIKit's destructive attribute: draws the row red. Destructive actions are
   * also listed last, which the test asserts rather than trusting the order
   * below to stay that way.
   */
  destructive: boolean;
  /**
   * The call in `components/board/TaskDetailBody.tsx` that does the same thing
   * from the visible interface, spelled as it is written there.
   */
  mirroredBy: string;
}

export const TASK_ACTIONS: readonly TaskActionSpec[] = [
  {
    key: "move",
    labelKey: "board.task.actions.moveTo",
    icon: "arrow.right.square",
    destructive: false,
    mirroredBy: "openMoveToSheet",
  },
  {
    key: "priority",
    labelKey: "board.task.actions.setPriority",
    icon: "flag",
    destructive: false,
    mirroredBy: "openPriorityPickerSheet",
  },
  {
    key: "due",
    labelKey: "board.task.actions.setDue",
    icon: "calendar",
    destructive: false,
    mirroredBy: "openDuePickerSheet",
  },
  {
    key: "delete",
    labelKey: "board.task.actions.delete",
    icon: "trash",
    destructive: true,
    mirroredBy: "useDeleteTaskWithUndo",
  },
];

const BY_KEY = new Map<TaskActionKey, TaskActionSpec>(
  TASK_ACTIONS.map((action) => [action.key, action]),
);

/** One action by key, for a surface that renders a single one of them. */
export function taskAction(key: TaskActionKey): TaskActionSpec {
  // Non-null: `TaskActionKey` is the union of the keys above, and the test
  // walks every one of them through this lookup.
  return BY_KEY.get(key)!;
}
