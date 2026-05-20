import type { GateUser } from "./rbac";
import { visibleSurfaces } from "./nav-surfaces";

export type TabId = "home" | "schedule" | "standings" | "teams" | "today" | "tools";

export function selectTabs(user: GateUser): TabId[] {
  if (!user) return ["home", "schedule", "standings", "teams"];
  const tabs: TabId[] = ["home", "schedule", "today", "teams"];
  if (visibleSurfaces(user).length > 0) tabs.push("tools");
  return tabs;
}
