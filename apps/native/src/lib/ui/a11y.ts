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
