# RBAC Foundation Design

**Date:** 2026-04-21
**Scope:** Replace the current single-role string system with a fine-grained, multi-role, code-defined access-control layer built on better-auth's admin plugin access controller. One source of truth for roles and permissions, consumed identically by the API, web, and native apps. Foundation only — runtime role editing, ABAC, audit logging, and organizations are explicit non-goals.

## Goals

- One place (`packages/shared/src/rbac.ts`) defines resources, actions, and roles.
- Every backend mutation is gated by a permission check that traces back to that one file.
- Every web and native UI element that depends on role is gated by a pure, synchronous helper from the same file — no loading flashes, no network roundtrips for render decisions.
- Multi-role users supported natively (a person can be `refereeAdmin` and `venueManager` simultaneously).
- Being a referee (identity) is decoupled from managing referees (role): identity derives from `user.refereeId`, management comes from the `refereeAdmin` role.
- The current string-literal role soup is fully removed. No hardcoded `"admin"` / `"referee"` / `"user"` checks survive.

## Non-goals (v1)

- Runtime role editing (no admin UI to create new roles or edit permissions).
- Per-row / field-level ABAC engine (ownership checks use inline helpers, not a policy engine).
- Organization / tenancy model.
- Permission-check audit log.
- Temporary role delegation / scheduled grants.
- Removing the legacy `role` column (stays — we re-use it with new semantics).

## Current state (reference)

- better-auth v1.6.5 with admin plugin, Drizzle adapter, cookie sessions.
- `user.role` is a single nullable text column. Values in use: `"admin"`, `"user"`, `"referee"`, `null`.
- Middleware helpers `requireAdmin` and `requireReferee` in `apps/api/src/middleware/auth.ts` do inline string comparisons.
- Role gating on web is client-side only (`AppSidebar` filters menu items). `/admin/*` pages have no server-side guard — direct URL access bypasses the sidebar filter.
- Native duplicates a local `hasRefereeAccess()` helper in `apps/native/src/app/(tabs)/_layout.tsx`.
- Referee role is entangled with `user.refereeId`: granting the role is a 2-step operation (setRole + link).
- No shared constants for role names; string literals appear in ~15+ locations across the three apps.

## Decisions (from brainstorm)

1. **Permission shape:** fine-grained resource × action (better-auth native statement format).
2. **Assignment model:** multi-role per user (comma-separated in `user.role`, better-auth native format).
3. **Role definition:** code-defined in a shared TypeScript package; no DB table for roles.
4. **Referee identity:** decoupled from roles. `user.refereeId != null` = "is a referee", granting self-service. No `referee` role exists.
5. **Role catalog v1:** `admin`, `refereeAdmin`, `venueManager`, `teamManager`. The old `user` role is dropped; default state is `role = null`.
6. **Backend enforcement:** hybrid — middleware factory (`requirePermission`) for route-group gates, inline helper (`assertPermission`) for row-level / ownership checks.
7. **Web enforcement:** server-component guard in `app/[locale]/admin/layout.tsx`. Client-side sidebar filtering remains for UX, but the layout check is authoritative.
8. **Client permission resolution:** session carries role names; shared `can()` helper derives permissions from the bundled role map. Pure function, synchronous, runs during render so gated UI never flickers into view.
9. **Storage:** keep the existing `role` column in `user` table. No rename, no enum. Better-auth writes it as comma-separated strings for multi-role users.
10. **Migration:** `role = "user"` → `NULL`, `role = "referee"` → `NULL`, `role = "admin"` → unchanged.

## Architecture

### Source of truth

`packages/shared/src/rbac.ts` — the only place where resources, actions, and roles are defined.

```
packages/shared/src/rbac.ts
         │
         ├─► apps/api
         │    ├─ config/auth.ts              (wires rbac into better-auth admin plugin)
         │    ├─ middleware/rbac.ts          (requireAuth, requirePermission, assertPermission, requireRefereeSelf)
         │    └─ routes/**                   (consume the middleware + helpers)
         │
         ├─► apps/web
         │    ├─ lib/auth-client.ts          (adminClient({ ac, roles }))
         │    ├─ app/[locale]/admin/layout.tsx  (server-side guard)
         │    ├─ components/rbac/can.tsx     (JSX gate wrapper)
         │    └─ components/admin/**         (use can() for UI gating; multi-role editor)
         │
         └─► apps/native
              ├─ src/lib/auth-client.ts      (adminClient({ ac, roles }) + expoClient)
              └─ src/app/(tabs)/_layout.tsx  (tab gating via can() + isReferee())
```

### Two concepts, two APIs

- **`can(user, resource, action)`** — role-based, synchronous, pure. Use for anything involving others' or global data ("can edit any referee's assignment", "can view venues tab").
- **`isReferee(user)`** — identity-based, synchronous, pure. Use for self-service ("can view my own assignments", "can accept an assignment assigned to me").

Row-level ownership (e.g. "this assignment belongs to me") is verified inline against `session.user.refereeId` after `isReferee()` gates the route.

### Authority model

- Server-side checks (`auth.api.userHasPermission`) are authoritative for every mutation.
- Client-side `can()` is for UI only. A stale client map can only mis-render UI, not grant unauthorized actions — every mutation re-checks on the server.

## Statement & role catalog

```ts
// packages/shared/src/rbac.ts
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
export type RoleName = typeof ROLE_NAMES[number];
export type Resource = keyof typeof statement;
export type Action<R extends Resource> = typeof statement[R][number];
```

### Helpers

```ts
// Parse comma-separated role string into a validated RoleName[].
// Unknown role names are filtered out silently (logged in API on load).
export function parseRoles(role: string | null | undefined): RoleName[];

// Pure synchronous permission check. Unions permissions across all of user's roles.
export function can<R extends Resource>(
  user: { role?: string | null },
  resource: R,
  action: Action<R>,
): boolean;

// Check multiple permissions at once; all must pass.
export function canAll(
  user: { role?: string | null },
  perms: Partial<{ [R in Resource]: Action<R>[] }>,
): boolean;

// Role presence check.
export function hasRole(user: { role?: string | null }, role: RoleName): boolean;

// Referee self-service gate (identity, not role).
export function isReferee(user: { refereeId?: number | null }): boolean;
```

## Database

### Schema

`packages/db/src/schema/auth.ts` — the `role` column stays. Only the comment and implicit semantics change.

```ts
export const user = pgTable("user", {
  // ...
  // Comma-separated role names (better-auth multi-role format).
  // Null/empty = no elevated roles; self-service still available via refereeId.
  // Valid values: see RoleName in packages/shared/src/rbac.ts.
  role: text("role"),
  refereeId: integer("referee_id").references(() => referees.id, { onDelete: "set null" }),
  // ...
});
```

No enum, no check constraint — better-auth writes comma-separated strings that an enum would reject. Validation lives in the shared `parseRoles()` helper.

### Migration

Single Drizzle migration:

```sql
UPDATE "user" SET role = NULL WHERE role = 'user';
UPDATE "user" SET role = NULL WHERE role = 'referee';
-- "admin" rows unchanged.
```

On API startup, a one-shot scan logs any `user.role` values that don't parse into known `RoleName`s (warn-only, doesn't block boot).

## Backend

### Middleware

`apps/api/src/middleware/rbac.ts` replaces `apps/api/src/middleware/auth.ts`.

```ts
// Ensures an authenticated session; populates c.get("session"), c.get("user").
export const requireAuth: MiddlewareHandler;

// Route-group gate. Throws 403 if user lacks the permission.
export function requirePermission<R extends Resource>(
  resource: R,
  action: Action<R>,
): MiddlewareHandler;

// Inline row-level / dynamic permission check inside a handler.
export async function assertPermission<R extends Resource>(
  c: Context,
  resource: R,
  action: Action<R>,
): Promise<void>;

// Self-service gate for referee routes. Populates c.get("refereeId").
export const requireRefereeSelf: MiddlewareHandler;
```

All four consume `auth.api.userHasPermission` (server-side authoritative) or `isReferee` (identity).

### Route migration pattern

**Before:**
```ts
app.use("*", requireAdmin);
app.patch("/users/:id/referee-link", async (c) => { /* ... */ });
```

**After:**
```ts
app.use("*", requireAuth);
app.patch("/users/:id/referee-link",
  requirePermission("user", "update"),
  async (c) => { /* ... */ });
```

**Before (referee self):**
```ts
app.get("/games", requireReferee, async (c) => {
  const userId = c.get("session").user.id;
  const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!u?.refereeId) throw new HTTPException(403);
  // ...
});
```

**After:**
```ts
app.get("/games", requireRefereeSelf, async (c) => {
  const refereeId = c.get("refereeId");
  // ...
});
```

**Split mixed referee-or-admin routes by intent:**
- Self-service claim (`/referee/assignment/claim/:id`) uses `requireRefereeSelf` + ownership check.
- Admin assignment (`/admin/assignment/:id/assign`) uses `requirePermission("assignment", "update")`.

### Better-auth config

```ts
// apps/api/src/config/auth.ts
import { ac, roles } from "@dragons/shared/rbac";

export const auth = betterAuth({
  // ... existing cookie/session config
  plugins: [
    adminPlugin({
      ac,
      roles,
      defaultRole: undefined,   // was "user"
      adminRoles: ["admin"],
    }),
    expo(),
  ],
});
```

### Global guards in `apps/api/src/app.ts`

Remove the blanket `app.use("/admin/*", requireAdmin)`. Keep `app.use("/admin/*", requireAuth)` as a cheap early-out for unauthenticated requests. Per-route `requirePermission` calls add the permission layer on top. This enables refereeAdmin to hit `/admin/referees` but not `/admin/users`.

## Web

### Auth client

```ts
// apps/web/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac, roles } from "@dragons/shared/rbac";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [adminClient({ ac, roles })],
});
```

### Server-side session helper

The web app (Next.js) and API (Hono) run as separate processes; the web has no local better-auth instance. Server components fetch the session from the API by forwarding the request cookie.

```ts
// apps/web/src/lib/auth-server.ts (NEW)
import "server-only";
import { headers } from "next/headers";

export async function getServerSession(): Promise<ServerSession | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;
  const res = await fetch(`${apiUrl}/api/auth/get-session`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<ServerSession | null>;
}
```

### Server-side admin layout guard

```tsx
// apps/web/src/app/[locale]/admin/layout.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { parseRoles } from "@dragons/shared/rbac";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth/sign-in");
  if (parseRoles(session.user.role).length === 0) redirect("/");
  return <>{children}</>;
}
```

Sub-sections with stricter needs add their own layout check using `can()` against the same server session (e.g. `/admin/users/layout.tsx` requires `can(user, "user", "update")`).

### JSX gate

```tsx
// apps/web/src/components/rbac/can.tsx
"use client";
export function Can<R extends Resource>({
  resource, action, children, fallback = null,
}: {
  resource: R;
  action: Action<R>;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}): JSX.Element;
```

Usage: `<Can resource="venue" action="create"><BookVenueButton /></Can>` or inline `{can(session.user, "venue", "create") && <BookVenueButton />}`.

### Sidebar

Replace `roles: string[]` arrays with permission descriptors:

```ts
{ title: "Venues", href: "/admin/venues", perm: { resource: "venue", action: "view" } }
```

Filter with `can()`. Groups with zero visible items disappear.

### User management

`apps/web/src/components/admin/users/user-actions.tsx` replaces the admin/user toggle with a multi-role checkbox editor. `authClient.admin.setRole({ userId, role: selected.join(",") })`. Role badges in the user list render each role from `parseRoles(user.role)`.

## Native

### Auth client

```ts
// apps/native/src/lib/auth-client.ts
import { ac, roles } from "@dragons/shared/rbac";
import { adminClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  plugins: [
    adminClient({ ac, roles }),
    expoClient({ scheme: "dragons", storagePrefix: "dragons", storage: SecureStore }),
  ],
});
```

### Tab gating

`apps/native/src/app/(tabs)/_layout.tsx` drops the local `hasRefereeAccess()` helper. Tab visibility:

```tsx
const canSeeRefereeTab = user && isReferee(user);
const canSeeManageTab  = user && can(user, "referee", "view");
```

Existing redirect-on-role-loss behavior keeps working, now backed by the shared helpers.

### Screen actions

Same pattern as web: `{can(user, "assignment", "claim") && <ClaimButton />}`, `{isReferee(user) && <AcceptOwnAssignmentButton />}`.

## Testing

Per CLAUDE.md: every changed behavior needs tests, 95% lines/functions / 90% branches.

### `packages/shared/src/rbac.test.ts`
Pure-function layer — exhaustive table-driven tests.
- `parseRoles`: null, empty string, single role, comma-separated, unknown names filtered, whitespace tolerated.
- `can`: every role × every resource × every action.
- `canAll`: passes only when every permission holds.
- `hasRole`: truthy only for exact role-name match.
- `isReferee`: truthy only when `refereeId` is a number.
- Type-level tests (`expect-type`) ensuring invalid resource/action combos fail compilation.

### `apps/api/src/middleware/rbac.test.ts`
- `requireAuth`: 401 on no session; passes with session.
- `requirePermission`: 403 when role lacks permission; passes when granted; multi-role users get the union.
- `assertPermission`: same but callable inline.
- `requireRefereeSelf`: 403 when `refereeId` null; passes when set; populates `c.get("refereeId")`.

### Route integration
- `routes/referee/games.routes.test.ts`: self-service returns only caller's assignments.
- `routes/admin/user.routes.test.ts`: refereeAdmin gets 403; admin succeeds.
- `routes/admin/assignment.routes.test.ts`: refereeAdmin can update any assignment; venueManager gets 403.
- Multi-role: `role = "refereeAdmin,venueManager"` hits both route groups.

### Web
- `components/rbac/can.test.tsx`: children render only when `can()` returns true.
- `app/[locale]/admin/layout.test.tsx`: redirects unauthenticated; redirects logged-in-no-roles; renders for logged-in-with-roles.

### Native
- `app/(tabs)/_layout.test.tsx`: referee tab hidden unless `isReferee`; manage tab hidden without permission.

## Rollout

Single branch, merged atomically. No feature flag — the change is internal and self-contained.

1. `packages/shared/src/rbac.ts` — new module + tests.
2. `packages/shared/src/index.ts` — export `rbac`.
3. `apps/api/src/middleware/rbac.ts` — new middleware + tests.
4. `apps/api/src/config/auth.ts` — wire `ac` + `roles`; drop `defaultRole`.
5. `apps/api/src/routes/**` — migrate every `requireAdmin` / `requireReferee` callsite.
6. `apps/api/src/middleware/auth.ts` — delete.
7. Drizzle migration (`UPDATE user SET role = NULL WHERE role IN ('user','referee')`).
8. `apps/web/src/lib/auth-client.ts` — wire `adminClient({ ac, roles })`.
9. `apps/web/src/lib/auth-server.ts` — new server-side session helper.
10. `apps/web/src/app/[locale]/admin/layout.tsx` — server-side guard using the helper.
11. `apps/web/src/components/rbac/can.tsx` + sidebar refactor + multi-role editor in `user-actions.tsx`.
12. `apps/native/src/lib/auth-client.ts` — same wiring.
13. `apps/native/src/app/(tabs)/_layout.tsx` — replace local helper with shared.
14. `AGENTS.md` — document the access control model (two concepts, how to check, where roles live).
15. Run full CI locally (`pnpm lint && pnpm typecheck && pnpm test && pnpm coverage`) before commit.

## Cleanup / deletions

- `apps/api/src/middleware/auth.ts` (file).
- Local `hasRefereeAccess` in `apps/native/src/app/(tabs)/_layout.tsx`.
- `roles: ["admin", ...]` arrays in `AppSidebar`.
- Binary admin/user toggle logic in `user-actions.tsx`.
- All inline `session.user.role === "admin"` / `"referee"` / `"user"` checks across the monorepo.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Existing admin locked out after migration | Migration only touches `"user"`/`"referee"` rows; `"admin"` unchanged. Post-migration smoke test: log in as admin, hit `/admin`. |
| Self-service route breaks for referee without FK | `requireRefereeSelf` returns 403 with clear message. Admin UI surfaces users with `role = null` AND `refereeId = null` as "no access". |
| Role parsing drift between apps | All three consume `parseRoles()` from shared package. Optional follow-up: eslint rule forbidding local parsing. |
| New route shipped without permission gate | CI lint rule flagging Hono route handlers lacking a recognized guard is a noted follow-up (not v1-blocking). |
| Multi-role UI miscommunicates cumulative permissions | User list badges render every assigned role; role editor is a checkbox list, not a dropdown, so users understand multi-role by construction. |

## Open follow-ups (post-v1)

- Lint rule for unprotected Hono routes.
- Lint rule forbidding direct string comparison on `user.role`.
- Audit log of denied permission checks (helpful for debugging).
- Server-side rate-limit on `/admin/has-permission` endpoint used by clients (if we ever allow dynamic client checks).
- Admin UI to inspect a user's effective permission set (union across their roles) — handy for support.
