# Referees: superadmin authorization fix + UI conformance pass

Date: 2026-06-12
Branch: `fix/referees-superadmin-and-ui-conformance`

## Problem

Two issues on `/admin/referees`:

1. A **superadmin** loading the page gets `{"error":"Forbidden","code":"FORBIDDEN"}` when the
   referee games are fetched.
2. The referee hub UI does not match the rest of the admin system: wrong page-header
   pattern, non-standard spacing, heavy 1px borders (against the design system's No-Line
   rule), custom KPI cards, raw color tokens, and name cells that can overflow/wrap badly.

## Part A — Authorization bug (root cause)

### Diagnosis

- `GET /referee/games` is gated by
  `requireRefereeSelfOrAdminRole(["admin", "refereeAdmin"])` in
  `apps/api/src/routes/referee/games.routes.ts:23`.
- That middleware (`apps/api/src/middleware/rbac.ts:96`) decides admin access with
  `roleNames.some((n) => hasRole(user, n))`.
- `hasRole` (`packages/shared/src/rbac.ts:117`) is an **exact** role-name membership test
  over `parseRoles(user.role)`.
- A superadmin's role string is `"superadmin"`, which is not in `["admin", "refereeAdmin"]`,
  and a superadmin has no `refereeId` (so `isReferee` is false) → 403.

The domain treats superadmin as a strict superset of admin (identical permission grants in
`rbac.ts`; `adminRoles: ["admin","superadmin"]` in `config/auth.ts`), but the role-**name**
gates never express that implication. This is **systemic**: the same exact-match means
superadmin also fails every `requireAnyRole("admin")` gate —
`apps/api/src/routes/admin/broadcast.routes.ts` (×5),
`apps/api/src/routes/admin/scoreboard.routes.ts` (×2),
`apps/api/src/routes/admin/user.routes.ts`, and `/openapi.json` + `/docs` in
`apps/api/src/app.ts`. The referee page is just where it was first hit.

### Fix

Express "superadmin satisfies an admin requirement" **once**, centrally.

1. Add to `packages/shared/src/rbac.ts`:

   ```ts
   // superadmin is a strict superset of admin: any gate that admits `admin` must
   // also admit `superadmin`. A `superadmin`-named gate still admits superadmin only.
   export function satisfiesRole(
     user: { role?: string | null } | null | undefined,
     role: RoleName,
   ): boolean {
     if (hasRole(user, role)) return true;
     return role === "admin" && hasRole(user, "superadmin");
   }
   ```

   Export it from `packages/shared/src/index.ts`.

2. In `apps/api/src/middleware/rbac.ts`, `requireAnyRole` and
   `requireRefereeSelfOrAdminRole` use `satisfiesRole` instead of `hasRole`.

No per-route role list changes. The queue gate `requireAnyRole("superadmin")` keeps admitting
superadmin only (admin → `satisfiesRole(user, "superadmin")` is false). Update the explanatory
comment above the `games.routes.ts` gate to note that superadmin counts as admin (wide scope).

### Behavior matrix (after fix)

| User role     | gate `["admin","refereeAdmin"]` | gate `requireAnyRole("admin")` | gate `requireAnyRole("superadmin")` |
| ------------- | ------------------------------- | ------------------------------ | ----------------------------------- |
| admin         | pass                            | pass                           | deny                                |
| superadmin    | **pass** (was deny)             | **pass** (was deny)            | pass                                |
| refereeAdmin  | pass                            | deny                           | deny                                |
| referee only  | pass (self scope)               | deny                           | deny                                |

### Tests (TDD, red first)

- `packages/shared/src/rbac.test.ts`: `satisfiesRole` — superadmin satisfies `"admin"`;
  admin does **not** satisfy `"superadmin"`; superadmin satisfies `"superadmin"`;
  refereeAdmin/other roles unaffected; null user → false.
- `apps/api/src/middleware/rbac.test.ts`: a superadmin session passes a
  `requireRefereeSelfOrAdminRole(["admin", ...])` gate and a `requireAnyRole("admin")` gate;
  still denied on `requireAnyRole("superadmin")` for an admin session. (The existing
  `games.routes.test.ts` mocks the gate, so the regression must be covered at the middleware
  layer.)

## Part B — UI conformance pass

Goal: the referee hub matches `packages/ui/DESIGN-SYSTEM.md` and the other admin pages
(`settings`, `teams`, `sync`). **Scope guardrail:** styling/layout only — the information
architecture (two top-level tabs: open-slots / referees; master-detail panels) and all data
flow stay as-is. Selected-row treatment **stays the current strong fill**
(`bg-primary text-primary-foreground`).

### Changes per file

1. **`referee-hub.tsx`** — top wrapper `space-y-2` → `space-y-6`.

2. **`hub-header.tsx`** — replace the custom `border-b pb-4 mb-4` container and
   `h1.text-2xl.font-semibold` with the shared `PageHeader` (`title` + `subtitle` from i18n).
   The top-level open-slots/referees `Tabs` render in a row beneath the header (no `border-b`;
   spacing separates). Add a `refereeHub.subtitle` i18n key.

3. **No-Line rule** — remove `border` / `border-r` / `border-b` used for content sectioning in
   `referees-tab.tsx`, `open-slots-tab.tsx`, `referee-list.tsx`, `referee-detail.tsx`,
   `slots-filter-sidebar.tsx`, `slot-card.tsx`. Replace with tonal surfaces:
   - Outer master-detail panel: `bg-card rounded-md overflow-hidden` (no border).
   - List / filter columns: `bg-surface-low`. Detail column: `bg-card`.
   - In-panel section headers (scope / KPI / search zones, detail header): separated by
     spacing/tonal zones, not `border-b`.

4. **List rows** (`referee-list.tsx`, and `open-games-list.tsx` rows) — remove per-row
   `border-b`; hover `hover:bg-surface-high`. Selected stays strong fill. Name cell gets
   `min-w-0` + `truncate` so long names don't overflow/wrap (the list grid column must allow
   shrink). License sub-line stays `text-xs`.

5. **Typography** — `referee-detail.tsx` `h2.text-xl.font-semibold` →
   `font-display ... font-bold`; the mini section labels
   (`text-xs uppercase tracking-wide text-muted-foreground`) gain `font-display`; KPI value
   uses `font-display`.

6. **KPIs (`referee-list.tsx`)** — keep the compact 2-up layout (StatCard's `text-3xl` value is
   too large for the ~320px column), but conform: `border p-2` → `bg-surface-low rounded-md p-2`,
   value `font-display`.

7. **`slot-card.tsx`** — `border rounded-md` → `bg-surface-low rounded-md`; raw
   `text-amber-700 dark:text-amber-400` → `text-heat` (design urgency token).

8. **`slots-filter-sidebar.tsx`** — `aside ... border-r bg-muted/30` → `bg-surface-low`; native
   date inputs `border rounded` → `border-border/20 rounded-md`.

### Tests

Component tests exist for `referee-list`, `referee-detail`, `open-games-list`,
`slot-card`, `slots-filter-sidebar`, `candidate-picker`. Keep them green; update only the
assertions that query markup which actually changes (e.g. class-based queries). No behavioral
test changes — this is a visual conformance pass. Coverage thresholds for `web` must not drop.

## Out of scope

- Information-architecture / flow redesign of the hub.
- Replacing native radio inputs with a new component.
- Touching the other admin routes' code beyond the shared middleware change (they are fixed
  transitively by Part A; no markup changes there).
