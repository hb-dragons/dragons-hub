/**
 * The keyboard-aware scroll offset that keeps the sign-in button visible
 * (#396). `KeyboardAwareScrollView` lifts the *focused field* clear of the
 * keyboard by `bottomOffset`; the button sits further down, under the other
 * field and any error line, so the offset is the distance from the focused
 * field's bottom edge to the button's, plus the gap left above the keyboard.
 * Both bottoms are y positions inside the scroll content.
 */
export function submitClearance(layout: { fieldBottom: number; buttonBottom: number; gap: number }): number {
  return Math.max(layout.gap, layout.buttonBottom - layout.fieldBottom + layout.gap);
}
