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

/** Back buttons everywhere: the chevron, never the previous screen's title. */
const BACK_BUTTON_DISPLAY_MODE = "minimal" as const;

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
 * A pushed detail screen: a transparent header floating over content that
 * scrolls beneath it, with no title of its own unless the screen sets one from
 * its data.
 *
 * `headerTintColor` is passed in rather than left to the system because this
 * header has no background of its own — the chevron sits directly on screen
 * content, so it takes the theme's foreground colour for contrast.
 */
export function detailHeaderOptions(tintColor: string): NativeStackNavigationOptions {
  return {
    headerShown: true,
    headerTransparent: true,
    headerTitle: "",
    headerTintColor: tintColor,
    headerBackButtonDisplayMode: BACK_BUTTON_DISPLAY_MODE,
  };
}
