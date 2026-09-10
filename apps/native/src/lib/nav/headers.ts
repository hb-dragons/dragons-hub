import type { NativeStackNavigationOptions } from "expo-router";

/**
 * The app's two native header shapes, declared once each.
 *
 * Screens name a shape here instead of spelling out header options inline, so
 * a header decision is made in one place and a screen's own file carries at
 * most the part that depends on its data (a title). Reconfiguring a native
 * header after the push transition has started re-runs the UIKit header
 * layout mid-animation, which shows up as a flash — see the note in
 * `app/admin/boards/[id].tsx`.
 *
 * Both shapes are deliberately short. On iOS 26 the system draws the header's
 * glass and its scroll-edge treatment (`scrollEdgeEffects` defaults to
 * "automatic" on every edge); every option we set on top of that is one the
 * system no longer gets to decide.
 */

/**
 * Back buttons everywhere: the chevron, never the previous screen's title.
 * Exported for the handful of screens whose header is neither shape below.
 */
export const BACK_BUTTON_DISPLAY_MODE = "minimal" as const;

/**
 * A tab root: a large title that collapses into a standard header as the
 * screen's scroll view moves.
 *
 * The scroll view has to be the first descendant chain of the screen and opt
 * into `contentInsetAdjustmentBehavior="automatic"` for the collapse and the
 * content inset to work — `Screen` does the latter for `edges={[]}`, see
 * `lib/ui/scroll-inset.ts`.
 *
 * Also used by `/league-tables`, which is the Standings tab's content reached
 * as a pushed screen; it renders the same title in the same treatment, and
 * picks up a back button from the stack.
 */
export function tabRootHeaderOptions(title: string): NativeStackNavigationOptions {
  return {
    headerShown: true,
    title,
    headerLargeTitleEnabled: true,
    headerBackButtonDisplayMode: BACK_BUTTON_DISPLAY_MODE,
  };
}

/**
 * A pushed detail screen: a header with no title of its own unless the screen
 * sets one from its data.
 *
 * On iOS it is transparent and floats over content that scrolls beneath it —
 * the system draws glass under the chevron, and insets the screen's first
 * scroll view for the header (`contentInsetAdjustmentBehavior`, see
 * `lib/ui/scroll-inset.ts`).
 *
 * On Android neither happens: there is no glass, and the inset behaviour is
 * an iOS-only prop, so under a transparent header the content was laid out
 * from the top of the screen — behind the status bar and the back button. The
 * header is opaque there, painted in the theme background so it reads as the
 * same surface, and the screen's content starts below it as on every other
 * Android toolbar.
 *
 * `headerTintColor` is passed in rather than left to the system because the
 * iOS header has no background of its own — the chevron sits directly on
 * screen content, so it takes the theme's foreground colour for contrast.
 */
export function detailHeaderOptions(opts: {
  tintColor: string;
  backgroundColor: string;
  os: string;
}): NativeStackNavigationOptions {
  const shared = {
    headerShown: true,
    headerTitle: "",
    headerTintColor: opts.tintColor,
    headerBackButtonDisplayMode: BACK_BUTTON_DISPLAY_MODE,
  } satisfies NativeStackNavigationOptions;
  if (opts.os === "android") {
    return {
      ...shared,
      headerTransparent: false,
      headerStyle: { backgroundColor: opts.backgroundColor },
    };
  }
  return { ...shared, headerTransparent: true };
}
