import { can, canViewOpenGames, type GateUser } from "./rbac";

export type SurfaceGroup =
  | "league"
  | "operations"
  | "social"
  | "notifications"
  | "system";

export interface Surface {
  id: string;
  group: SurfaceGroup;
  visible: (user: GateUser) => boolean;
}

export const SURFACE_GROUP_ORDER: readonly SurfaceGroup[] = [
  "league",
  "operations",
  "social",
  "notifications",
  "system",
];

export const SURFACES: readonly Surface[] = [
  { id: "officiating", group: "league", visible: (u) => canViewOpenGames(u) },
  { id: "matches", group: "league", visible: (u) => can(u, "match", "view") },
  { id: "standings", group: "league", visible: (u) => can(u, "standing", "view") },
  { id: "teams", group: "league", visible: (u) => can(u, "team", "view") },
  { id: "staffPeople", group: "league", visible: (u) => can(u, "team", "view") },
  { id: "boards", group: "operations", visible: (u) => can(u, "board", "view") },
  { id: "bookings", group: "operations", visible: (u) => can(u, "booking", "view") },
  { id: "venues", group: "operations", visible: (u) => can(u, "venue", "view") },
  { id: "broadcast", group: "operations", visible: (u) => can(u, "settings", "view") },
  { id: "createPost", group: "social", visible: (u) => can(u, "settings", "view") },
  { id: "notifications", group: "notifications", visible: (u) => can(u, "settings", "view") },
  { id: "watchRules", group: "notifications", visible: (u) => can(u, "settings", "view") },
  { id: "channels", group: "notifications", visible: (u) => can(u, "settings", "view") },
  { id: "domainEvents", group: "notifications", visible: (u) => can(u, "settings", "view") },
  { id: "pushTest", group: "notifications", visible: (u) => can(u, "settings", "update") },
  { id: "sync", group: "system", visible: (u) => can(u, "sync", "view") },
  // Every /admin/seasons route is behind settings:update (creating a season and
  // flipping which one is live are both writes), so the nav entry is gated the
  // same way — showing a link that 403s on arrival is worse than not showing it.
  { id: "seasons", group: "system", visible: (u) => can(u, "settings", "update") },
  { id: "settings", group: "system", visible: (u) => can(u, "settings", "view") },
  { id: "users", group: "system", visible: (u) => can(u, "settings", "update") },
];

export function visibleSurfaces(user: GateUser): Surface[] {
  return SURFACES.filter((s) => s.visible(user));
}
