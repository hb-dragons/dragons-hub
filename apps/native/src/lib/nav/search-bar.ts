import type { NativeStackNavigationOptions } from "expo-router";

/**
 * The system search field in a native header (issue #223).
 *
 * Two screens carry one: the board, and the referee-assignment sheet that
 * replaced the hand-drawn docked field. Both want the same field — visible
 * while the list scrolls, no auto-capitalisation, text reported as text — and
 * differ only in where UIKit is told to put it. Stating that once means the
 * second field cannot quietly behave unlike the first.
 */

type SearchBarOptions = NonNullable<NativeStackNavigationOptions["headerSearchBarOptions"]>;

export interface SearchFieldSpec {
  placeholder: string;
  /**
   * Where UIKit puts the field:
   *
   * - `"integrated"` — iOS 26's floating glass toolbar at the bottom of the
   *   screen (the trailing edge of the navigation bar on iPad). Named
   *   explicitly rather than left to `"automatic"`, which reserves a stacked
   *   under-title slot during the push transition and draws its bar background
   *   over the screen's own content until the field settles into the toolbar —
   *   visible as a header overlay that flashes and disappears.
   * - `"stacked"` — below the title inside the navigation bar. What a sheet
   *   wants: a sheet does not own the bottom of the screen, so a field docked
   *   there would sit over the content behind it.
   */
  placement: "integrated" | "stacked";
  /** Every keystroke. Debounce on the way to a request, not here. */
  onChangeText: (text: string) => void;
  /** The field's Cancel button — a deliberate clear, so it applies at once. */
  onCancel: () => void;
}

export function searchFieldOptions(spec: SearchFieldSpec): SearchBarOptions {
  return {
    placeholder: spec.placeholder,
    placement: spec.placement,
    // The list under the field is read while searching; a field that hid on
    // scroll would take the query out of sight.
    hideWhenScrolling: false,
    autoCapitalize: "none",
    onChangeText: (event) => spec.onChangeText(event.nativeEvent.text),
    onCancelButtonPress: () => spec.onCancel(),
  };
}
