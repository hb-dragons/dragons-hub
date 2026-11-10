import { isStaff, type GateUser, type TabId } from "@dragons/shared";
import { systemOwnsLanguage } from "@/lib/locale-pref";

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

/** A row on Profile. Each one is drawn by the Profile screen. */
export type ProfileRow =
  | "signIn"
  | "contact"
  | "notifications"
  | "lock"
  | "language"
  | "languageSettings"
  | "privacy"
  | "imprint"
  | "support"
  | "version"
  | "signOut"
  | "deleteAccount"
  | "closureRequested";

/**
 * A group of rows on Profile: Konto, App, Info and the closing session group
 * for staff; a sign-in block, App and Info for a fan.
 */
export type ProfileGroup = {
  id: "signIn" | "account" | "app" | "info" | "session";
  rows: ProfileRow[];
};

const INFO: ProfileGroup = { id: "info", rows: ["privacy", "imprint", "support", "version"] };

/**
 * Profile's groups and rows, in order (#398), read like iOS Settings.
 *
 * - Contact data only for an account linked to a staff record (the session's
 *   `personId`), which is the only account `/me/staff` has data for.
 * - The app lock guards a signed-in session, so only staff get it, and only
 *   on a device that can do biometrics.
 * - No appearance picker (#399): the app follows the system setting.
 * - Language (#399): iOS lists the app's languages in its own Settings, so the
 *   row opens the app's page there (`languageSettings`). Android keeps the
 *   in-app picker (`language`), since per-app languages are not on every
 *   version it runs on.
 * - Konto löschen sits with Abmelden and opens the account closure request
 *   (#400); once the account has requested closure, the row states when
 *   instead of offering the action again.
 */
export function profileGroups(opts: {
  user: (GateUser & { personId?: number | null }) | null | undefined;
  lockSupported: boolean;
  os: string;
  closureRequested: boolean;
}): ProfileGroup[] {
  const { user, lockSupported, os, closureRequested } = opts;
  const language: ProfileRow = systemOwnsLanguage(os) ? "languageSettings" : "language";
  if (!user) {
    return [{ id: "signIn", rows: ["signIn"] }, { id: "app", rows: [language] }, INFO];
  }
  return [
    { id: "account", rows: isStaff(user) ? ["contact", "notifications"] : ["notifications"] },
    { id: "app", rows: lockSupported ? ["lock", language] : [language] },
    INFO,
    { id: "session", rows: ["signOut", closureRequested ? "closureRequested" : "deleteAccount"] },
  ];
}
