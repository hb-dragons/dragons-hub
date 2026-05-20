# Native role-aware shell — design

- **Date:** 2026-05-20
- **Status:** Approved (design); pending implementation plan
- **Scope:** `apps/native` shell, navigation, login flow; shared capability catalog in `packages/shared`; web sidebar refactor for lockstep.

## Problem

The native app (`apps/native`, Expo + expo-router) is built as a public fan app with staff functionality bolted on. The goal is to make it the primary tool for managing club operations across many roles and positions. The current foundation does not support that:

1. **The bottom tab bar is fixed at five slots and public-first.** Home / Schedule / Standings / Teams, plus a fifth `referee` tab that appears conditionally. There is no room to express role-based depth.
2. **The conditional referee tab is a hack.** `(tabs)/_layout.tsx` shows the tab only when `canViewOpenGames(user)` and uses a `useEffect` that calls `router.replace("/")` if a user lands on `referee` without permission. This does not generalize to N roles.
3. **Staff tools have nowhere to live.** The only management surface in native is Boards (kanban), reachable as a single link buried inside Profile.
4. **Login is incidental.** Email/password sign-in is a `fullScreenModal` you reach by tapping the header avatar → Profile → Sign in. After login the app does not reshape around the user's role.
5. **Profile is overloaded** — settings + role badges + the sole admin entrance.

What is already good and stays: the RBAC engine. `packages/shared/src/rbac.ts` defines roles (`admin`, `refereeAdmin`, `venueManager`, `teamManager`) plus a `referee` flag (`refereeId`), with `can(user, resource, action)`, `hasRole()`, `isReferee()`, and `canViewOpenGames()`. It runs unchanged in native. The rework is the shell, navigation, and login flow — not the permission model.

The web app already has the target information architecture: a role-gated sidebar (`apps/web/src/components/admin/app-sidebar.tsx`) grouped into League / Operations / Social / Notifications / System, plus a Referee hub. That feature set is what native should grow toward.

## Decisions (from brainstorming)

- **Audiences in scope:** the existing staff roles (admin, referee coordinator, venue manager, team manager, self-service referee), plus two new audiences — **coaches & team staff** and **members (players & parents)**. The new audiences are largely greenfield on the backend.
- **Navigation model:** a single **role-aware unified shell**. One app; signed-out shows fan tabs; signed-in surfaces the user's work in place. No hard mode switch.
- **Shell shape:** **stable fan tabs + one adaptive "Today" tab + a "Tools" hub**, all driven by a shared capability registry.
- **Functional scope:** a **mobile-first subset** of the web admin — prioritize tasks that matter on a phone (claim/assign referee slots, today's bookings, approvals, boards, notifications, quick lookups); leave config-heavy work (sync, channel config, social-post authoring) on web.

## Goals

- A navigation foundation that scales to many roles and positions without per-role branching in the shell.
- One source of truth for "what can this user reach," shared by web and native.
- A deliberate login flow that reshapes the app around the signed-in user.
- Seams for the new `coach` role and `member` audience that exist now, so features can land later without re-architecting.

## Non-goals

- Backend identity linkage for members (user ↔ member/player) and coach team-scoping. Separate specs.
- Member-facing features (RSVP/attendance, my-team). Separate specs.
- Porting every web admin tool to native. Per-feature, in later rounds.
- Changing the auth or permission model.

## Architecture

### Identity model & predicates

The shell never branches on "is this an admin screen." It asks pure predicates over the user:

| Layer | Predicate | Source |
|---|---|---|
| Anonymous fan | `!session` | no session |
| Member (player/parent) | `isMember(user)` | **new seam**, mirrors `isReferee` / `refereeId`; backed by a `memberId` link later |
| Staff | `can(user, resource, action)` / `hasRole()` | existing RBAC |

`isMember(user)` is added to `rbac.ts` next to `isReferee()`. Until the backend linkage exists it returns `false`, so member surfaces stay dark without blocking the foundation.

### Capability registry (`packages/shared/src/nav-surfaces.ts`)

A surface catalog lives in shared — **data and predicates only, no JSX or icons** (web uses lucide, native uses SF Symbols, so rendering stays per-platform). Each entry:

```ts
type Surface = {
  id: string;                 // "referees", "venues", "boards", ...
  visible: (user: GateUser) => boolean; // built from can()/isReferee()/isMember()
  group: "league" | "operations" | "notifications" | "system" | "member";
  priority: number;           // drives tab-vs-hub selection and ordering
  tabCandidate: boolean;      // may this ever be a bottom tab?
  webOnly?: boolean;          // Tools hub deep-links to web instead of a native screen
};
```

`visible` is a function rather than a `{ resource, action }` pair so composite predicates work (for example the referee surface uses `canViewOpenGames`, which is `isReferee(user) || can(user, "assignment", "view")`).

Two pure functions, both unit-tested in shared:

- `selectTabs(user): Surface[]` — the ≤5 bottom tabs for this user, deterministic by `priority` among `tabCandidate` surfaces the user can see.
- `visibleSurfaces(user): Surface[]` — the gated list the Tools hub renders, grouped.

### Web refactor (lockstep)

`apps/web/src/components/admin/app-sidebar.tsx` drops its local `navGroups` constant and consumes `visibleSurfaces(user)`, keeping only its `id → { icon, href, label }` rendering map. After this, web and native cannot drift: a new role or feature is one catalog entry that lights up in both clients.

### Navigation shell

`apps/native/src/app/(tabs)/_layout.tsx` becomes data-driven: it maps `selectTabs(user)` to `NativeTabs.Trigger`s instead of hard-coding triggers, and the `useEffect` redirect hack is deleted (an out-of-permission tab is simply never rendered).

- **Anonymous:** Home · Schedule · Standings · Teams (current behavior, unchanged).
- **Signed-in:** Home · Schedule · **Today** · Teams · **Tools**. The tab budget is five; inserting Today and Tools demotes the two lowest-priority fan tabs. Standings moves into the League area / Teams reach rather than holding a top-level tab for signed-in users. Placement is registry priority, so it is tunable, not hard-coded. (Confirmed: dropping Standings from the signed-in tab bar is acceptable.)

**Today (`(tabs)/today.tsx`, new)** — the signed-in landing. An aggregated action feed, not a launcher. Providers contribute items gated by the same predicates; Today renders their union ordered by urgency. Multi-role users are handled by aggregation rather than picking a primary role.

**Tools (`(tabs)/tools.tsx`, new)** — the gated hub. Renders `visibleSurfaces(user)` grouped (League / Operations / Notifications / System / Member). Each row routes to its native destination. Rule: **only render surfaces that have a native destination this phase** — no "coming soon" clutter. A `webOnly` surface deep-links to the web admin rather than reimplementing a config-heavy screen on a phone. Boards moves here out of Profile; venue / booking / referee-admin rows land here as they are built.

**Profile (`profile.tsx`)** slims to identity + settings (theme, language, biometric lock, sign-out). It stops being the admin entrance.

### Login flow

- **Anonymous-first preserved** — no gate; fans use the app forever without an account.
- **Sign-in is a deliberate, deep-linkable entry** (`/(auth)/sign-in`), reachable from the header avatar (fan state reads "Sign in") and contextually from any gated action ("Sign in to claim this slot"). It can keep its modal presentation but is no longer reachable only via Profile.
- **Post-auth reshape and landing.** A session change already re-runs `selectTabs` through `authClient.useSession()`; after sign-in the app routes to **Today**, not fan Home. Sign-out returns to the fan shell and Home.
- **Accounts stay admin-created** (no signup, `disableSignUp` at the API). Add a quiet "No account? Ask your club admin" line on the sign-in screen.
- **Forgot-password** is wired at the API (`/reset-password` is rate-limited in `apps/api/src/config/auth.ts`), so better-auth's reset flow exists. Surfacing it in native is a one-screen optional add, included as a flagged extra.
- **Biometric lock** behavior is unchanged.

### Today providers

Provider contract (`apps/native/src/lib/today/`):

```ts
type ActionItem = { title: string; subtitle?: string; urgency: number; route: string; icon: string };
type TodayProvider = {
  id: string;
  visible: (user: GateUser) => boolean;
  useItems: () => ActionItem[];   // SWR-backed hook
  priority: number;
};
```

Today renders the union of visible providers' items, ordered by urgency then priority, with an "all caught up" empty state plus shortcuts.

- **Foundation providers (backend ready):**
  - referee — open slots + next assignment, via `refereeApi` (`refereeEndpoints`).
  - club — next game / recent results, via `publicApi.getHomeDashboard`.
- **Small-add provider:** boards "assigned to me" — assignee mutations exist in `apps/native/src/hooks/board/`, but the read query does not; needs one new endpoint. Deferred to a follow-up.
- **Deferred providers (greenfield backend):** member (my team / RSVP), coach (roster / team ops), venue / booking confirmations.

### New audiences as seams

- **`coach` role** is added to `rbac.ts`: `ROLE_NAMES`, the `roles` map, and a minimal role grant (`team: ["view"]`). Team-scoping (which teams a coach manages) is row-level and deferred.
- **`isMember(user)`** predicate is added to `rbac.ts`. Backend linkage (`user.memberId` or a membership join) is deferred.

Both can return `false` / empty until backend work lands. The shell is ready for them without that work.

## Build-now vs. defer

**Build now (the foundation):**

- `packages/shared/src/nav-surfaces.ts` — catalog, `selectTabs`, `visibleSurfaces`, plus `isMember` and `coach` added to `rbac.ts`.
- Native: data-driven `(tabs)/_layout.tsx`; new `today.tsx` + provider framework + the two ready providers; new `tools.tsx` hub; Boards moved into Tools; Profile slimmed.
- Login: deep-linkable sign-in, post-login landing on Today, contextual sign-in affordances.
- Web: `app-sidebar.tsx` refactored onto the shared catalog.
- Tests: pure-function tests for `selectTabs` / `visibleSurfaces` / predicates across role combinations; component tests for shell and Today states.

**Defer (separate specs / feature rounds):**

- Backend identity linkage (user ↔ member, coach ↔ team scoping) + API gates.
- Member features (RSVP / attendance, my-team).
- Boards "assigned-to-me" query and Today provider.
- Porting each web admin tool to native (venues, bookings, referee admin, matches, notifications config).

## File plan

```
packages/shared/src/
  nav-surfaces.ts        NEW   catalog + selectTabs + visibleSurfaces + isMember
  nav-surfaces.test.ts   NEW
  rbac.ts                EDIT  add `coach` role; add isMember predicate
apps/native/src/
  app/(tabs)/_layout.tsx EDIT  data-driven from selectTabs; remove redirect hack
  app/(tabs)/today.tsx   NEW
  app/(tabs)/tools.tsx   NEW
  app/(auth)/sign-in.tsx EDIT  deep-linkable + post-login landing
  app/profile.tsx        EDIT  slim to identity + settings; drop admin link
  lib/today/             NEW   provider registry + ready providers
  components/today/      NEW   action-item / section components
apps/web/src/
  components/admin/app-sidebar.tsx  EDIT  consume visibleSurfaces; keep icon/href map
```

## Testing

- **Pure functions (`packages/shared`):** `selectTabs(user)` and `visibleSurfaces(user)` across role combinations — anonymous, member, referee, venue manager, team manager, coach, multi-role, admin. Deterministic snapshots of tab order and grouped surface lists. `isMember` / `coach` predicate behavior.
- **Native components:** `(tabs)/_layout.tsx` renders the expected triggers per role; Today aggregates provider items and shows the empty state when none are actionable; Tools renders only surfaces with a destination.
- **Web:** `app-sidebar.tsx` renders the same gated set the catalog produces.
- Coverage thresholds in `apps/api/vitest.config.ts` (90% branches, 95% functions/lines/statements) apply to shared logic touched here.

## Risks & open questions

- **Tab budget.** Five native tabs is the practical ceiling. The catalog's `priority` must keep the signed-in set sensible for every role combination; the `selectTabs` tests are the guard.
- **`webOnly` deep-linking** assumes the web admin is reachable and authenticated from the device. Needs a decision in planning on how the native session hands off (or whether `webOnly` surfaces are simply hidden in v1).
- **Today provider performance.** Each provider is an SWR hook; many active providers on one screen could fan out requests. Plan should batch or lazy-load below the fold.
- **Member predicate default.** With `isMember` returning `false` until backend linkage exists, a signed-in member with no staff role sees only Today (club provider) + fan tabs. Confirm that is an acceptable interim state.
