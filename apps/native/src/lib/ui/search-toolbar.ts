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
 */
const IOS_PHONE_BOTTOM_SEARCH_TOOLBAR_PT = 40;

export function bottomSearchToolbarClearance(opts: {
  os: string;
  isPad: boolean;
}): number {
  if (opts.os !== "ios" || opts.isPad) return 0;
  return IOS_PHONE_BOTTOM_SEARCH_TOOLBAR_PT;
}
