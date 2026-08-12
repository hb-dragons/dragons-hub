import type { IconName } from "@/lib/ui/icons";

/**
 * What the board screen's header offers, in the order the toolbar draws it
 * (issue #224).
 *
 * These used to be two `Pressable`s inside a `headerRight` render prop, styled
 * to 44pt tap targets by hand and drawing their symbols through `<Icon>` —
 * a JS view hosted inside the native bar rather than a bar button item. They
 * are `Stack.Toolbar` items now, so UIKit owns the metrics, the tint, the
 * pressed state and, on iOS 26, the glass the bar puts behind them.
 *
 * Two placements, and the split is the point:
 *  - `"toolbar"` — its own bar button item. Creating a task, and nothing else:
 *    it is the board's primary action, which is why it no longer needs a
 *    floating button drawn over the content layer to be reachable.
 *  - `"overflow"` — behind the toolbar's ellipsis menu, a real `UIMenu`. Sort,
 *    add column and board settings are all occasional, and a bar that shows
 *    every one of them is a bar that shows none of them clearly.
 *
 * Icons are roles from the app's vocabulary (`lib/ui/icons.ts`), not symbols:
 * `HeaderActions` resolves a role to whatever the platform's bar can draw — an
 * SF Symbol name for UIKit, an `<Icon>` for the Android fallback — and the
 * board does not have to know which.
 */
export type BoardActionKey = "create" | "sort" | "addColumn" | "settings";

export interface BoardActionSpec {
  key: BoardActionKey;
  /** i18n key of the label, the app's only spelling of it. */
  labelKey: string;
  /** Role in the app's icon vocabulary; the bar resolves it per platform. */
  icon: IconName;
  /** Its own bar button item, or a line in the overflow menu. */
  placement: "toolbar" | "overflow";
}

export const BOARD_ACTIONS: readonly BoardActionSpec[] = [
  {
    key: "create",
    labelKey: "board.quickCreate.open",
    icon: "add",
    placement: "toolbar",
  },
  {
    key: "sort",
    labelKey: "board.sort.open",
    icon: "sort",
    placement: "overflow",
  },
  {
    key: "addColumn",
    labelKey: "board.column.add",
    icon: "column",
    placement: "overflow",
  },
  {
    key: "settings",
    labelKey: "admin.boards.settingsTitle",
    icon: "settings",
    placement: "overflow",
  },
];

/** The actions the bar shows directly. */
export const BOARD_TOOLBAR_ACTIONS = BOARD_ACTIONS.filter(
  (action) => action.placement === "toolbar",
);

/** The actions behind the bar's ellipsis menu, in menu order. */
export const BOARD_OVERFLOW_ACTIONS = BOARD_ACTIONS.filter(
  (action) => action.placement === "overflow",
);
