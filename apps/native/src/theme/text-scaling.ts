/**
 * Layout rules for the system text size (Dynamic Type on iOS, font scale on
 * Android). React Native scales every `Text` by `fontScale` with no cap by
 * default; these helpers decide where that needs help.
 *
 * - Tables switch to a stacked row layout once the scale reaches the first
 *   iOS accessibility size, where a row of numeric columns no longer fits a
 *   phone's width.
 * - Only text that sits in a fixed slot it cannot grow out of is capped:
 *   scoreboard digits and table headers. Body, captions and labels are never
 *   capped (HIG: "Keep text truncation to a minimum").
 */

/**
 * The fontScale at which tables stack. iOS reports 1.353 for xxxLarge, the
 * largest regular size, and 1.786 for AX1; Android 14 offers 1.5. Stacking
 * from 1.5 covers every accessibility size on both and leaves the regular
 * sizes on the column layout.
 */
export const STACKED_LAYOUT_FONT_SCALE = 1.5;

export type TableLayout = "columns" | "stacked";

/** Whether a table renders its columns side by side or one row per value. */
export function tableLayoutFor(fontScale: number): TableLayout {
  return fontScale >= STACKED_LAYOUT_FONT_SCALE ? "stacked" : "columns";
}

/**
 * `maxFontSizeMultiplier` per text style token. A role not listed here is
 * uncapped, which is the default on purpose.
 */
export const MAX_FONT_SIZE_MULTIPLIER = {
  /** The big result digits in the game header. */
  score: 1.5,
  /** Stat strip values. */
  stat: 1.5,
  /** Column headings above table rows. */
  tableHeader: 2,
} as const;

type TextRole =
  | keyof typeof MAX_FONT_SIZE_MULTIPLIER
  | "screenTitle"
  | "sectionTitle"
  | "cardTitle"
  | "body"
  | "caption"
  | "label"
  | "button"
  | "tabLabel";

/** The `maxFontSizeMultiplier` prop for a text role, or `undefined` for none. */
export function maxFontSizeMultiplierFor(role: TextRole): number | undefined {
  return role in MAX_FONT_SIZE_MULTIPLIER
    ? MAX_FONT_SIZE_MULTIPLIER[role as keyof typeof MAX_FONT_SIZE_MULTIPLIER]
    : undefined;
}

/**
 * A size given in points at the default text size, grown with the text above
 * it. For slots that hold text but must stay a fixed size relative to a
 * neighbour (a date column, a label beside a form strip); never shrinks below
 * the base, so the smaller text sizes keep today's layout.
 */
export function scaledSize(base: number, fontScale: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 1 ? fontScale : 1;
  return Math.ceil(base * scale);
}
