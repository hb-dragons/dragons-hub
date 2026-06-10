# Native Role-Aware Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native app's fixed public-first tab bar with a role-aware shell — fan tabs for anonymous users, plus an aggregated "Today" tab and a permission-gated "Tools" hub for signed-in staff — driven by a capability catalog shared with the web sidebar.

**Architecture:** All gating logic lives as pure functions in `packages/shared` (the only place with a test runner besides web): a `SURFACES` catalog + `visibleSurfaces(user)`, `selectTabs(user)`, and `orderTodayItems(items)`, plus a new `coach` role and `isMember` predicate in `rbac.ts`. The native app maps the shared logical outputs to its routes/icons; the web sidebar consumes the same catalog so the two clients cannot drift. Native UI is thin and verified by `tsc` + manual run (native has no unit-test harness, consistent with the current repo).

**Tech Stack:** TypeScript (strict, ES2022), Vitest v4 (shared/web), Expo + expo-router (`NativeTabs`), better-auth (`authClient.useSession`), SWR, `@dragons/shared` RBAC (`can` / `canViewOpenGames` / `isReferee`).

**Spec:** `docs/superpowers/specs/2026-05-20-native-role-aware-shell-design.md`

---

## Design refinements locked in during planning

These concretize hand-waves in the spec; note them before starting:

1. **`selectTabs` is signed-in-aware, not a priority algorithm.** The signed-in tab set is fixed (`home, schedule, today, teams`) plus `tools` *only when the user has at least one visible surface*. Role differences are absorbed inside Today and Tools, so the tab bar stays stable across roles. This is simpler and avoids tab churn.
2. **`selectTabs` returns logical `TabId`s, not native route names** — so it stays platform-neutral and testable in shared. Native maps `TabId → route`.
3. **The `officiating` surface uses the composite predicate `canViewOpenGames`** (referee self-service *or* assignment-admin), which is why `Surface.visible` is a function, not a `{resource, action}` pair. Web keeps its existing top-level "Referees" link gate (`can(referee,"view")`) unchanged; `officiating` is consumed by native only. The web refactor is behavior-preserving.
4. **Tool screens live in the root Stack, not inside `(tabs)`.** Only the Tools *hub* is a tab. The referee games list moves out of `(tabs)/referee.tsx` to a root-stack route `app/officiating.tsx` (matching the existing `admin/`, `game/[id]` pattern). This sidesteps NativeTabs' handling of trigger-less routes.
5. **Native Tools renders the intersection of `visibleSurfaces(user)` and a native route map** (`{ officiating, boards }` for this phase). Surfaces without a native screen are simply not shown — no "coming soon" rows.

---

## File structure

```
packages/shared/src/
  rbac.ts                EDIT  add GateUser type, `coach` role, isMember predicate
  rbac.test.ts           EDIT  cover coach + isMember
  nav-surfaces.ts        NEW   Surface type, SURFACES catalog, visibleSurfaces, group order
  nav-surfaces.test.ts   NEW
  nav-tabs.ts            NEW   TabId, selectTabs
  nav-tabs.test.ts       NEW
  today.ts               NEW   TodayItem type, orderTodayItems
  today.test.ts          NEW
  index.ts               EDIT  export the new modules

apps/native/src/
  i18n/en.json           EDIT  tabs.today/tools, today.*, tools.* keys
  i18n/de.json           EDIT  same keys (German)
  app/officiating.tsx    NEW   referee games list moved out of (tabs)
  app/(tabs)/referee.tsx DELETE
  app/(tabs)/_layout.tsx EDIT  data-driven triggers from selectTabs; remove redirect hack
  app/(tabs)/today.tsx   NEW   aggregated action feed
  app/(tabs)/tools.tsx   NEW   permission-gated hub
  app/_layout.tsx        EDIT  register `officiating` stack screen
  app/profile.tsx        EDIT  remove buried admin link
  app/(auth)/sign-in.tsx EDIT  post-login landing on Today + "ask admin" hint
  lib/nav/tabs.ts        NEW   TabId → native route + icon map
  lib/today/types.ts     NEW   TodayProvider interface
  lib/today/registry.ts  NEW   provider list + useTodayItems hook
  lib/today/providers/referee.ts  NEW
  lib/today/providers/club.ts     NEW
  lib/tools/surfaces.ts  NEW   native surface route/icon/label map

apps/web/src/
  components/admin/app-sidebar.tsx  EDIT  build groups from SURFACES
  components/admin/app-sidebar.test.tsx  NEW or EDIT  gating still correct
```

---

## Task 1: `coach` role, `isMember`, and `GateUser` in rbac

**Files:**
- Modify: `packages/shared/src/rbac.ts`
- Test: `packages/shared/src/rbac.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/shared/src/rbac.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hasRole, can, parseRoles, isMember, ROLE_NAMES } from "./rbac";

describe("coach role", () => {
  const coach = { role: "coach" };
  it("is a known role", () => {
    expect(ROLE_NAMES).toContain("coach");
    expect(parseRoles("coach")).toEqual(["coach"]);
  });
  it("can view teams and matches but not manage venues", () => {
    expect(can(coach, "team", "view")).toBe(true);
    expect(can(coach, "match", "view")).toBe(true);
    expect(can(coach, "venue", "create")).toBe(false);
  });
  it("hasRole detects it", () => {
    expect(hasRole(coach, "coach")).toBe(true);
  });
});

describe("isMember", () => {
  it("is true when memberId is a number", () => {
    expect(isMember({ memberId: 7 })).toBe(true);
  });
  it("is false when memberId is missing or null", () => {
    expect(isMember({ memberId: null })).toBe(false);
    expect(isMember({})).toBe(false);
    expect(isMember(null)).toBe(false);
    expect(isMember(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/shared test -- rbac`
Expected: FAIL — `isMember` is not exported; `"coach"` not in `ROLE_NAMES`.

- [ ] **Step 3: Implement**

In `packages/shared/src/rbac.ts`:

Add the role after `teamManager` (around line 51):

```ts
export const coach = ac.newRole({
  team:     ["view"],
  match:    ["view"],
  standing: ["view"],
  board:    ["view"],
});
```

Update the roles map and names (lines 53-55):

```ts
export const roles = { admin, refereeAdmin, venueManager, teamManager, coach };

export const ROLE_NAMES = ["admin", "refereeAdmin", "venueManager", "teamManager", "coach"] as const;
```

Add a shared gate-user type after the `Action` type (around line 58):

```ts
export type GateUser =
  | { role?: string | null; refereeId?: number | null }
  | null
  | undefined;
```

Add the `isMember` predicate after `isReferee` (around line 112):

```ts
export function isMember<U extends { memberId?: number | null }>(
  user: U | null | undefined,
): user is U & { memberId: number } {
  return typeof user?.memberId === "number";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/shared test -- rbac`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/rbac.ts packages/shared/src/rbac.test.ts
git commit -m "feat(shared): add coach role and isMember predicate"
```

---

## Task 2: capability catalog (`nav-surfaces.ts`)

**Files:**
- Create: `packages/shared/src/nav-surfaces.ts`
- Test: `packages/shared/src/nav-surfaces.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/src/nav-surfaces.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SURFACES, visibleSurfaces, SURFACE_GROUP_ORDER } from "./nav-surfaces";

const admin = { role: "admin" };
const venue = { role: "venueManager" };
const refereePlain = { role: null, refereeId: 42 };

describe("visibleSurfaces", () => {
  it("returns nothing for anonymous users", () => {
    expect(visibleSurfaces(null)).toEqual([]);
  });
  it("gives admin every surface", () => {
    expect(visibleSurfaces(admin).map((s) => s.id).sort()).toEqual(
      SURFACES.map((s) => s.id).sort(),
    );
  });
  it("scopes venue manager to venue/booking/match surfaces", () => {
    const ids = visibleSurfaces(venue).map((s) => s.id);
    expect(ids).toContain("venues");
    expect(ids).toContain("bookings");
    expect(ids).not.toContain("users");
    expect(ids).not.toContain("sync");
  });
  it("shows officiating to a plain referee via canViewOpenGames", () => {
    const ids = visibleSurfaces(refereePlain).map((s) => s.id);
    expect(ids).toContain("officiating");
    expect(ids).not.toContain("settings");
  });
  it("every surface belongs to a known group", () => {
    for (const s of SURFACES) {
      expect(SURFACE_GROUP_ORDER).toContain(s.group);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/shared test -- nav-surfaces`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/nav-surfaces.ts`:

```ts
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

export const SURFACE_GROUP_ORDER: SurfaceGroup[] = [
  "league",
  "operations",
  "social",
  "notifications",
  "system",
];

export const SURFACES: Surface[] = [
  { id: "officiating", group: "league", visible: (u) => canViewOpenGames(u) },
  { id: "matches", group: "league", visible: (u) => can(u, "match", "view") },
  { id: "standings", group: "league", visible: (u) => can(u, "standing", "view") },
  { id: "teams", group: "league", visible: (u) => can(u, "team", "view") },
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
  { id: "settings", group: "system", visible: (u) => can(u, "settings", "view") },
  { id: "users", group: "system", visible: (u) => can(u, "settings", "update") },
];

export function visibleSurfaces(user: GateUser): Surface[] {
  return SURFACES.filter((s) => s.visible(user));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @dragons/shared test -- nav-surfaces`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/nav-surfaces.ts packages/shared/src/nav-surfaces.test.ts
git commit -m "feat(shared): add capability surface catalog"
```

---

## Task 3: bottom-tab selection (`nav-tabs.ts`)

**Files:**
- Create: `packages/shared/src/nav-tabs.ts`
- Test: `packages/shared/src/nav-tabs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/src/nav-tabs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectTabs } from "./nav-tabs";

describe("selectTabs", () => {
  it("anonymous users get the four fan tabs", () => {
    expect(selectTabs(null)).toEqual(["home", "schedule", "standings", "teams"]);
  });
  it("a signed-in user with no surfaces gets Today but no Tools", () => {
    // role:null + no refereeId => visibleSurfaces is empty
    expect(selectTabs({ role: null })).toEqual(["home", "schedule", "today", "teams"]);
  });
  it("a referee gets Tools (officiating surface is visible)", () => {
    expect(selectTabs({ role: null, refereeId: 5 })).toEqual([
      "home",
      "schedule",
      "today",
      "teams",
      "tools",
    ]);
  });
  it("an admin gets the full signed-in set", () => {
    expect(selectTabs({ role: "admin" })).toEqual([
      "home",
      "schedule",
      "today",
      "teams",
      "tools",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/shared test -- nav-tabs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/nav-tabs.ts`:

```ts
import type { GateUser } from "./rbac";
import { visibleSurfaces } from "./nav-surfaces";

export type TabId = "home" | "schedule" | "standings" | "teams" | "today" | "tools";

export function selectTabs(user: GateUser): TabId[] {
  if (!user) return ["home", "schedule", "standings", "teams"];
  const tabs: TabId[] = ["home", "schedule", "today", "teams"];
  if (visibleSurfaces(user).length > 0) tabs.push("tools");
  return tabs;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @dragons/shared test -- nav-tabs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/nav-tabs.ts packages/shared/src/nav-tabs.test.ts
git commit -m "feat(shared): add role-aware bottom-tab selection"
```

---

## Task 4: Today item ordering (`today.ts`)

**Files:**
- Create: `packages/shared/src/today.ts`
- Test: `packages/shared/src/today.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/src/today.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { orderTodayItems, type TodayItem } from "./today";

const item = (over: Partial<TodayItem>): TodayItem => ({
  id: "x",
  providerId: "club",
  title: "t",
  urgency: 0,
  route: "/",
  icon: "circle",
  ...over,
});

describe("orderTodayItems", () => {
  it("returns empty for empty input", () => {
    expect(orderTodayItems([])).toEqual([]);
  });
  it("sorts by urgency descending", () => {
    const out = orderTodayItems([
      item({ id: "a", urgency: 1 }),
      item({ id: "b", urgency: 9 }),
    ]);
    expect(out.map((i) => i.id)).toEqual(["b", "a"]);
  });
  it("breaks ties by providerId then id, deterministically", () => {
    const out = orderTodayItems([
      item({ id: "2", providerId: "referee", urgency: 5 }),
      item({ id: "1", providerId: "referee", urgency: 5 }),
      item({ id: "9", providerId: "club", urgency: 5 }),
    ]);
    expect(out.map((i) => `${i.providerId}:${i.id}`)).toEqual([
      "club:9",
      "referee:1",
      "referee:2",
    ]);
  });
  it("does not mutate its input", () => {
    const input = [item({ id: "a", urgency: 1 }), item({ id: "b", urgency: 2 })];
    orderTodayItems(input);
    expect(input.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/shared test -- today`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/today.ts`:

```ts
export interface TodayItem {
  /** Stable id, unique within a provider. */
  id: string;
  /** Provider that produced this item (used for tiebreak ordering). */
  providerId: string;
  title: string;
  subtitle?: string;
  /** Higher = more urgent; sorted descending. */
  urgency: number;
  /** expo-router path to navigate to on press. */
  route: string;
  /** Icon name resolved per platform. */
  icon: string;
}

export function orderTodayItems(items: TodayItem[]): TodayItem[] {
  return [...items].sort(
    (a, b) =>
      b.urgency - a.urgency ||
      a.providerId.localeCompare(b.providerId) ||
      a.id.localeCompare(b.id),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @dragons/shared test -- today`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/today.ts packages/shared/src/today.test.ts
git commit -m "feat(shared): add Today item ordering"
```

---

## Task 5: export new shared modules

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add exports**

Append to `packages/shared/src/index.ts` (match the file's existing `export * from "./x";` style):

```ts
export * from "./nav-surfaces";
export * from "./nav-tabs";
export * from "./today";
```

(`rbac` is already exported; `coach`, `isMember`, `GateUser` ride along.)

- [ ] **Step 2: Verify build + typecheck**

Run: `pnpm --filter @dragons/shared build && pnpm --filter @dragons/shared test`
Expected: build succeeds, all shared tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): export nav-surfaces, nav-tabs, today"
```

---

## Task 6: native i18n keys

**Files:**
- Modify: `apps/native/src/i18n/en.json`
- Modify: `apps/native/src/i18n/de.json`

- [ ] **Step 1: Add English keys**

In `en.json`, under the existing `tabs` object add `"today"` and `"tools"`, and add two new top-level objects. Keep alphabetical/structural consistency with neighbours:

```jsonc
// inside "tabs": { ... }
"today": "Today",
"tools": "Tools",
```

```jsonc
// new top-level sibling objects
"today": {
  "title": "Today",
  "empty": "You're all caught up.",
  "emptyHint": "New tasks for your roles will show up here.",
  "openSlots": "{count} open referee slot(s) need cover",
  "nextAssignment": "You officiate {teams}",
  "nextGame": "Next game: {teams}"
},
"tools": {
  "title": "Tools",
  "empty": "No tools available for your account.",
  "groupLeague": "League",
  "groupOperations": "Operations",
  "groupSocial": "Social",
  "groupNotifications": "Notifications",
  "groupSystem": "System",
  "officiating": "Officiating",
  "boards": "Boards"
}
```

- [ ] **Step 2: Add German keys**

In `de.json`, mirror the structure:

```jsonc
// inside "tabs": { ... }
"today": "Heute",
"tools": "Verwaltung",
```

```jsonc
"today": {
  "title": "Heute",
  "empty": "Alles erledigt.",
  "emptyHint": "Neue Aufgaben für deine Rollen erscheinen hier.",
  "openSlots": "{count} offene Schiedsrichter-Slots brauchen Besetzung",
  "nextAssignment": "Du pfeifst {teams}",
  "nextGame": "Nächstes Spiel: {teams}"
},
"tools": {
  "title": "Verwaltung",
  "empty": "Keine Werkzeuge für dein Konto verfügbar.",
  "groupLeague": "Liga",
  "groupOperations": "Betrieb",
  "groupSocial": "Social",
  "groupNotifications": "Benachrichtigungen",
  "groupSystem": "System",
  "officiating": "Schiedsrichter",
  "boards": "Boards"
}
```

- [ ] **Step 3: Verify JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/native/src/i18n/en.json','utf8')); JSON.parse(require('fs').readFileSync('apps/native/src/i18n/de.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): i18n keys for Today and Tools"
```

---

## Task 7: move the referee list to a root-stack `officiating` screen

**Files:**
- Create: `apps/native/src/app/officiating.tsx` (moved content)
- Delete: `apps/native/src/app/(tabs)/referee.tsx`
- Modify: `apps/native/src/app/_layout.tsx`

- [ ] **Step 1: Move the file**

```bash
git mv apps/native/src/app/\(tabs\)/referee.tsx apps/native/src/app/officiating.tsx
```

- [ ] **Step 2: Adapt the moved screen for a stack header**

In `apps/native/src/app/officiating.tsx`, the screen will now render under a native Stack header instead of being a tab root. Remove the three in-content `<SectionHeader title={i18n.t("refereeTab.title")} />` lines (in the loading branch, the error branch, and the main return) so the title isn't shown twice. The `SegmentedControl` and list stay. Leave the `SectionHeader` import only if still used elsewhere in the file; otherwise remove it to satisfy lint.

- [ ] **Step 3: Register the route in the root Stack**

In `apps/native/src/app/_layout.tsx`, inside `RootNavigator`'s `<Stack>` (after the `admin` screen, around line 71), add:

```tsx
<Stack.Screen
  name="officiating"
  options={{
    headerShown: true,
    headerTitle: i18n.t("refereeTab.title"),
    headerStyle: { backgroundColor: colors.background },
  }}
/>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS (no references to the old `(tabs)/referee` path remain; the tab trigger is removed in Task 8).

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/app/officiating.tsx apps/native/src/app/_layout.tsx
git commit -m "refactor(native): move referee list to root-stack officiating screen"
```

---

## Task 8: data-driven tab layout + new tab screens scaffolding

**Files:**
- Create: `apps/native/src/lib/nav/tabs.ts`
- Modify: `apps/native/src/app/(tabs)/_layout.tsx`
- Create: `apps/native/src/app/(tabs)/today.tsx` (placeholder; filled in Task 11)
- Create: `apps/native/src/app/(tabs)/tools.tsx` (placeholder; filled in Task 9)

- [ ] **Step 1: Create the TabId → native config map**

Create `apps/native/src/lib/nav/tabs.ts`:

```ts
import type { TabId } from "@dragons/shared";

export interface TabConfig {
  /** expo-router route name within the (tabs) group. */
  name: string;
  labelKey: string;
  sf: { default: string; selected: string };
  md: string;
}

export const TAB_CONFIG: Record<TabId, TabConfig> = {
  home: {
    name: "index",
    labelKey: "tabs.home",
    sf: { default: "basketball", selected: "basketball.fill" },
    md: "sports_basketball",
  },
  schedule: {
    name: "schedule",
    labelKey: "tabs.schedule",
    sf: { default: "calendar", selected: "calendar" },
    md: "event",
  },
  standings: {
    name: "standings",
    labelKey: "tabs.standings",
    sf: { default: "chart.bar", selected: "chart.bar.fill" },
    md: "leaderboard",
  },
  teams: {
    name: "teams",
    labelKey: "tabs.teams",
    sf: { default: "person.3", selected: "person.3.fill" },
    md: "groups",
  },
  today: {
    name: "today",
    labelKey: "tabs.today",
    sf: { default: "bolt", selected: "bolt.fill" },
    md: "bolt",
  },
  tools: {
    name: "tools",
    labelKey: "tabs.tools",
    sf: { default: "wrench.and.screwdriver", selected: "wrench.and.screwdriver.fill" },
    md: "build",
  },
};
```

- [ ] **Step 2: Rewrite the tab layout to be data-driven**

Replace the body of `apps/native/src/app/(tabs)/_layout.tsx` with:

```tsx
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { selectTabs } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { TAB_CONFIG } from "@/lib/nav/tabs";

export default function TabLayout() {
  const { colors } = useTheme();
  const { data: session } = authClient.useSession();
  const tabs = selectTabs(
    (session?.user ?? null) as
      | { role?: string | null; refereeId?: number | null }
      | null,
  );

  return (
    <NativeTabs tintColor={colors.primary}>
      {tabs.map((tabId) => {
        const cfg = TAB_CONFIG[tabId];
        return (
          <NativeTabs.Trigger key={tabId} name={cfg.name}>
            <NativeTabs.Trigger.Label>{i18n.t(cfg.labelKey)}</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={cfg.sf} md={cfg.md} />
          </NativeTabs.Trigger>
        );
      })}
    </NativeTabs>
  );
}
```

This removes the `useEffect`/`useSegments`/`useRouter` redirect hack and the `canViewOpenGames` import entirely — out-of-permission tabs are never rendered.

- [ ] **Step 3: Add placeholder screens so every trigger resolves to a file**

Create `apps/native/src/app/(tabs)/today.tsx`:

```tsx
import { Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function TodayScreen() {
  const { colors, textStyles } = useTheme();
  return (
    <Screen>
      <View>
        <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
          {i18n.t("today.title")}
        </Text>
      </View>
    </Screen>
  );
}
```

Create `apps/native/src/app/(tabs)/tools.tsx`:

```tsx
import { Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function ToolsScreen() {
  const { colors, textStyles } = useTheme();
  return (
    <Screen>
      <View>
        <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
          {i18n.t("tools.title")}
        </Text>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 4: Typecheck + manual smoke**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.
Manual: launch the app (`pnpm --filter @dragons/native dev`); signed-out shows 4 fan tabs; sign in as an admin/referee account → tab bar shows Home / Schedule / Today / Teams / Tools.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/lib/nav/tabs.ts "apps/native/src/app/(tabs)/_layout.tsx" "apps/native/src/app/(tabs)/today.tsx" "apps/native/src/app/(tabs)/tools.tsx"
git commit -m "feat(native): data-driven role-aware tab bar"
```

---

## Task 9: Tools hub

**Files:**
- Create: `apps/native/src/lib/tools/surfaces.ts`
- Modify: `apps/native/src/app/(tabs)/tools.tsx`

- [ ] **Step 1: Native surface route/icon/label map**

Create `apps/native/src/lib/tools/surfaces.ts`. Only surfaces with a native destination this phase appear here:

```ts
import type { SurfaceGroup } from "@dragons/shared";

export interface NativeSurface {
  id: string;
  group: SurfaceGroup;
  route: string;
  labelKey: string;
  sf: string;
}

/** Surfaces that have a native screen. Add entries as tools are ported. */
export const NATIVE_SURFACES: Record<string, NativeSurface> = {
  officiating: {
    id: "officiating",
    group: "league",
    route: "/officiating",
    labelKey: "tools.officiating",
    sf: "whistle",
  },
  boards: {
    id: "boards",
    group: "operations",
    route: "/admin/boards",
    labelKey: "tools.boards",
    sf: "square.stack.3d.up",
  },
};
```

- [ ] **Step 2: Build the hub**

Replace `apps/native/src/app/(tabs)/tools.tsx`:

```tsx
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  visibleSurfaces,
  SURFACE_GROUP_ORDER,
  type SurfaceGroup,
} from "@dragons/shared";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { NATIVE_SURFACES } from "@/lib/tools/surfaces";

const GROUP_LABEL: Record<SurfaceGroup, string> = {
  league: "tools.groupLeague",
  operations: "tools.groupOperations",
  social: "tools.groupSocial",
  notifications: "tools.groupNotifications",
  system: "tools.groupSystem",
};

export default function ToolsScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const user = (session?.user ?? null) as
    | { role?: string | null; refereeId?: number | null }
    | null;

  // Surfaces the user can see AND that have a native screen.
  const rows = visibleSurfaces(user)
    .map((s) => NATIVE_SURFACES[s.id])
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const byGroup = SURFACE_GROUP_ORDER.map((group) => ({
    group,
    items: rows.filter((r) => r.group === group),
  })).filter((g) => g.items.length > 0);

  if (byGroup.length === 0) {
    return (
      <Screen>
        <SectionHeader title={i18n.t("tools.title")} />
        <Text style={[textStyles.body, { color: colors.mutedForeground }]}>
          {i18n.t("tools.empty")}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionHeader title={i18n.t("tools.title")} />
      <View style={{ gap: spacing.lg }}>
        {byGroup.map(({ group, items }) => (
          <View key={group} style={{ gap: spacing.sm }}>
            <Text
              style={[
                textStyles.sectionTitle,
                { color: colors.mutedForeground },
              ]}
            >
              {i18n.t(GROUP_LABEL[group]).toUpperCase()}
            </Text>
            {items.map((item) => (
              <Pressable key={item.id} onPress={() => router.push(item.route)}>
                <Card>
                  <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
                    {i18n.t(item.labelKey)}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 3: Typecheck + manual**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.
Manual: as a referee → Tools shows "League › Officiating"; as an admin → shows Officiating + Boards; tapping Officiating opens the moved list; tapping Boards opens `/admin/boards`.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/lib/tools/surfaces.ts "apps/native/src/app/(tabs)/tools.tsx"
git commit -m "feat(native): permission-gated Tools hub"
```

---

## Task 10: Today provider framework + referee/club providers

**Files:**
- Create: `apps/native/src/lib/today/types.ts`
- Create: `apps/native/src/lib/today/providers/referee.ts`
- Create: `apps/native/src/lib/today/providers/club.ts`
- Create: `apps/native/src/lib/today/registry.ts`

- [ ] **Step 1: Provider interface**

Create `apps/native/src/lib/today/types.ts`:

```ts
import type { GateUser, TodayItem } from "@dragons/shared";

export interface TodayProvider {
  id: string;
  /** Whether this provider runs for the given user. */
  visible: (user: GateUser) => boolean;
  /**
   * Hook that returns this provider's items. MUST be called unconditionally
   * (React rules of hooks); it gates its own data fetch on `visible(user)`.
   */
  useItems: (user: GateUser) => TodayItem[];
}
```

- [ ] **Step 2: Referee provider**

Create `apps/native/src/lib/today/providers/referee.ts`:

```ts
import useSWR from "swr";
import { canViewOpenGames, type GateUser, type TodayItem } from "@dragons/shared";
import { refereeApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export const refereeProvider = {
  id: "referee",
  visible: (user: GateUser) => canViewOpenGames(user),
  useItems(user: GateUser): TodayItem[] {
    const enabled = canViewOpenGames(user);
    const { data } = useSWR(enabled ? "today:referee" : null, () =>
      refereeApi.getGames({ status: "active", limit: 500 }),
    );
    if (!data) return [];
    const today = todayIso();
    const items: TodayItem[] = [];

    const openCount = data.items.filter(
      (g) =>
        g.kickoffDate >= today &&
        g.mySlot === null &&
        !g.isCancelled &&
        !g.isForfeited &&
        ((g.sr1OurClub && g.sr1Status !== "assigned") ||
          (g.sr2OurClub && g.sr2Status !== "assigned") ||
          g.sr1Status === "offered" ||
          g.sr2Status === "offered"),
    ).length;
    if (openCount > 0) {
      items.push({
        id: "open-slots",
        providerId: "referee",
        title: i18n.t("today.openSlots", { count: openCount }),
        urgency: 70,
        route: "/officiating",
        icon: "whistle",
      });
    }

    const next = data.items
      .filter((g) => g.mySlot !== null && g.kickoffDate >= today)
      .sort((a, b) => a.kickoffDate.localeCompare(b.kickoffDate))[0];
    if (next) {
      items.push({
        id: `assignment-${next.id}`,
        providerId: "referee",
        title: i18n.t("today.nextAssignment", {
          teams: `${next.homeTeamName} – ${next.guestTeamName}`,
        }),
        subtitle: next.kickoffDate,
        urgency: 80,
        route:
          next.matchId !== null
            ? `/game/${next.matchId}`
            : `/referee-game/${next.id}`,
        icon: "whistle",
      });
    }
    return items;
  },
};
```

Note: confirm field names on `RefereeGameListItem` (`homeTeamName`, `guestTeamName`, `matchId`, `mySlot`, `sr1OurClub`, `sr1Status`, `kickoffDate`, `isCancelled`, `isForfeited`) against `packages/shared/src/referee-games.ts` while implementing; the partition logic mirrors the existing `officiating.tsx` screen (moved from `(tabs)/referee.tsx`).

- [ ] **Step 3: Club provider**

Create `apps/native/src/lib/today/providers/club.ts`:

```ts
import useSWR from "swr";
import type { GateUser, TodayItem } from "@dragons/shared";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

export const clubProvider = {
  id: "club",
  visible: (_user: GateUser) => true,
  useItems(user: GateUser): TodayItem[] {
    const enabled = Boolean(user);
    const { data } = useSWR(enabled ? "today:club" : null, () =>
      publicApi.getHomeDashboard(),
    );
    if (!data?.nextGame) return [];
    const g = data.nextGame;
    return [
      {
        id: `next-game-${g.id}`,
        providerId: "club",
        title: i18n.t("today.nextGame", {
          teams: `${g.homeTeamName} – ${g.guestTeamName}`,
        }),
        subtitle: g.kickoffDate,
        urgency: 40,
        route: `/game/${g.id}`,
        icon: "basketball",
      },
    ];
  },
};
```

Note: confirm `nextGame` field names against `HomeDashboard` / `MatchListItem` in `packages/shared` while implementing (`homeTeamName`, `guestTeamName`, `kickoffDate`, `id`).

- [ ] **Step 4: Registry + aggregation hook**

Create `apps/native/src/lib/today/registry.ts`:

```ts
import { orderTodayItems, type GateUser, type TodayItem } from "@dragons/shared";
import type { TodayProvider } from "./types";
import { refereeProvider } from "./providers/referee";
import { clubProvider } from "./providers/club";

export const TODAY_PROVIDERS: TodayProvider[] = [refereeProvider, clubProvider];

/**
 * Aggregates every provider's items. All providers' hooks run unconditionally
 * (rules of hooks); each provider gates its own fetch on visibility, so hidden
 * providers cost nothing beyond an inert hook call.
 */
export function useTodayItems(user: GateUser): TodayItem[] {
  const all: TodayItem[] = [];
  for (const provider of TODAY_PROVIDERS) {
    // Order is stable because TODAY_PROVIDERS is a static module-level array.
    const items = provider.useItems(user);
    if (provider.visible(user)) all.push(...items);
  }
  return orderTodayItems(all);
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/native/src/lib/today
git commit -m "feat(native): Today provider framework with referee and club providers"
```

---

## Task 11: Today screen

**Files:**
- Modify: `apps/native/src/app/(tabs)/today.tsx`

- [ ] **Step 1: Render the aggregated feed**

Replace `apps/native/src/app/(tabs)/today.tsx`:

```tsx
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { useTodayItems } from "@/lib/today/registry";

export default function TodayScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = (session?.user ?? null) as
    | { role?: string | null; refereeId?: number | null }
    | null;

  const items = useTodayItems(user);

  return (
    <Screen>
      <SectionHeader title={i18n.t("today.title")} />
      {items.length === 0 ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
          <Text style={[textStyles.body, { color: colors.foreground }]}>
            {i18n.t("today.empty")}
          </Text>
          <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
            {i18n.t("today.emptyHint")}
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((item) => (
            <Pressable key={`${item.providerId}:${item.id}`} onPress={() => router.push(item.route)}>
              <Card>
                <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
```

- [ ] **Step 2: Typecheck + manual**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.
Manual: sign in as a referee → Today lists "You officiate …" and "N open referee slots …" plus the next club game; tapping a row navigates correctly; an account with no actionable items shows the "all caught up" empty state.

- [ ] **Step 3: Commit**

```bash
git add "apps/native/src/app/(tabs)/today.tsx"
git commit -m "feat(native): Today aggregated action feed"
```

---

## Task 12: slim the Profile screen

**Files:**
- Modify: `apps/native/src/app/profile.tsx`

- [ ] **Step 1: Remove the buried admin link**

In `apps/native/src/app/profile.tsx`, delete the entire "Admin section" block (the `{hasRole(... "admin") ? (<View>…/admin/boards…</View>) : null}` JSX, around lines 305-326). Boards is now reached via the Tools tab.

- [ ] **Step 2: Drop now-unused imports**

If `hasRole` is no longer referenced anywhere else in the file, remove it from the `@dragons/shared` import. Keep `parseRoles`, `isReferee`, `type RoleName` (still used for the role badges). Run typecheck to confirm what's unused.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS (no unused-import errors; `tsc` is the lint gate here).

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/app/profile.tsx
git commit -m "refactor(native): remove buried admin link from Profile"
```

---

## Task 13: login flow — post-login landing + sign-in hint

**Files:**
- Modify: `apps/native/src/app/(auth)/sign-in.tsx`

- [ ] **Step 1: Land on Today after sign-in**

In `apps/native/src/app/(auth)/sign-in.tsx`, the `dismiss()` helper currently pops the modal back to wherever it was opened. After a *successful* sign-in we want the signed-in user to land on the Today tab. Replace the success path in `handleSignIn` (the `dismiss();` call after a successful `signIn.email`) with navigation to Today, then dismiss the modal:

```tsx
      // success
      if (router.canDismiss()) {
        router.dismiss();
      }
      router.replace("/today");
```

Remove the now-redundant `dismiss();` on the success path (keep the `dismiss()` helper for the close button).

- [ ] **Step 2: Add the "ask your club admin" hint**

Below the sign-in `Pressable` (after the button, before the closing `</View>` of `content`), add a muted hint. Add the i18n key `auth.noAccountHint` to both locale files first:

`en.json` (inside `auth`): `"noAccountHint": "No account? Ask your club admin to create one."`
`de.json` (inside `auth`): `"noAccountHint": "Kein Konto? Bitte deinen Vereins-Admin, eines zu erstellen."`

```tsx
<Text
  style={[
    textStyles.caption,
    { color: colors.mutedForeground, textAlign: "center", marginTop: spacing.sm },
  ]}
>
  {i18n.t("auth.noAccountHint")}
</Text>
```

- [ ] **Step 3: Typecheck + manual**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.
Manual: open sign-in from the Home avatar, sign in → land on the Today tab (not Home); the hint shows under the button; the × close button still dismisses without signing in.

- [ ] **Step 4: Commit**

```bash
git add "apps/native/src/app/(auth)/sign-in.tsx" apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): land on Today after sign-in; add no-account hint"
```

---

## Task 14: refactor the web sidebar onto the shared catalog

**Files:**
- Modify: `apps/web/src/components/admin/app-sidebar.tsx`
- Test: `apps/web/src/components/admin/app-sidebar.test.tsx` (create if absent)

- [ ] **Step 1: Write/extend a gating test**

The web app already tests RBAC components (`apps/web/src/components/rbac/can.test.tsx`). Add `apps/web/src/components/admin/app-sidebar.test.tsx` asserting the catalog drives visibility. Mirror the existing test setup (next-intl + better-auth mocks) used by sibling tests; the assertions:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppSidebar } from "./app-sidebar";
// reuse the test providers/wrapper pattern from can.test.tsx

describe("AppSidebar", () => {
  it("shows venue tools but not system tools for a venue manager", () => {
    render(<Wrapper><AppSidebar user={{ role: "venueManager", refereeId: null }} /></Wrapper>);
    expect(screen.getByText("Venues")).toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });
  it("shows nothing gated for an anonymous user", () => {
    render(<Wrapper><AppSidebar user={null} /></Wrapper>);
    expect(screen.queryByText("Venues")).not.toBeInTheDocument();
  });
});
```

(Use the exact translated labels your i18n returns; adapt `Wrapper` to the existing test helper.)

- [ ] **Step 2: Run to verify it fails (or passes pre-refactor)**

Run: `pnpm --filter @dragons/web test -- app-sidebar`
Expected: PASS pre-refactor (behavior should be unchanged). This test is the guardrail for the refactor.

- [ ] **Step 3: Refactor the sidebar to build groups from `SURFACES`**

In `apps/web/src/components/admin/app-sidebar.tsx`, replace the local `navGroups` constant and `isItemVisible` with a mapping over the shared catalog. Keep the icon/href/label *presentation map* local to web; keep the top-level Dashboard and Referees items exactly as they are (the Referees gate stays `can(user, "referee", "view")`).

```tsx
import {
  SURFACES,
  SURFACE_GROUP_ORDER,
  visibleSurfaces,
  type SurfaceGroup,
} from "@dragons/shared";

// id -> presentation. Covers every grouped surface (officiating is native-only).
const SURFACE_META: Record<string, { href: string; labelKey: string }> = {
  matches: { href: "/admin/matches", labelKey: "nav.matches" },
  standings: { href: "/admin/standings", labelKey: "nav.standings" },
  teams: { href: "/admin/teams", labelKey: "nav.teams" },
  boards: { href: "/admin/boards", labelKey: "nav.board" },
  bookings: { href: "/admin/bookings", labelKey: "nav.bookings" },
  venues: { href: "/admin/venues", labelKey: "nav.venues" },
  broadcast: { href: "/admin/broadcast", labelKey: "nav.broadcast" },
  createPost: { href: "/admin/social/create", labelKey: "nav.createPost" },
  notifications: { href: "/admin/notifications", labelKey: "nav.notificationCenter" },
  watchRules: { href: "/admin/notifications/rules", labelKey: "nav.watchRules" },
  channels: { href: "/admin/notifications/channels", labelKey: "nav.channels" },
  domainEvents: { href: "/admin/notifications/events", labelKey: "nav.domainEvents" },
  pushTest: { href: "/admin/settings/notifications", labelKey: "nav.pushTest" },
  sync: { href: "/admin/sync", labelKey: "nav.sync" },
  settings: { href: "/admin/settings", labelKey: "nav.settings" },
  users: { href: "/admin/users", labelKey: "nav.users" },
};

const GROUP_META: Record<SurfaceGroup, { labelKey: string; icon: React.ComponentType }> = {
  league: { labelKey: "nav.groupLeague", icon: Trophy },
  operations: { labelKey: "nav.groupOperations", icon: KanbanSquare },
  social: { labelKey: "nav.groupSocial", icon: Image },
  notifications: { labelKey: "nav.groupNotifications", icon: Bell },
  system: { labelKey: "nav.groupSystem", icon: Settings },
};
```

Then compute visible groups from the catalog (replaces the old `visibleGroups`):

```tsx
const visibleIds = new Set(visibleSurfaces(user).map((s) => s.id));
const visibleGroups = SURFACE_GROUP_ORDER.map((group) => ({
  group,
  ...GROUP_META[group],
  items: SURFACES.filter(
    (s) => s.group === group && SURFACE_META[s.id] && visibleIds.has(s.id),
  ).map((s) => ({ href: SURFACE_META[s.id].href, labelKey: SURFACE_META[s.id].labelKey })),
})).filter((g) => g.items.length > 0);
```

Update the JSX `.map` over `visibleGroups` to read `group.labelKey`, `group.icon`, and `group.items[].href/labelKey` (the existing collapsible markup stays; only the data source changes). Leave the Dashboard and Referees `SidebarMenuItem`s untouched.

- [ ] **Step 4: Run the test to verify behavior is unchanged**

Run: `pnpm --filter @dragons/web test -- app-sidebar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/app-sidebar.tsx apps/web/src/components/admin/app-sidebar.test.tsx
git commit -m "refactor(web): drive admin sidebar from shared surface catalog"
```

---

## Task 15: full verification

**Files:** none (verification only)

- [ ] **Step 1: Shared tests + coverage**

Run: `pnpm --filter @dragons/shared test`
Expected: all PASS, including the new `rbac`, `nav-surfaces`, `nav-tabs`, `today` suites.

- [ ] **Step 2: Web tests**

Run: `pnpm --filter @dragons/web test -- app-sidebar`
Expected: PASS.

- [ ] **Step 3: Typecheck everything**

Run: `pnpm typecheck`
Expected: PASS across all packages (native, web, shared).

- [ ] **Step 4: Lint + AI-slop**

Run: `pnpm lint && node scripts/check-ai-slop.mjs`
Expected: PASS / "AI slop check passed."

- [ ] **Step 5: Manual native walkthrough**

Launch `pnpm --filter @dragons/native dev`. Verify:
- Signed out: Home / Schedule / Standings / Teams.
- Signed in (referee): Home / Schedule / Today / Teams / Tools; Today shows assignments + open slots; Tools shows Officiating.
- Signed in (admin): Tools shows Officiating + Boards; Today aggregates.
- Sign-in lands on Today; sign-out returns to the fan shell.

- [ ] **Step 6: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore(native): role-aware shell foundation cleanup"
```

---

## Self-review notes

- **Spec coverage:** identity predicates (Task 1), shared catalog + `visibleSurfaces` (Task 2), `selectTabs` (Task 3), Today ordering (Task 4), data-driven tabs minus the redirect hack (Task 8), Today framework + providers + screen (Tasks 10-11), Tools hub (Task 9), slimmed Profile (Task 12), login landing + hint (Task 13), web lockstep refactor (Task 14), `coach`/`isMember` seams (Task 1). Deferred items (member/coach backend linkage, member features, boards "assigned-to-me", per-tool native screens) are intentionally **not** tasks here — they are separate specs per the design.
- **Open items from the spec carried forward:** `webOnly` deep-linking is not implemented (no native surface needs it yet — surfaces without a native screen are simply hidden). The boards "assigned-to-me" Today provider is deferred (read endpoint does not exist). A signed-in member with `isMember === false` (backend not wired) correctly sees fan tabs + Today (club provider only) + no Tools — the accepted interim state.
- **Field-name verification:** Tasks 10's providers reference `RefereeGameListItem` and `HomeDashboard`/`MatchListItem` fields; confirm exact names in `packages/shared/src/referee-games.ts` and the home-dashboard type during implementation (the referee partition logic is copied from the existing screen, so the field names match what `officiating.tsx` already uses).
