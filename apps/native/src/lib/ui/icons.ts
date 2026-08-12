import type { AndroidSymbol, SFSymbol } from "expo-symbols";

/**
 * The app's chrome icon vocabulary (#221).
 *
 * Every icon the app draws outside the brand assets is named here by the *role*
 * it plays — "the button that adds something", not "a plus sign" — and screens
 * render it through `<Icon name="add" />`. Two reasons the names are roles:
 * a screen never has to know which symbol Apple happens to ship for a job, and
 * changing that symbol is one edit here rather than a sweep.
 *
 * Each role carries both tiers per ADR 0001: an SF Symbol for iOS, and the
 * Material symbol `expo-symbols` falls back to on Android. Both name types come
 * from the symbol catalogues themselves, so a typo is a compile error rather
 * than a blank space on a device.
 *
 * One constraint the types cannot express: the app's iOS floor is 16.4
 * (`app.json`'s `deploymentTarget`), so a symbol has to exist in SF Symbols 4.0
 * or earlier. The SF Symbols app shows a symbol's availability; everything
 * below is 4.0 or older.
 */
export interface IconSymbol {
  /** SF Symbol name, rendered on iOS. */
  ios: SFSymbol;
  /** Material symbol name, the Android fallback tier (ADR 0001). */
  android: AndroidSymbol;
}

export const ICONS = {
  /** Creates something: a board, a column, a task, a checklist item. */
  add: { ios: "plus", android: "add" },
  /** Dismisses the surface it sits on. */
  close: { ios: "xmark", android: "close" },
  /** Empties a value that is already set — a filter, a search field. */
  clear: { ios: "xmark.circle.fill", android: "cancel" },
  /** Opens the sort options. */
  sort: { ios: "arrow.up.arrow.down", android: "swap_vert" },
  /** Opens the actions that did not fit in the bar. */
  more: { ios: "ellipsis", android: "more_horiz" },
  /** Sends the composed message. */
  send: { ios: "arrow.up", android: "arrow_upward" },
  /** Stops the answer being generated. */
  stop: { ios: "stop.fill", android: "stop" },
  /** Marks a date a task is due on. */
  due: { ios: "calendar", android: "calendar_today" },
  /** Marks a task's checklist progress. */
  checklist: { ios: "checklist", android: "checklist" },
  /** A row that leads somewhere when tapped. */
  disclosure: { ios: "chevron.right", android: "chevron_right" },
  /** Confirms: a ticked checkbox, a chosen row, a saved edit. */
  check: { ios: "checkmark", android: "check" },
  /** Flags something the user should read before acting. */
  warning: { ios: "exclamationmark.triangle.fill", android: "warning" },
  /** Destroys what it sits on: the delete button on the task sheet. */
  delete: { ios: "trash", android: "delete" },
  /** A board column — the menu entry that adds one. */
  column: { ios: "rectangle.split.3x1", android: "view_column" },
  /** Opens the settings of the surface it sits on. */
  settings: { ios: "gearshape", android: "settings" },
} as const satisfies Record<string, IconSymbol>;

/** A role in the vocabulary above, i.e. what `<Icon name>` accepts. */
export type IconName = keyof typeof ICONS;

/**
 * The iOS symbol for a role, for chrome that draws its own symbol.
 *
 * `<Icon>` is the answer wherever the app renders the symbol itself. A native
 * toolbar item (#224) does not: UIKit draws it from a name, so that call site
 * needs the string. Reading it here rather than spelling it out is what keeps
 * the vocabulary single — a bar button naming `"arrow.up.arrow.down"` directly
 * would be a second place deciding what "sort" looks like.
 *
 * The task context menu (#220) is the deliberate exception and spells its
 * symbols literally: it exists on iOS only, so a role there would carry an
 * Android tier nothing ever draws. A bar item has one, because the Android bar
 * falls back to `<Icon>`.
 *
 * No Android counterpart here, for the same reason. UIKit is this accessor's
 * only consumer, and the Android toolbar takes an image source rather than a
 * symbol name, so a `materialSymbolFor` would return something nothing on that
 * platform accepts.
 */
export function symbolFor(name: IconName): SFSymbol {
  return ICONS[name].ios;
}
