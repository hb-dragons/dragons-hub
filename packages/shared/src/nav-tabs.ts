import type { GateUser } from "./rbac";
import { canViewOpenGames } from "./rbac";

export type TabId =
  | "home"
  | "schedule"
  | "standings"
  | "teams"
  | "today"
  | "officiating";

export function selectTabs(user: GateUser): TabId[] {
  if (!user) return ["home", "schedule", "standings", "teams"];
  // Officiating replaces Standings for users with assignment duties; standings
  // stay reachable through team detail. Five tabs for every signed-in user.
  const third: TabId = canViewOpenGames(user) ? "officiating" : "standings";
  return ["home", "schedule", third, "today", "teams"];
}

/**
 * Whether this user needs a deliberate entry point to the league tables from
 * another surface, because their tab set has no Standings tab.
 *
 * Derived from {@link selectTabs} rather than re-deciding who officiates, so
 * the two can never disagree about who lost the tab.
 */
export function needsStandingsShortcut(user: GateUser): boolean {
  return !selectTabs(user).includes("standings");
}
