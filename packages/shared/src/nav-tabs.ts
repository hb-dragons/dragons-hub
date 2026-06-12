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
