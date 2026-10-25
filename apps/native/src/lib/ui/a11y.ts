/**
 * Accessibility props for interactive chrome, kept here rather than inline so
 * the shape is one decision and can be unit-tested (the native package has no
 * component-render seam by convention — see `vitest.config.ts`).
 */

export interface FilterPillA11y {
  accessibilityRole: "button";
  accessibilityLabel: string;
  accessibilityState: { selected: boolean };
}

/**
 * Props for a filter pill or chip: a button whose *selected* state is the part
 * assistive technology cannot infer. `selected` maps to the iOS
 * `UIAccessibilityTraitSelected` trait, so VoiceOver reads "<label>, selected"
 * for an active filter; TalkBack announces the equivalent.
 *
 * Always pass the current state, including `false` — the trait is read from
 * the key being present, so omitting it for inactive pills leaves the user
 * unable to tell "filter off" from "not a filter" (#218).
 */
export function filterPillA11y(label: string, selected: boolean): FilterPillA11y {
  return {
    accessibilityRole: "button",
    accessibilityLabel: label,
    accessibilityState: { selected },
  };
}

export interface PagerTabA11y {
  accessibilityRole: "tab";
  accessibilityLabel: string;
  accessibilityState: { selected: boolean };
}

/**
 * Props for one tab of a pager selector — the board's column pills, which pick
 * the page the pager shows rather than narrowing a list. `tab` is the role that
 * says so (TalkBack reads "tab", and on iOS the pill joins the container's
 * `tablist`), and `selected` marks the page currently on screen. Same rule as
 * `filterPillA11y`: pass `false` explicitly for the pills that are not active.
 */
export function pagerTabA11y(label: string, selected: boolean): PagerTabA11y {
  return {
    accessibilityRole: "tab",
    accessibilityLabel: label,
    accessibilityState: { selected },
  };
}

/**
 * The smallest tap target, in points, on either axis — Apple's HIG minimum.
 * Material asks for 48dp; 44 is the floor both platforms' reviewers accept.
 */
export const MIN_TAP_TARGET = 44;

/** `hitSlop` insets, in the shape `Pressable` takes. */
export interface TapSlop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * The `hitSlop` that grows a pressable drawn at `width` by `height` to at least
 * `MIN_TAP_TARGET` on each axis, split evenly on both sides. A box already at
 * or above the minimum gets zero insets, so the helper is safe on anything.
 *
 * For a control whose drawn size is fixed (icon buttons, swatches, close
 * buttons). A text link of unknown width takes `MIN_TAP_TARGET` as a
 * `minHeight` instead.
 */
export function tapTargetSlop(width: number, height: number = width): TapSlop {
  const x = Math.max(0, Math.ceil((MIN_TAP_TARGET - width) / 2));
  const y = Math.max(0, Math.ceil((MIN_TAP_TARGET - height) / 2));
  return { top: y, bottom: y, left: x, right: x };
}

/**
 * `hitSlop` for a bare text link or text button — a word or two in caption or
 * body type, drawn without padding. Sized for the smallest such link the app
 * has (a ~16pt line, ~28pt wide), so it lifts every one of them to the minimum;
 * a wider link simply gets more than it needs sideways.
 */
export const TEXT_LINK_SLOP: TapSlop = tapTargetSlop(28, 16);
