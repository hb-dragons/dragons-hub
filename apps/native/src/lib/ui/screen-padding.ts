/**
 * The padding a scrolling `Screen` puts around its content: it owns the scroll
 * view, so it insets the sides and ends the content with breathing room.
 *
 * A non-scrolling `Screen` (`scroll={false}`) pads nothing, because it draws
 * no view of its own between its safe-area container and its child — see
 * `Screen`. That child is either a list, which brings its own scroll view and
 * puts the side and end padding in its `contentContainerStyle`, or a
 * full-height centred state (spinner, error, not-found) with padding of its
 * own.
 */
export function screenContentPadding(spacing: { lg: number; xl: number }): {
  paddingHorizontal: number;
  paddingBottom: number;
} {
  return { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl };
}
