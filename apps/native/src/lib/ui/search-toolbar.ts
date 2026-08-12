/**
 * Clearance (pt) that screen content must keep above the bottom safe-area
 * inset so it is not covered by the iOS 26 integrated header-search toolbar.
 *
 * Background: when a native-stack screen sets `headerSearchBarOptions`,
 * iOS 26 places the search field in a floating glass toolbar at the bottom
 * of the screen on iPhone. Neither react-native-screens nor UIKit extend the
 * screen's safe-area insets for that toolbar, and no API exposes its height,
 * so the value is measured empirically: the capsule top sits ~40pt above the
 * home-indicator safe-area inset (iPhone 17 Pro, iOS 26.3).
 *
 * On iPad the integrated search bar stays in the navigation bar (no bottom
 * toolbar), and Android has no such toolbar — clearance is 0 there.
 *
 * Re-checked on SDK 57, 2026-08-12 (#224): still no measurement API, so the
 * constant stays. What was looked at, so the next re-check starts further on:
 *  - react-native-screens 4.26 declares exactly one size event,
 *    `onHeaderHeightChange`, and it reports the *header*. Nothing reports the
 *    bottom toolbar, and the screen's safe-area insets are unchanged by it —
 *    which is what `useHeaderHeight` on the board screen already relies on in
 *    the other direction.
 *  - expo-router 57's new `Stack.Toolbar` publishes its placement and its
 *    colours through context (`useToolbarPlacement`, `useToolbarColors`) and
 *    its height through nothing.
 *  - The search bar gained `allowToolbarIntegration`, which decides *whether*
 *    the field docks in that toolbar on iPhone, not how tall it ends up.
 */
const IOS_PHONE_BOTTOM_SEARCH_TOOLBAR_PT = 40;

export function bottomSearchToolbarClearance(opts: {
  os: string;
  isPad: boolean;
}): number {
  if (opts.os !== "ios" || opts.isPad) return 0;
  return IOS_PHONE_BOTTOM_SEARCH_TOOLBAR_PT;
}
