# RBAC Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-role string system with a fine-grained, multi-role, code-defined access-control layer built on better-auth's admin plugin, with one shared source of truth consumed by the API, web, and native apps.

**Architecture:** A `@dragons/shared/rbac` module exports the resource/action statement, role definitions (`admin`, `refereeAdmin`, `venueManager`, `teamManager`), and pure helpers (`can`, `canAll`, `hasRole`, `isReferee`, `parseRoles`). The API wraps better-auth's `userHasPermission` with four middleware primitives (`requireAuth`, `requirePermission`, `assertPermission`, `requireRefereeSelf`). Web adds a server-side session helper (fetches via HTTP with forwarded cookies) plus a server-component admin layout guard, a `<Can>` JSX gate, and a multi-role editor. Native re-uses the same shared helpers in its tab layout.

**Tech Stack:** better-auth 1.6.5 (admin plugin + access-control), Drizzle ORM, Hono, Next.js 16, Expo Router, Vitest 4.

---

## Spec reference

Design doc: `docs/superpowers/specs/2026-04-21-rbac-foundation-design.md`

## Notes for executor

- The monorepo uses pnpm workspaces + Turborepo. Run package-scoped commands via `pnpm --filter <pkg>`.
- Coverage thresholds: 95% lines/functions/statements, 90% branches (enforced in `apps/api/vitest.config.ts`).
- Tests live next to source files: `foo.ts` → `foo.test.ts`.
- Commit per task unless a task explicitly calls out a single final commit.
- Never add `Co-Authored-By` or AI-credit trailers (per `CLAUDE.md`).
- The writing-style rules in `CLAUDE.md` apply to any `.md` file you touch — avoid the banned phrases listed there.

## Admin route scope note

Beyond the routes that map cleanly to the role catalog (referee, assignment, venue, booking, team, standing, match, sync, user, settings), the API has a "long tail" of admin-only config routes: board, notification, channel-config, event, social, watch-rule, task, league, referee-rules. These were globally gated by `requireAdmin` in `app.ts`. In this plan we migrate them to `requirePermission("settings", "update")` — an admin-only permission that preserves current behavior. Splitting these into dedicated resources (so refereeAdmin could access referee-rules directly, etc.) is a follow-up. Referee-rules is the one exception: it goes to `requirePermission("referee", "update")` since it belongs to the referee-admin domain.

---

## Task 1: Scaffold the `@dragons/shared/rbac` module

**Files:**
- Create: `packages/shared/src/rbac.ts`
- Create: `packages/shared/src/rbac.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json`

**Depends on:** nothing.

- [ ] **Step 1: Add `better-auth` to shared package dependencies**

The shared package will import from `better-auth/plugins/access` and `better-auth/plugins/admin/access`. Add the dependency (workspace pin matches the API's version — 1.6.5).

Modify `packages/shared/package.json` — add to `dependencies`:

```json
  "dependencies": {
    "@dragons/sdk": "workspace:*",
    "better-auth": "1.6.5",
    "zod": "^4.3.6"
  },
```

Then:
```bash
pnpm install
```

- [ ] **Step 2: Create the rbac module**

Create `packages/shared/src/rbac.ts`:

```ts
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

// The resource × action catalog. Extend here when adding new permissioned features.
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

export const admin = ac.newRole({
  ...adminAc.statements,
  referee:    ["view", "create", "update", "delete"],
  assignment: ["view", "create", "update", "delete", "claim", "release"],
  match:      ["view", "create", "update", "delete"],
  standing:   ["view"],
  venue:      ["view", "create", "update", "delete"],
  booking:    ["view", "create", "update", "delete"],
  team:       ["view", "manage"],
  sync:       ["view", "trigger"],
  settings:   ["view", "update"],
});

export const refereeAdmin = ac.newRole({
  referee:    ["view", "create", "update", "delete"],
  assignment: ["view", "create", "update", "delete", "claim", "release"],
  match:      ["view"],
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

// Parse the better-auth multi-role format (comma-separated string) into a validated array.
// Unknown role names are filtered out silently — they never appear in the union of permissions.
export function parseRoles(role: string | null | undefined): RoleName[] {
  if (!role) return [];
  const parts = role
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const known = new Set<string>(ROLE_NAMES);
  return parts.filter((r): r is RoleName => known.has(r));
}

// Pure synchronous permission check. Unions permissions across all of user's roles.
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
    // Access the permission map the access-control library stores on the role.
    const perms = role.statements as Partial<Record<Resource, readonly string[]>>;
    const allowed = perms[resource];
    if (allowed?.includes(action)) return true;
  }
  return false;
}

// True only when every listed permission is granted.
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

// Role-name presence check (for UI copy like "Admin" badges).
export function hasRole(
  user: { role?: string | null } | null | undefined,
  role: RoleName,
): boolean {
  if (!user) return false;
  return parseRoles(user.role).includes(role);
}

// Referee self-service gate. Identity-based (not a role).
export function isReferee(
  user: { refereeId?: number | null } | null | undefined,
): boolean {
  return typeof user?.refereeId === "number";
}
```

- [ ] **Step 3: Write tests — write them first, verify they fail**

Create `packages/shared/src/rbac.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ROLE_NAMES,
  can,
  canAll,
  hasRole,
  isReferee,
  parseRoles,
  type RoleName,
} from "./rbac";

describe("parseRoles", () => {
  it("returns empty array for null, undefined, empty string", () => {
    expect(parseRoles(null)).toEqual([]);
    expect(parseRoles(undefined)).toEqual([]);
    expect(parseRoles("")).toEqual([]);
  });

  it("returns single role", () => {
    expect(parseRoles("admin")).toEqual(["admin"]);
  });

  it("returns multiple roles, trimming whitespace", () => {
    expect(parseRoles("admin, refereeAdmin , venueManager")).toEqual([
      "admin",
      "refereeAdmin",
      "venueManager",
    ]);
  });

  it("filters out unknown role names", () => {
    expect(parseRoles("admin,notARealRole,refereeAdmin")).toEqual([
      "admin",
      "refereeAdmin",
    ]);
  });

  it("tolerates stray commas", () => {
    expect(parseRoles("admin,,refereeAdmin,")).toEqual(["admin", "refereeAdmin"]);
  });
});

describe("can", () => {
  const cases: Array<[RoleName, string, string, boolean]> = [
    ["admin", "referee", "delete", true],
    ["admin", "venue", "delete", true],
    ["admin", "settings", "update", true],
    ["refereeAdmin", "referee", "delete", true],
    ["refereeAdmin", "assignment", "claim", true],
    ["refereeAdmin", "match", "view", true],
    ["refereeAdmin", "match", "update", false],
    ["refereeAdmin", "venue", "view", false],
    ["venueManager", "venue", "create", true],
    ["venueManager", "booking", "delete", true],
    ["venueManager", "referee", "view", false],
    ["venueManager", "match", "view", true],
    ["teamManager", "team", "manage", true],
    ["teamManager", "standing", "view", true],
    ["teamManager", "referee", "view", true],
    ["teamManager", "referee", "update", false],
    ["teamManager", "venue", "view", false],
  ];
  for (const [role, resource, action, expected] of cases) {
    it(`${role} ${expected ? "CAN" : "CANNOT"} ${action} on ${resource}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(can({ role } as any, resource as any, action as any)).toBe(expected);
    });
  }

  it("returns false for null/undefined user", () => {
    expect(can(null, "referee", "view")).toBe(false);
    expect(can(undefined, "referee", "view")).toBe(false);
  });

  it("returns false for user with no role", () => {
    expect(can({ role: null }, "referee", "view")).toBe(false);
    expect(can({ role: "" }, "referee", "view")).toBe(false);
  });

  it("unions permissions across multiple roles", () => {
    const user = { role: "refereeAdmin,venueManager" };
    expect(can(user, "referee", "delete")).toBe(true); // from refereeAdmin
    expect(can(user, "venue", "delete")).toBe(true);   // from venueManager
    expect(can(user, "settings", "update")).toBe(false); // neither grants
  });

  it("ignores unknown roles when checking permissions", () => {
    const user = { role: "garbage,refereeAdmin" };
    expect(can(user, "referee", "delete")).toBe(true);
  });
});

describe("canAll", () => {
  it("returns true only if every permission holds", () => {
    const user = { role: "refereeAdmin" };
    expect(
      canAll(user, { referee: ["view", "update"], assignment: ["claim"] }),
    ).toBe(true);
    expect(
      canAll(user, { referee: ["view"], venue: ["view"] }),
    ).toBe(false);
  });

  it("returns false for null user", () => {
    expect(canAll(null, { referee: ["view"] })).toBe(false);
  });
});

describe("hasRole", () => {
  it("returns true when role is in the user's roles", () => {
    expect(hasRole({ role: "admin,venueManager" }, "venueManager")).toBe(true);
  });

  it("returns false when role is not present", () => {
    expect(hasRole({ role: "venueManager" }, "admin")).toBe(false);
  });

  it("returns false for null user / null role", () => {
    expect(hasRole(null, "admin")).toBe(false);
    expect(hasRole({ role: null }, "admin")).toBe(false);
  });
});

describe("isReferee", () => {
  it("returns true when refereeId is a number", () => {
    expect(isReferee({ refereeId: 42 })).toBe(true);
  });

  it("returns false when refereeId is null, undefined, or absent", () => {
    expect(isReferee({ refereeId: null })).toBe(false);
    expect(isReferee({ refereeId: undefined })).toBe(false);
    expect(isReferee({})).toBe(false);
    expect(isReferee(null)).toBe(false);
  });
});

describe("ROLE_NAMES catalog", () => {
  it("has exactly the four v1 roles in canonical order", () => {
    expect(ROLE_NAMES).toEqual([
      "admin",
      "refereeAdmin",
      "venueManager",
      "teamManager",
    ]);
  });
});
```

- [ ] **Step 4: Run the tests, verify they pass**

```bash
pnpm --filter @dragons/shared test
```
Expected: all tests pass.

If a test fails, fix the module in `rbac.ts`, re-run. Do not modify test expectations unless the test is genuinely wrong.

- [ ] **Step 5: Export from the shared package index**

Modify `packages/shared/src/index.ts` — append at the bottom (keep existing content intact):

```ts
// RBAC — role/permission definitions and helpers
export {
  statement,
  ac,
  roles,
  admin,
  refereeAdmin,
  venueManager,
  teamManager,
  ROLE_NAMES,
  parseRoles,
  can,
  canAll,
  hasRole,
  isReferee,
} from "./rbac";
export type { RoleName, Resource, Action } from "./rbac";
```

- [ ] **Step 6: Verify typecheck passes across the workspace**

```bash
pnpm --filter @dragons/shared typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/package.json packages/shared/src/rbac.ts packages/shared/src/rbac.test.ts packages/shared/src/index.ts pnpm-lock.yaml
git commit -m "feat(shared): add rbac module with statement, roles, and pure helpers"
```

---

## Task 2: Create the new API middleware

**Files:**
- Create: `apps/api/src/middleware/rbac.ts`
- Create: `apps/api/src/middleware/rbac.test.ts`

**Depends on:** Task 1.

- [ ] **Step 1: Write the failing test file**

Create `apps/api/src/middleware/rbac.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// --- Mock setup ---
const mockGetSession = vi.fn();
const mockUserHasPermission = vi.fn();
vi.mock("../config/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      userHasPermission: (...args: unknown[]) => mockUserHasPermission(...args),
    },
  },
}));

import {
  requireAuth,
  requirePermission,
  assertPermission,
  requireRefereeSelf,
} from "./rbac";

beforeEach(() => {
  vi.clearAllMocks();
});

// --- requireAuth ---
describe("requireAuth", () => {
  const app = new Hono();
  app.use("/protected/*", requireAuth);
  app.get("/protected/ping", (c) => c.json({ ok: true }));

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await app.request("/protected/ping");
    expect(res.status).toBe(401);
  });

  it("passes through authenticated requests", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: null },
      session: { id: "s1" },
    });
    const res = await app.request("/protected/ping");
    expect(res.status).toBe(200);
  });
});

// --- requirePermission ---
describe("requirePermission", () => {
  const app = new Hono();
  app.use("/refs/*", requirePermission("referee", "update"));
  app.get("/refs/edit", (c) => c.json({ ok: true }));

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await app.request("/refs/edit");
    expect(res.status).toBe(401);
  });

  it("returns 403 when userHasPermission rejects", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "venueManager" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: false });
    const res = await app.request("/refs/edit");
    expect(res.status).toBe(403);
  });

  it("allows requests when userHasPermission approves", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "refereeAdmin" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: true });
    const res = await app.request("/refs/edit");
    expect(res.status).toBe(200);
  });

  it("calls userHasPermission with the resource/action specified at mount", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: true });
    await app.request("/refs/edit");
    expect(mockUserHasPermission).toHaveBeenCalledWith({
      body: {
        userId: "u1",
        permissions: { referee: ["update"] },
      },
    });
  });
});

// --- assertPermission ---
describe("assertPermission", () => {
  const app = new Hono();
  app.use("/x/*", requireAuth);
  app.get("/x/row/:id", async (c) => {
    await assertPermission(c, "assignment", "update");
    return c.json({ ok: true });
  });

  it("throws 403 when permission denied", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "venueManager" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: false });
    const res = await app.request("/x/row/42");
    expect(res.status).toBe(403);
  });

  it("returns 200 when permission granted", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "refereeAdmin" },
      session: { id: "s1" },
    });
    mockUserHasPermission.mockResolvedValue({ success: true });
    const res = await app.request("/x/row/42");
    expect(res.status).toBe(200);
  });
});

// --- requireRefereeSelf ---
describe("requireRefereeSelf", () => {
  const app = new Hono();
  app.use("/self/*", requireRefereeSelf);
  app.get("/self/games", (c) => c.json({ refereeId: c.get("refereeId") }));

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await app.request("/self/games");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no refereeId", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: null, refereeId: null },
      session: { id: "s1" },
    });
    const res = await app.request("/self/games");
    expect(res.status).toBe(403);
  });

  it("allows and populates refereeId when user is a referee", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: null, refereeId: 99 },
      session: { id: "s1" },
    });
    const res = await app.request("/self/games");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refereeId: 99 });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm --filter @dragons/api test src/middleware/rbac.test.ts
```
Expected: FAIL — `./rbac` not yet importable.

- [ ] **Step 3: Implement the middleware**

Create `apps/api/src/middleware/rbac.ts`:

```ts
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../config/auth";
import type { Resource, Action } from "@dragons/shared";
import { isReferee } from "@dragons/shared";

// Authenticate the request; populate c.vars with user + session. 401 on no session.
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
};

// Permission gate for route-groups. 401 on no session, 403 if permission denied.
export function requirePermission<R extends Resource>(
  resource: R,
  action: Action<R>,
): MiddlewareHandler {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const result = await auth.api.userHasPermission({
      body: {
        userId: session.user.id,
        permissions: { [resource]: [action] } as Record<string, string[]>,
      },
    });
    if (!result.success) {
      return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    }
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  };
}

// Inline permission assertion for row-level / dynamic checks inside a handler.
// Throws via HTTPException so Hono's error middleware responds with JSON.
export async function assertPermission<R extends Resource>(
  c: Context,
  resource: R,
  action: Action<R>,
): Promise<void> {
  const user = c.get("user") as { id: string } | undefined;
  if (!user) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  const result = await auth.api.userHasPermission({
    body: {
      userId: user.id,
      permissions: { [resource]: [action] } as Record<string, string[]>,
    },
  });
  if (!result.success) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

// Self-service gate for referee routes. Populates c.get("refereeId"). 403 if not linked.
export const requireRefereeSelf: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  if (!isReferee(session.user as { refereeId?: number | null })) {
    return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
  }
  c.set("user", session.user);
  c.set("session", session.session);
  c.set("refereeId", (session.user as { refereeId: number }).refereeId);
  await next();
};
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pnpm --filter @dragons/api test src/middleware/rbac.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/rbac.ts apps/api/src/middleware/rbac.test.ts
git commit -m "feat(api): add rbac middleware primitives (requireAuth, requirePermission, assertPermission, requireRefereeSelf)"
```

---

## Task 3: Wire better-auth config to the new access controller

**Files:**
- Modify: `apps/api/src/config/auth.ts`

**Depends on:** Task 1.

- [ ] **Step 1: Update the auth config**

Edit `apps/api/src/config/auth.ts`:

```ts
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { ac, roles } from "@dragons/shared";
import { db } from "./database";
import { env } from "./env";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [
    ...env.TRUSTED_ORIGINS,
    "dragons://",
    "dragons://*",
    ...(env.NODE_ENV === "development" ? ["exp://*"] : []),
  ],
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  advanced: {
    cookiePrefix: "dragons",
    crossSubDomainCookies:
      env.NODE_ENV === "production"
        ? { enabled: true, domain: ".app.hbdragons.de" }
        : { enabled: false },
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
    },
  },
  plugins: [
    admin({
      ac,
      roles,
      adminRoles: ["admin"],
    }),
    expo(),
  ],
});
```

Note the two changes:
- Added `import { ac, roles } from "@dragons/shared";`
- `admin(...)` call now passes `ac` and `roles`, and `defaultRole: "user"` is removed (new signups will have `role: null`).

- [ ] **Step 2: Run typecheck and the full API test suite**

```bash
pnpm --filter @dragons/api typecheck
pnpm --filter @dragons/api test
```
Expected: typecheck clean. Tests may show failures for `middleware/auth.test.ts` and routes that mock the old middleware — those are addressed in later tasks. Non-auth tests should still pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/auth.ts
git commit -m "feat(api): wire rbac access controller into better-auth admin plugin"
```

---

## Task 4: Add Hono context typing for the new middleware

**Files:**
- Modify: `apps/api/src/types/index.ts` (or wherever `AppEnv` is defined — grep first)

**Depends on:** Task 2.

- [ ] **Step 1: Locate the AppEnv type**

```bash
grep -rn "AppEnv" apps/api/src --include="*.ts" | head
```
Identify the file that defines `AppEnv` (likely `apps/api/src/types/index.ts` or `apps/api/src/types.ts`).

- [ ] **Step 2: Add `refereeId` to the Variables map**

The current `AppEnv` type already has `user` and `session` variables (consumed by the existing middleware). Add `refereeId` so `c.get("refereeId")` is typed.

In the file identified above, extend the `Variables` interface:

```ts
import type { Session, User } from "better-auth";

export type AppEnv = {
  Variables: {
    user: User;
    session: Session;
    refereeId?: number;
  };
};
```

If `AppEnv` already exists, add the `refereeId?: number` line inside its `Variables` block — don't reinvent the type.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @dragons/api typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/types
git commit -m "feat(api): type refereeId context variable for rbac middleware"
```

---

## Task 5: Flip the global `/admin/*` guard from `requireAdmin` to `requireAuth`

**Files:**
- Modify: `apps/api/src/app.ts`

**Depends on:** Tasks 2, 3.

- [ ] **Step 1: Update `app.ts`**

Edit `apps/api/src/app.ts`. Change the import and the middleware line:

Replace:
```ts
import { requireAdmin } from "./middleware/auth";
```
With:
```ts
import { requireAuth } from "./middleware/rbac";
```

Replace:
```ts
// Protect all admin routes
app.use("/admin/*", requireAdmin);
```
With:
```ts
// Admin routes require authentication; specific permissions are gated per-route.
app.use("/admin/*", requireAuth);
```

- [ ] **Step 2: Do NOT commit yet** — this change removes the blanket admin guard. Committing without the per-route guards in Task 6 would be a security regression. Proceed to Task 6 and commit both together at the end of Task 6.

---

## Task 6: Apply `requirePermission` to all admin routes + self-service to referee routes

This task updates every admin route file to add a specific `requirePermission(...)` in place of relying on the global `requireAdmin` gate, and replaces `requireReferee` with `requireRefereeSelf` on self-service referee routes. Pattern is identical across all files; code is shown once and applied to each listed file.

**Files to modify (20 files):**

Admin routes mapping to `refereeAdmin`:
- `apps/api/src/routes/admin/referee.routes.ts` → `requirePermission("referee", <action>)`
- `apps/api/src/routes/admin/referee-assignment.routes.ts` → `requirePermission("assignment", <action>)`
- `apps/api/src/routes/admin/referee-rules.routes.ts` → `requirePermission("referee", "update")`
- `apps/api/src/routes/admin/sync.routes.ts` → `requirePermission("sync", "trigger")` for POST/trigger, `requirePermission("sync", "view")` for GET

Admin routes mapping to `venueManager`:
- `apps/api/src/routes/admin/venue.routes.ts` → `requirePermission("venue", <action>)`
- `apps/api/src/routes/admin/booking.routes.ts` → `requirePermission("booking", <action>)`

Admin routes mapping to `teamManager`:
- `apps/api/src/routes/admin/team.routes.ts` → `requirePermission("team", <action>)` (`view` or `manage`)
- `apps/api/src/routes/admin/standings.routes.ts` → `requirePermission("standing", "view")`
- `apps/api/src/routes/admin/match.routes.ts` → `requirePermission("match", <action>)`

Admin-only long-tail routes (use `requirePermission("settings", "update")` — admin-only; follow-up PRs can split into dedicated resources):
- `apps/api/src/routes/admin/user.routes.ts` — uses better-auth default `user` resource (admin plugin defaults): `requirePermission("user", "update")` for PATCH, `requirePermission("user", "create")` for POST, `requirePermission("user", "delete")` for DELETE, `requirePermission("user", "list")` for GET (actions come from better-auth defaults in `@dragons/shared`'s `statement`)
- `apps/api/src/routes/admin/settings.routes.ts` → `requirePermission("settings", "view")` for GET, `requirePermission("settings", "update")` for PUT/POST
- `apps/api/src/routes/admin/board.routes.ts` → `requirePermission("settings", "update")`
- `apps/api/src/routes/admin/notification.routes.ts` → `requirePermission("settings", "update")`
- `apps/api/src/routes/admin/channel-config.routes.ts` → `requirePermission("settings", "update")`
- `apps/api/src/routes/admin/event.routes.ts` → `requirePermission("settings", "update")`
- `apps/api/src/routes/admin/social.routes.ts` → `requirePermission("settings", "update")`
- `apps/api/src/routes/admin/watch-rule.routes.ts` → `requirePermission("settings", "update")`
- `apps/api/src/routes/admin/task.routes.ts` → `requirePermission("settings", "update")`
- `apps/api/src/routes/admin/league.routes.ts` → `requirePermission("settings", "update")`

Referee self-service:
- `apps/api/src/routes/referee/games.routes.ts` — replace `requireReferee` with `requireRefereeSelf`, update body to use `c.get("refereeId")`
- `apps/api/src/routes/referee/assignment.routes.ts` — split: self-service actions (claim own, release own) use `requireRefereeSelf` + inline ownership check; admin-override actions use `requirePermission("assignment", "update")`

**Depends on:** Tasks 1-5.

- [ ] **Step 1: Pattern — replace the global guard with a per-route group guard**

For each admin route file, locate the file's top-level route group setup (every file has a `const xRoutes = new Hono<AppEnv>();` line). Apply `requirePermission` EITHER via `xRoutes.use("*", requirePermission(...))` when ALL routes in the file share the same permission requirement, OR per-route when actions differ (e.g. GET vs PUT).

Concrete example — `apps/api/src/routes/admin/venue.routes.ts` (all routes require `venue` permissions, but action depends on HTTP verb). Read the current file, then:

```ts
// At the top of the file, add the import:
import { requirePermission } from "../../middleware/rbac";

// Per-route attachment:
venueRoutes.get("/venues",
  requirePermission("venue", "view"),
  describeRoute({ ... }),
  async (c) => { /* ... */ });

venueRoutes.post("/venues",
  requirePermission("venue", "create"),
  describeRoute({ ... }),
  async (c) => { /* ... */ });

venueRoutes.put("/venues/:id",
  requirePermission("venue", "update"),
  describeRoute({ ... }),
  async (c) => { /* ... */ });

venueRoutes.delete("/venues/:id",
  requirePermission("venue", "delete"),
  describeRoute({ ... }),
  async (c) => { /* ... */ });
```

For files where every route is admin-only with identical permission (`settings`, `board`, `notification`, etc), apply at the group level:

```ts
import { requirePermission } from "../../middleware/rbac";

const boardRoutes = new Hono<AppEnv>();
boardRoutes.use("*", requirePermission("settings", "update"));

boardRoutes.get("/boards", /* ... */);
// ... other routes need no extra guard
```

- [ ] **Step 2: Migrate `referee/games.routes.ts`**

Current file gates all routes with `requireReferee` and looks up `refereeId` from the DB inside handlers. Replace:

```ts
// OLD
import { requireReferee } from "../../middleware/auth";
refereeGamesRoutes.use("/*", requireReferee);

refereeGamesRoutes.get("/games", async (c) => {
  const userId = c.get("session").userId;
  // ... fetch user from DB ...
  const refereeId = user.refereeId;
  // ...
});
```

With:
```ts
// NEW
import { requireRefereeSelf } from "../../middleware/rbac";
refereeGamesRoutes.use("/*", requireRefereeSelf);

refereeGamesRoutes.get("/games", async (c) => {
  const refereeId = c.get("refereeId"); // typed number, validated by middleware
  // ... use refereeId directly, no DB lookup needed for this gate ...
});
```

Update the associated test `referee/games.routes.test.ts` — replace the `requireReferee` mock with `requireRefereeSelf`:

```ts
// OLD
vi.mock("../../middleware/auth", () => ({
  requireReferee: vi.fn(async (c, next) => {
    c.set("user", { id: "u1", role: "referee", refereeId: 42 });
    c.set("session", { id: "s1" });
    await next();
  }),
}));

// NEW
vi.mock("../../middleware/rbac", () => ({
  requireRefereeSelf: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "u1", refereeId: 42 });
    c.set("session", { id: "s1" });
    c.set("refereeId", 42);
    await next();
  }),
}));
```

Re-read the test file first; the mock shape must match (look for any spies that assert middleware-call behavior). Adjust only the mock path + call signature.

- [ ] **Step 3: Migrate `referee/assignment.routes.ts`**

Read the file. Routes that operate on "my" claim/release should use `requireRefereeSelf` + an inline ownership check. Admin-override routes (that let refereeAdmin reassign on behalf of someone else) use `requirePermission("assignment", "update")`. If the file mixes both concerns into one route, split them into two routes OR keep one route and inside it branch on whether the caller is operating on self vs other.

Minimal, safe migration: route operates on caller's own assignment → `requireRefereeSelf` + ownership check:

```ts
import { requireRefereeSelf } from "../../middleware/rbac";

assignmentRoutes.post("/assignment/claim/:id",
  requireRefereeSelf,
  async (c) => {
    const refereeId = c.get("refereeId");
    const id = Number(c.req.param("id"));
    const a = await db.query.assignments.findFirst({
      where: eq(assignments.id, id),
    });
    if (!a) return c.json({ error: "Not found" }, 404);
    if (a.refereeId !== refereeId && a.refereeId !== null) {
      return c.json({ error: "Not yours", code: "FORBIDDEN" }, 403);
    }
    // ... perform claim
  });
```

Update the associated test mock analogously to Step 2.

- [ ] **Step 4: Migrate each admin route file**

For every file in the list above, follow the pattern from Step 1. One file at a time. For each file:

1. Open the file.
2. Add the import: `import { requirePermission } from "../../middleware/rbac";` (note relative depth — `admin/...` routes are two levels deep from middleware).
3. Identify whether all routes share one permission (use group-level `.use("*", ...)`) or they differ by verb (use per-route).
4. Insert the permission middleware.
5. Remove any lingering `import { requireAdmin } from "../../middleware/auth";` lines.
6. If the file had explicit `requireAdmin` on individual routes (e.g. `settings.routes.ts`), replace those with the appropriate `requirePermission(...)`.
7. Run that file's test: `pnpm --filter @dragons/api test src/routes/admin/<file>.test.ts`.
8. If tests fail because the test mocks `requireAdmin`, update the mock to `requirePermission` (mocks typically return a no-op middleware — same mock shape works, just different export name).

Example mock update pattern for any admin route test:

```ts
// OLD
vi.mock("../../middleware/auth", () => ({
  requireAdmin: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// NEW
vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn(() =>
    async (_c: unknown, next: () => Promise<void>) => next(),
  ),
}));
```

- [ ] **Step 5: Run the full API test suite**

```bash
pnpm --filter @dragons/api test
```
Expected: all tests pass except `middleware/auth.test.ts` (deleted in Task 7). If any test fails for a reason other than the auth mock path, fix it before continuing.

- [ ] **Step 6: Run typecheck**

```bash
pnpm --filter @dragons/api typecheck
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/admin/ apps/api/src/routes/referee/
git commit -m "refactor(api): replace requireAdmin/requireReferee with requirePermission and requireRefereeSelf across routes"
```

---

## Task 7: Delete the old auth middleware

**Files:**
- Delete: `apps/api/src/middleware/auth.ts`
- Delete: `apps/api/src/middleware/auth.test.ts`

**Depends on:** Task 6.

- [ ] **Step 1: Confirm no remaining references**

```bash
grep -rn "requireAdmin\|requireReferee" apps/api/src --include="*.ts"
```
Expected: NO matches. If any file still references these, go back to Task 6 and migrate it.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/api/src/middleware/auth.ts apps/api/src/middleware/auth.test.ts
```

- [ ] **Step 3: Run full API suite + typecheck**

```bash
pnpm --filter @dragons/api typecheck
pnpm --filter @dragons/api test
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(api): remove legacy requireAdmin/requireReferee middleware"
```

---

## Task 8: Create the DB migration for role value cleanup

**Files:**
- Create: `packages/db/drizzle/0009_rbac_role_cleanup.sql` (next sequential number; verify by listing `packages/db/drizzle/` and using the next index)

**Depends on:** Task 3 (config change where `defaultRole` was dropped).

- [ ] **Step 1: Confirm the next migration number**

```bash
ls packages/db/drizzle/ | grep -E '^[0-9]{4}_' | sort | tail -1
```
If the latest is `0008_icy_thunderbolts.sql`, the new file should be `0009_rbac_role_cleanup.sql`.

- [ ] **Step 2: Write the migration**

Create `packages/db/drizzle/0009_rbac_role_cleanup.sql`:

```sql
-- RBAC role cleanup: null out legacy "user" and "referee" role values.
-- The "user" role is dropped (default state is now role = null).
-- Self-service for referees derives from user.referee_id, not a role value.
-- "admin" rows are left unchanged.

UPDATE "user" SET role = NULL WHERE role = 'user';
UPDATE "user" SET role = NULL WHERE role = 'referee';
```

- [ ] **Step 3: Add the migration to the drizzle meta journal**

Drizzle tracks migrations in `packages/db/drizzle/meta/_journal.json`. Inspect that file, determine the current highest `idx`, and append a new entry using the same pattern as previous entries (timestamp, tag = `0009_rbac_role_cleanup`, breakpoints = true).

Verify by running:

```bash
pnpm --filter @dragons/db db:generate
```

This may either re-generate the journal (if drizzle infers from the SQL file) or require a manual journal edit. If `db:generate` produces no changes and the journal already reflects the new migration, proceed. If it fails, edit `meta/_journal.json` manually to append the new entry.

- [ ] **Step 4: Run the migration locally to verify**

```bash
pnpm --filter @dragons/db db:migrate
```
Expected: migration applies cleanly, no errors.

Verify the effect:
```bash
psql "$DATABASE_URL" -c "SELECT DISTINCT role FROM \"user\";"
```
Expected: only NULL or 'admin' should appear (if any admin user exists).

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle/0009_rbac_role_cleanup.sql packages/db/drizzle/meta
git commit -m "chore(db): migration to null out legacy user/referee role values"
```

---

## Task 9: Wire the web auth client to the new access controller

**Files:**
- Modify: `apps/web/src/lib/auth-client.ts`

**Depends on:** Task 1.

- [ ] **Step 1: Update the auth client**

Edit `apps/web/src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac, roles } from "@dragons/shared";

const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const authClient = createAuthClient({
  baseURL,
  plugins: [adminClient({ ac, roles })],
});
```

- [ ] **Step 2: Run web typecheck**

```bash
pnpm --filter @dragons/web typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/auth-client.ts
git commit -m "feat(web): wire rbac access controller into admin client"
```

---

## Task 10: Add web server-side session helper

**Files:**
- Create: `apps/web/src/lib/auth-server.ts`

**Depends on:** Task 3.

- [ ] **Step 1: Create the server helper**

Create `apps/web/src/lib/auth-server.ts`:

```ts
import "server-only";
import { headers } from "next/headers";

export type ServerSessionUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  refereeId: number | null;
};

export type ServerSession = {
  user: ServerSessionUser;
  session: { id: string; expiresAt: string };
};

// Fetches the current session from the API by forwarding the request cookie.
// Returns null for unauthenticated requests or network/auth failures.
export async function getServerSession(): Promise<ServerSession | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;

  try {
    const res = await fetch(`${apiUrl}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== "object" || !("user" in json)) return null;
    return json as ServerSession;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @dragons/web typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/auth-server.ts
git commit -m "feat(web): add server-side session helper that forwards request cookie to API"
```

---

## Task 11: Add server-side guard to the admin layout

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/layout.tsx`

**Depends on:** Tasks 1, 10.

- [ ] **Step 1: Read the existing admin layout**

Look at `apps/web/src/app/[locale]/admin/layout.tsx` first. Preserve any existing structure (sidebar, providers); only add the server-side check at the top.

- [ ] **Step 2: Insert the guard**

Add at the top of the server component (before the existing return):

```tsx
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { parseRoles } from "@dragons/shared";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth/sign-in");
  if (parseRoles(session.user.role).length === 0) redirect("/");

  // ... the existing return body (sidebar, providers, etc.) stays below.
  return (/* existing JSX */);
}
```

Keep whatever existing JSX and imports the layout already has. If the layout is a client component, convert only the outer shell to a server component that performs the check and then renders the existing client-component body as a child.

- [ ] **Step 3: Manual smoke check**

Start the stack:
```bash
pnpm dev
```

In a browser:
1. Not logged in → visit `http://localhost:3000/en/admin` → should redirect to `/en/auth/sign-in`.
2. Log in as admin → visit `/en/admin` → should render.
3. Log in as a user with `role = null` → visit `/en/admin` → should redirect to `/en/`.

Stop the dev server when finished.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/admin/layout.tsx
git commit -m "feat(web): add server-side guard to admin layout"
```

---

## Task 12: Add the `<Can>` JSX gate component

**Files:**
- Create: `apps/web/src/components/rbac/can.tsx`
- Create: `apps/web/src/components/rbac/can.test.tsx` (if the web app has a test runner configured; skip test if not)

**Depends on:** Task 9.

- [ ] **Step 1: Check whether web has a test runner**

```bash
cat apps/web/package.json | grep -E '"test":|vitest|jest'
```

If no test script exists, skip Step 2 and proceed without the test file. Otherwise proceed with the test.

- [ ] **Step 2: Create the component**

Create `apps/web/src/components/rbac/can.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { can, type Resource, type Action } from "@dragons/shared";

export function Can<R extends Resource>({
  resource,
  action,
  children,
  fallback = null,
}: {
  resource: R;
  action: Action<R>;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { data: session } = authClient.useSession();
  if (!session?.user) return <>{fallback}</>;
  return <>{can(session.user, resource, action) ? children : fallback}</>;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @dragons/web typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/rbac
git commit -m "feat(web): add <Can> JSX gate component"
```

---

## Task 13: Refactor the admin sidebar to use permission descriptors

**Files:**
- Modify: `apps/web/src/components/admin/app-sidebar.tsx`

**Depends on:** Task 9.

- [ ] **Step 1: Read the current sidebar**

Read `apps/web/src/components/admin/app-sidebar.tsx` fully. Identify every `roles: [...]` key in the `navGroups` array.

- [ ] **Step 2: Replace `roles:` with `perm:` and update the filter**

Transform the shape. Example — what used to be:

```ts
{
  title: "Referees",
  icon: UsersIcon,
  href: "/admin/referees",
  roles: ["admin", "refereeAdmin"],
}
```

Becomes:

```ts
{
  title: "Referees",
  icon: UsersIcon,
  href: "/admin/referees",
  perm: { resource: "referee", action: "view" } as const,
}
```

Full suggested mapping (apply the relevant subset based on what's actually in the current sidebar — don't invent entries):

| Original `roles:` | New `perm:` |
|---|---|
| `["admin"]` (user management) | `{ resource: "user", action: "list" }` |
| `["admin"]` (sync) | `{ resource: "sync", action: "view" }` |
| `["admin"]` (settings/config) | `{ resource: "settings", action: "view" }` |
| `["admin", "referee"]` (referees) | `{ resource: "referee", action: "view" }` |
| `["admin", "referee"]` (assignments) | `{ resource: "assignment", action: "view" }` |
| `["admin"]` (matches) | `{ resource: "match", action: "view" }` |
| `["admin"]` (teams) | `{ resource: "team", action: "view" }` |
| `["admin"]` (venues) | `{ resource: "venue", action: "view" }` |
| `["admin"]` (bookings) | `{ resource: "booking", action: "view" }` |
| `["admin"]` (standings) | `{ resource: "standing", action: "view" }` |
| (others not in the catalog) | `{ resource: "settings", action: "view" }` |

Update the filter logic. Where the sidebar currently does:

```ts
const userRole = session?.user?.role;
const visibleGroups = navGroups
  .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(userRole)) }))
  .filter((g) => g.items.length > 0);
```

Change it to:

```ts
import { can } from "@dragons/shared";

const user = session?.user;
const visibleGroups = navGroups
  .map((g) => ({
    ...g,
    items: g.items.filter((i) => can(user, i.perm.resource, i.perm.action)),
  }))
  .filter((g) => g.items.length > 0);
```

- [ ] **Step 3: Typecheck + manual smoke test**

```bash
pnpm --filter @dragons/web typecheck
```

Start `pnpm dev` and verify: logged in as admin, all groups visible; logged in as refereeAdmin (set via `setRole`), only referee/assignment groups visible.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/app-sidebar.tsx
git commit -m "refactor(web): sidebar filters nav items by permission instead of role string"
```

---

## Task 14: Refactor user-actions to a multi-role editor

**Files:**
- Modify: `apps/web/src/components/admin/users/user-actions.tsx`
- Modify: `apps/web/src/components/admin/users/user-list-table.tsx`

**Depends on:** Task 9.

- [ ] **Step 1: Read both files**

Understand the current toggle (`user-actions.tsx` line ~59) and the badge rendering (`user-list-table.tsx` around line 64-65). The old code assumes a single role string.

- [ ] **Step 2: Replace the toggle with a multi-role editor**

In `user-actions.tsx`, replace the binary admin/user toggle with a checkbox list. Show all `ROLE_NAMES` with checkboxes; pre-check the user's current roles; on save, call `authClient.admin.setRole({ userId, role: selected.join(",") })`.

Minimal implementation (drop into the existing component's render path; adapt to existing UI kit — likely Radix + shadcn):

```tsx
import { parseRoles, ROLE_NAMES, type RoleName } from "@dragons/shared";

// inside the component
const currentRoles = parseRoles(user.role);
const [selected, setSelected] = useState<RoleName[]>(currentRoles);

const toggle = (r: RoleName) => {
  setSelected((prev) =>
    prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
  );
};

const handleSave = async () => {
  await authClient.admin.setRole({
    userId: user.id,
    role: selected.length === 0 ? "" : selected.join(","),
  });
  // ... refetch / toast / close dialog per existing patterns
};

// render:
<div className="space-y-2">
  {ROLE_NAMES.map((r) => (
    <label key={r} className="flex items-center gap-2">
      <Checkbox
        checked={selected.includes(r)}
        onCheckedChange={() => toggle(r)}
      />
      <span>{r}</span>
    </label>
  ))}
</div>
```

Remove any previous `const newRole = user.role === "admin" ? "user" : "admin"` style logic.

- [ ] **Step 3: Update badge rendering in `user-list-table.tsx`**

Replace the single-role badge with per-role badges. Locate where `user.role` is displayed as a single badge and swap to:

```tsx
import { parseRoles } from "@dragons/shared";

// ...
<div className="flex flex-wrap gap-1">
  {parseRoles(user.role).length === 0 ? (
    <Badge variant="outline">—</Badge>
  ) : (
    parseRoles(user.role).map((r) => (
      <Badge key={r} variant="secondary">{r}</Badge>
    ))
  )}
</div>
```

- [ ] **Step 4: Typecheck and smoke**

```bash
pnpm --filter @dragons/web typecheck
```

Start the app and verify: log in as admin; edit a user's roles; check/uncheck multiple; save; refresh; verify the comma-separated value is stored and that badges render per role.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/users/user-actions.tsx apps/web/src/components/admin/users/user-list-table.tsx
git commit -m "refactor(web): multi-role editor and per-role badges in user management"
```

---

## Task 15: Wire the native auth client to the new access controller

**Files:**
- Modify: `apps/native/src/lib/auth-client.ts`

**Depends on:** Task 1.

- [ ] **Step 1: Update the native auth client**

Read `apps/native/src/lib/auth-client.ts` and add `adminClient({ ac, roles })` to the plugins list. The file already uses `expoClient` — keep it as the first or second plugin; order of plugins does not matter for type purposes.

```ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { ac, roles } from "@dragons/shared";
import { getApiBaseUrl } from "./api-base-url"; // or wherever the baseURL helper lives

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  plugins: [
    adminClient({ ac, roles }),
    expoClient({
      scheme: "dragons",
      storagePrefix: "dragons",
      storage: SecureStore,
    }),
  ],
});
```

Keep the existing imports, any debug options, and the existing base-URL resolution logic intact. Only add `adminClient` to the plugins array and import `ac, roles`.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @dragons/native typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/lib/auth-client.ts
git commit -m "feat(native): wire rbac access controller into admin client"
```

---

## Task 16: Replace native tab gating with shared helpers

**Files:**
- Modify: `apps/native/src/app/(tabs)/_layout.tsx`

**Depends on:** Task 15.

- [ ] **Step 1: Read the current layout**

Look at `apps/native/src/app/(tabs)/_layout.tsx`. Identify the local `hasRefereeAccess(role: string)` helper (currently lines 8–10) and any tab visibility logic that consumes it.

- [ ] **Step 2: Replace with shared helpers**

Remove the local helper. Swap to:

```tsx
import { can, isReferee } from "@dragons/shared";

// inside the component
const { data: session } = authClient.useSession();
const user = session?.user;

const canSeeRefereeTab = Boolean(user) && isReferee(user);
const canSeeManageTab  = Boolean(user) && can(user, "referee", "view");

// ... use canSeeRefereeTab for the referee self-service tab
// ... use canSeeManageTab for any admin-referee tab (if present)
```

Preserve the existing redirect-on-role-loss logic (currently around lines 22–27) — but rewrite its role check to use the shared helpers:

```ts
// OLD
if (currentTab === "referee" && !hasRefereeAccess(user?.role)) { ... }

// NEW
if (currentTab === "referee" && !isReferee(user)) { ... }
```

- [ ] **Step 3: Smoke test on the simulator**

Start the native dev server:
```bash
pnpm --filter @dragons/native dev
```

Manually:
1. Signed out → Referee tab hidden.
2. Signed in as non-referee (no `refereeId`) → Referee tab hidden.
3. Signed in as a referee (`refereeId` set on user) → Referee tab visible.

Stop the dev server.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter @dragons/native typecheck
git add apps/native/src/app/\(tabs\)/_layout.tsx
git commit -m "refactor(native): use shared can()/isReferee() for tab gating"
```

---

## Task 17: Document the access control model in AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Depends on:** all prior tasks complete.

- [ ] **Step 1: Read the existing AGENTS.md**

Look for an existing section on authentication, authorization, or access control. If one exists, replace it. If not, add a new top-level section.

- [ ] **Step 2: Add the Access Control section**

Paste this block into `AGENTS.md` at an appropriate location (after the "Authentication" section if there is one, else at the end of the architecture section):

```markdown
## Access Control (RBAC)

Two concepts, two APIs:

- **Role permissions** — for acting on other users' or global data. Checked via `can(user, resource, action)` from `@dragons/shared`.
- **Referee self-service** — for acting on the caller's own referee data. Checked via `isReferee(user)` from `@dragons/shared` (an identity check, not a role).

### Source of truth

All resources, actions, and role → permission mappings live in `packages/shared/src/rbac.ts`. Never hardcode role name strings anywhere else.

### Backend

`apps/api/src/middleware/rbac.ts` exports:

- `requireAuth` — 401 on no session; populates `c.get("user")` and `c.get("session")`.
- `requirePermission(resource, action)` — route-group gate; 403 on insufficient permission.
- `assertPermission(c, resource, action)` — inline check inside a handler for row-level logic.
- `requireRefereeSelf` — gates self-service routes; populates `c.get("refereeId")`.

### Frontend (web & native)

- `can(user, resource, action)` — pure synchronous check for UI rendering.
- `isReferee(user)` — pure synchronous check for self-service UI.
- `<Can resource action>` — JSX wrapper (web only).
- `parseRoles(user.role)` — normalize better-auth's comma-separated role string to `RoleName[]`.

### Role catalog (v1)

| Role | Grants |
|---|---|
| `admin` | Full access to every resource and action. |
| `refereeAdmin` | Manage referees, assignments; view matches; trigger referee sync. |
| `venueManager` | Manage venues and bookings; view matches. |
| `teamManager` | Manage teams; view matches, standings, referees. |
| *(no role, refereeId set)* | Referee self-service (own assignments via `isReferee`). |

A user may have multiple roles. Roles are stored in the `user.role` column as a comma-separated string (better-auth native format).

### Adding a role or resource

1. Add to `statement` in `packages/shared/src/rbac.ts`.
2. Add/extend role(s) with the new permission(s) in the same file.
3. If a new role, also add to `ROLE_NAMES`.
4. Apply `requirePermission("newResource", "newAction")` on the relevant API routes.
5. Gate UI with `<Can>` or `can()`.
6. Update this section.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document access control model"
```

---

## Task 18: Full local CI sweep

**Depends on:** all prior tasks.

- [ ] **Step 1: Run the full CI locally**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @dragons/api coverage
pnpm check:ai-slop
```

Every command must exit 0.

If coverage drops below threshold in `@dragons/api`, add the missing tests. The most likely gap is route tests that previously had their mocks satisfied by the old middleware path — rerun the targeted test file to identify which assertions drifted.

- [ ] **Step 2: Start the full stack locally and smoke test**

```bash
pnpm dev
```

Exercise:
1. Sign in as admin → hit `/admin`, change a user's roles, verify badges.
2. Sign in as a user with `role = "refereeAdmin"` → hit `/admin`, verify only referee-related nav visible; try to hit `/admin/users` directly — server should 403 (or the layout redirect should not apply because the user has a role, but the per-route `requirePermission("user", "list")` should reject on the API side).
3. Sign in as a user with `refereeId` set but no role → verify `/admin` redirects them home; open native app → Referee tab visible; can see own assignments.
4. Sign in as a user with `role = null` and no `refereeId` → `/admin` redirects home; native app shows no Referee tab.

- [ ] **Step 3: Commit any last fixes**

If any issue surfaces during the smoke test, fix it with a small commit.

- [ ] **Step 4: Open PR**

The branch is ready. Push and open a PR with a summary that lists:
- Introduction of `@dragons/shared/rbac`.
- API middleware replacement.
- Web server-side guard + sidebar refactor + multi-role editor.
- Native tab-gating refactor.
- DB migration for legacy role values.
- Documentation update.

---

## Post-implementation follow-ups (out of scope for this plan)

- Dedicated resources for board, notification, channel-config, event, social, watch-rule, task, league (currently all gated by `settings:update` as an admin-only placeholder).
- Lint rule forbidding direct string comparison on `user.role`.
- Lint rule flagging Hono route handlers without a recognized guard middleware.
- Audit log of denied permission checks.
- Runtime-editable role UI (if ever needed).
