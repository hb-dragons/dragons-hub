import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

export const statement = {
  ...defaultStatements,

  referee:    ["view", "create", "update", "delete"],
  assignment: ["view", "create", "update", "delete", "claim", "release"],
  match:      ["view", "create", "update", "delete"],
  standing:   ["view"],
  venue:      ["view", "create", "update", "delete"],
  booking:    ["view", "create", "update", "delete"],
  team:       ["view", "manage"],
  sync:       ["view", "trigger"],
  settings:   ["view", "update"],
  board:      ["view", "create", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

const allCatalogPerms = Object.fromEntries(
  Object.entries(statement).map(([k, v]) => [k, [...v]]),
) as { [K in keyof typeof statement]: Array<(typeof statement)[K][number]> };

const admin = ac.newRole({
  ...adminAc.statements,
  ...allCatalogPerms,
});

const superadmin = ac.newRole({
  ...adminAc.statements,
  ...allCatalogPerms,
});

const refereeAdmin = ac.newRole({
  referee:    ["view", "create", "update", "delete"],
  assignment: ["view", "create", "update", "delete", "claim", "release"],
  match:      ["view"],
  team:       ["view"],
  board:      ["view", "create", "update"],
});

const venueManager = ac.newRole({
  venue:   ["view", "create", "update", "delete"],
  booking: ["view", "create", "update", "delete"],
  match:   ["view"],
  board:   ["view", "create", "update"],
});

const teamManager = ac.newRole({
  team:     ["view", "manage"],
  match:    ["view"],
  standing: ["view"],
  referee:  ["view"],
  board:    ["view", "create", "update"],
});

const coach = ac.newRole({
  team:     ["view"],
  match:    ["view"],
  standing: ["view"],
  board:    ["view"],
});

export const roles = { admin, superadmin, refereeAdmin, venueManager, teamManager, coach };

export const ROLE_NAMES = ["admin", "superadmin", "refereeAdmin", "venueManager", "teamManager", "coach"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];
export type Resource = keyof typeof statement;
export type Action<R extends Resource> = (typeof statement)[R][number];

export type GateUser =
  | { role?: string | null; refereeId?: number | null }
  | null
  | undefined;

export function parseRoles(role: string | null | undefined): RoleName[] {
  if (!role) return [];
  const parts = role
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const known = new Set<string>(ROLE_NAMES);
  return parts.filter((r): r is RoleName => known.has(r));
}

export function can<R extends Resource>(
  user: { role?: string | null } | null | undefined,
  resource: R,
  action: Action<R>,
): boolean {
  if (!user) return false;
  const assigned = parseRoles(user.role);
  if (assigned.length === 0) return false;
  for (const name of assigned) {
    const role = roles[name];
    const perms = role.statements as Partial<Record<Resource, readonly string[]>>;
    const allowed = perms[resource];
    if (allowed?.includes(action)) return true;
  }
  return false;
}

export function hasRole(
  user: { role?: string | null } | null | undefined,
  role: RoleName,
): boolean {
  if (!user) return false;
  return parseRoles(user.role).includes(role);
}

// superadmin is a strict superset of admin: any gate that admits `admin` must
// also admit `superadmin`. A gate that names `superadmin` still admits
// superadmin only (admin does NOT satisfy a superadmin requirement).
export function satisfiesRole(
  user: { role?: string | null } | null | undefined,
  role: RoleName,
): boolean {
  if (hasRole(user, role)) return true;
  return role === "admin" && hasRole(user, "superadmin");
}

export function isReferee<U extends { refereeId?: number | null }>(
  user: U | null | undefined,
): user is U & { refereeId: number } {
  return typeof user?.refereeId === "number";
}

export function canViewOpenGames(
  user:
    | { role?: string | null; refereeId?: number | null }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  return isReferee(user) || can(user, "assignment", "view");
}
