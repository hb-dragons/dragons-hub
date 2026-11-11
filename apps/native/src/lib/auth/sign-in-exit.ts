/** The slice of a React Navigation state the sign-in exit reads. */
export interface NavState {
  key?: string;
  index?: number;
  routeNames?: string[];
  routes: { name: string; state?: NavState }[];
}

export type SignInExit =
  /** The tabs under the sheet do not show the signed-in set yet. */
  | { kind: "wait" }
  /** Switch the tabs under the sheet to Today, without touching the sheet. */
  | { kind: "jump"; action: { type: "JUMP_TO"; target: string; payload: { name: "today" } } }
  /** Today is focused under the sheet: close it. */
  | { kind: "dismiss" };

const TABS_ROUTE = "(tabs)";
const TODAY_TAB = "today";

/**
 * How sign-in leaves after a successful sign-in (#396).
 *
 * Closing the sheet first and then replacing to `/today` mounted Today during
 * the dismiss animation, so its header and content settled in view and the
 * page visibly jumped. Instead, Today is focused *under* the sheet and the
 * sheet closes once it is there.
 *
 * Signing in changes the tab set, which remounts the tab navigator (see
 * `app/(tabs)/_layout.tsx`); until that has happened there is no Today tab to
 * switch to, hence `wait`. The jump is aimed at the tab navigator's own key:
 * a plain `router.navigate("/today")` from inside the sheet resolves against
 * the root stack, whose focused route is the sheet, and pushes a second
 * `(tabs)` on top instead.
 */
export function signInExit(root: NavState | undefined): SignInExit {
  const tabs = root?.routes.find((route) => route.name === TABS_ROUTE)?.state;
  if (!tabs?.key || !tabs.routeNames?.includes(TODAY_TAB)) return { kind: "wait" };
  if (tabs.routes[tabs.index ?? 0]?.name === TODAY_TAB) return { kind: "dismiss" };
  return { kind: "jump", action: { type: "JUMP_TO", target: tabs.key, payload: { name: TODAY_TAB } } };
}
