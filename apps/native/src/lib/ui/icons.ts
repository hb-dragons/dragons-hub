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
} as const satisfies Record<string, IconSymbol>;

/** A role in the vocabulary above, i.e. what `<Icon name>` accepts. */
export type IconName = keyof typeof ICONS;
