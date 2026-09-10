/**
 * The padding `Screen` puts around its content.
 *
 * A scrolling `Screen` owns the scroll view, so it ends the content with
 * breathing room of its own. A non-scrolling one (`scroll={false}`) wraps
 * either a list that brings its own scroll view and end padding, or a
 * full-height centred state (spinner, error, not-found). Padding the wrapper's
 * bottom there does not add room, it clips: the list's cells vanish that many
 * points above the bottom edge. On iOS that strip hides under the translucent
 * tab bar; on Android the tab content ends at the bar's top edge, so the strip
 * is a blank band above an opaque bar.
 */
export function screenContentPadding(opts: {
  scroll: boolean;
  spacing: { lg: number; xl: number };
}): { paddingHorizontal: number; paddingBottom?: number } {
  const { scroll, spacing } = opts;
  return scroll
    ? { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }
    : { paddingHorizontal: spacing.lg };
}
