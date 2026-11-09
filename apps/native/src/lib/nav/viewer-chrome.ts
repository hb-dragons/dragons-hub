import type { GateUser, TabId } from "@dragons/shared";

/**
 * What the app's chrome shows a given viewer (#394).
 *
 * One place decides who sees which account affordance, so no screen
 * re-derives "is this a fan or staff?" on its own. Shaped like `selectTabs`:
 * a signed-in user is staff, anything else is a fan.
 */

/**
 * The account entry point in a tab root's navigation bar.
 *
 * - `"sign-in"`: a fan's way to sign in, and to the language and legal rows.
 * - `"avatar"`: a staff member's initial-letter avatar, opening Profile.
 */
export type ProfileAffordance = "sign-in" | "avatar";

/**
 * Staff get their avatar on every tab root, because they work from
 * Officiating and Today and need sign-out and settings from there. Fans get
 * a single sign-in button on Home: most users never sign in, and the public
 * tabs stay uncluttered for them.
 */
export function tabRootProfileAffordance(user: GateUser, tab: TabId): ProfileAffordance | null {
  if (user) return "avatar";
  return tab === "home" ? "sign-in" : null;
}
