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
} as const;

export const ac = createAccessControl(statement);

const allCatalogPerms = Object.fromEntries(
  Object.entries(statement).map(([k, v]) => [k, [...v]]),
) as { [K in keyof typeof statement]: Array<(typeof statement)[K][number]> };

export const admin = ac.newRole({
  ...adminAc.statements,
  ...allCatalogPerms,
});

export const refereeAdmin = ac.newRole({
  referee:    ["view", "create", "update", "delete"],
  assignment: ["view", "create", "update", "delete", "claim", "release"],
  match:      ["view"],
  team:       ["view"],
  sync:       ["view", "trigger"],
});

export const venueManager = ac.newRole({
  venue:   ["view", "create", "update", "delete"],
  booking: ["view", "create", "update", "delete"],
  match:   ["view"],
});

export const teamManager = ac.newRole({
  team:     ["view", "manage"],
  match:    ["view"],
  standing: ["view"],
  referee:  ["view"],
});

export const roles = { admin, refereeAdmin, venueManager, teamManager };

export const ROLE_NAMES = ["admin", "refereeAdmin", "venueManager", "teamManager"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];
export type Resource = keyof typeof statement;
export type Action<R extends Resource> = (typeof statement)[R][number];

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

export function canAll(
  user: { role?: string | null } | null | undefined,
  perms: Partial<{ [R in Resource]: Action<R>[] }>,
): boolean {
  if (!user) return false;
  for (const [resource, actions] of Object.entries(perms) as [Resource, string[]][]) {
    for (const action of actions) {
      if (!can(user, resource, action as Action<typeof resource>)) return false;
    }
  }
  return true;
}

export function hasRole(
  user: { role?: string | null } | null | undefined,
  role: RoleName,
): boolean {
  if (!user) return false;
  return parseRoles(user.role).includes(role);
}

export function isReferee(
  user: { refereeId?: number | null } | null | undefined,
): boolean {
  return typeof user?.refereeId === "number";
}
