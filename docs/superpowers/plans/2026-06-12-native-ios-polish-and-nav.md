# Native App iOS Polish & Navigation Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock in superadmin permission parity with tests, make the native app feel iOS-native (native segmented controls, haptics, large titles, action sheets, header search, contextual screen titles), and restructure the tab bar so Standings survives sign-in, Officiating becomes a first-class tab for referees/admins, and the two-item Tools tab disappears.

**Architecture:** Five independent, sequentially shippable phases. Phase 1 is API/shared test hardening (no behavior change). Phase 2 swaps custom JS controls for OS controls and wires haptics centrally (one edit in `Card.tsx` covers every card tap). Phase 3 changes the tab model in `@dragons/shared` (pure function + tests first), then moves the officiating route into the `(tabs)` group and folds the Tools list into the Today screen. Phases 4–5 are boards/detail-screen polish.

**Tech Stack:** Expo SDK 55 / expo-router NativeTabs, `@react-native-segmented-control/segmented-control` (new native dep — requires a dev-client rebuild), `expo-haptics` (already installed), `ActionSheetIOS`, react-native-screens `headerSearchBarOptions`, Vitest.

**Branch setup (before Task 1):**

```bash
cd /home/james/git/dragons-hub
git checkout main && git pull
git checkout -b feat/native-ios-polish
```

**Repo rules that apply to every commit:** no AI/`Co-Authored-By` trailers; run the affected package's tests before committing; lint and typecheck are separate (`pnpm --filter <pkg> lint` / `typecheck`).

**Manual verification:** Phases 2–5 change RN view code that the node-environment vitest setup cannot render. After each phase, run the app on the iOS simulator (`pnpm --filter @dragons/native ios`) and walk the affected screens. Phase 2 Task 2 adds a native module, so the dev client must be rebuilt once (`expo run:ios` does this).

---

## Phase 1 — Superadmin permission parity guards

Background: the superadmin role (added 2026-06-11) broke three admin-gated surfaces because gates checked the literal `admin` role. Existing tests cover `satisfiesRole` and spot-check `can()`. What is missing: an exhaustive admin↔superadmin parity sweep over the whole permission catalog, and a test of the actual better-auth role objects that `auth.api.userHasPermission` consults at runtime.

### Task 1: Exhaustive parity tests in `@dragons/shared`

**Files:**
- Modify: `packages/shared/src/rbac.test.ts`

- [ ] **Step 1: Write the failing-or-passing parity tests**

Add `statement` and `roles` to the existing import from `./rbac` at the top of `packages/shared/src/rbac.test.ts` (keep the names already imported there — `can`, `hasRole`, `satisfiesRole`, `parseRoles`, `isMember`, `ROLE_NAMES` — and append `statement, roles`).

Append at the end of the file:

```ts
describe("superadmin/admin permission parity (full catalog)", () => {
  // `can` is generically typed per-resource; loosen it for exhaustive iteration.
  const looseCan = can as unknown as (
    u: { role: string },
    resource: string,
    action: string,
  ) => boolean;

  it("superadmin holds every permission admin holds", () => {
    for (const [resource, actions] of Object.entries(statement)) {
      for (const action of actions) {
        if (looseCan({ role: "admin" }, resource, action)) {
          expect(
            looseCan({ role: "superadmin" }, resource, action),
            `superadmin is missing ${resource}:${action}`,
          ).toBe(true);
        }
      }
    }
  });

  it("better-auth role object authorizes every catalog action for superadmin", () => {
    // Exercises the exact objects the API's userHasPermission consults:
    // apps/api/src/config/auth.ts passes `roles` into the admin plugin.
    for (const [resource, actions] of Object.entries(statement)) {
      const result = roles.superadmin.authorize({
        [resource]: [...actions],
      } as never);
      expect(result.success, `superadmin denied on ${resource}`).toBe(true);
    }
  });

  it("better-auth role object authorizes every catalog action for admin", () => {
    for (const [resource, actions] of Object.entries(statement)) {
      const result = roles.admin.authorize({
        [resource]: [...actions],
      } as never);
      expect(result.success, `admin denied on ${resource}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the shared tests**

Run: `pnpm --filter @dragons/shared test`
Expected: PASS (the role definitions are already correct — these tests are regression guards; if any fail, the role catalog itself has drifted and the failure message names the exact resource:action).

- [ ] **Step 3: Typecheck and lint the package**

Run: `pnpm --filter @dragons/shared typecheck && pnpm --filter @dragons/shared lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/rbac.test.ts
git commit -m "test(shared): exhaustive superadmin/admin permission parity over the catalog"
```

---

## Phase 2 — iOS feel wave 1: native segmented control, haptics, large titles

### Task 2: Add the native segmented control dependency and shared component

**Files:**
- Modify: `apps/native/package.json` (via expo install)
- Create: `apps/native/src/components/ui/Segmented.tsx`

- [ ] **Step 1: Install the SDK-matched native module**

```bash
cd /home/james/git/dragons-hub/apps/native
npx expo install @react-native-segmented-control/segmented-control
cd /home/james/git/dragons-hub && pnpm install
```

Expected: dependency added to `apps/native/package.json`. This is a native module: the iOS dev client must be rebuilt once (`pnpm --filter @dragons/native ios`) before it works on device/simulator.

- [ ] **Step 2: Create the shared wrapper component**

Create `apps/native/src/components/ui/Segmented.tsx`:

```tsx
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { useTheme } from "@/hooks/useTheme";
import { haptics } from "@/lib/haptics";
import { fontFamilies } from "@/theme/typography";

interface SegmentedProps<K extends string> {
  segments: ReadonlyArray<{ key: K; label: string }>;
  selected: K;
  onSelect: (key: K) => void;
}

/**
 * Native segmented control (UISegmentedControl on iOS). Replaces the
 * Pressable-based switchers so VoiceOver support, dark-mode rendering, and
 * platform behavior come from the OS.
 */
export function Segmented<K extends string>({
  segments,
  selected,
  onSelect,
}: SegmentedProps<K>) {
  const { spacing, isDark } = useTheme();
  const selectedIndex = Math.max(
    0,
    segments.findIndex((s) => s.key === selected),
  );

  return (
    <SegmentedControl
      values={segments.map((s) => s.label)}
      selectedIndex={selectedIndex}
      appearance={isDark ? "dark" : "light"}
      fontStyle={{ fontFamily: fontFamilies.body }}
      activeFontStyle={{ fontFamily: fontFamilies.bodySemiBold }}
      style={{ marginBottom: spacing.md }}
      onChange={(event) => {
        const next = segments[event.nativeEvent.selectedSegmentIndex];
        if (next && next.key !== selected) {
          haptics.selection();
          onSelect(next.key);
        }
      }}
    />
  );
}
```

Note: `fontFamilies` exposes `body` and `bodySemiBold` (see `apps/native/src/theme/typography.ts` — same names the old custom controls used). `appearance` pins the native control to the app's theme choice rather than the system one, since the app supports a manual light/dark override.

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/native/package.json pnpm-lock.yaml apps/native/src/components/ui/Segmented.tsx
git commit -m "feat(native): add native iOS segmented control wrapper"
```

### Task 3: Adopt `Segmented` in the Schedule screen

**Files:**
- Modify: `apps/native/src/app/(tabs)/schedule.tsx`

- [ ] **Step 1: Replace the custom control**

In `apps/native/src/app/(tabs)/schedule.tsx`:

1. Delete the entire local `SegmentedControl` function (the block between the `/* ── Segmented Control ── */` comment and the `/* ── Match List ── */` comment, currently lines 65–125).
2. Add the import: `import { Segmented } from "@/components/ui/Segmented";`
3. Remove now-unused imports if flagged by lint (`Pressable` is still used elsewhere? — it is NOT used elsewhere in this file once the control is gone; remove `Pressable` from the `react-native` import. `fontFamilies` is still used by the section headers; keep it).
4. Replace the usage:

```tsx
<Segmented segments={segments} selected={segment} onSelect={setSegment} />
```

(The existing `segments` array of `{ key: Segment; label: string }` works unchanged with the generic component.)

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: clean — lint's `no-unused-vars` confirms you removed exactly the dead imports.

- [ ] **Step 3: Commit**

```bash
git add "apps/native/src/app/(tabs)/schedule.tsx"
git commit -m "feat(native): native segmented control on schedule screen"
```

### Task 4: Adopt `Segmented` in Officiating + fix the Mine-segment snap

**Files:**
- Modify: `apps/native/src/app/officiating.tsx`

Background: today the screen hides the "Mine" segment for anyone with `assignment:view` and force-snaps their selection to "Open" via an effect. A refereeAdmin who is *also* a referee loses sight of their own assignments. Fix: only hide "Mine" for admins who are not referees themselves.

- [ ] **Step 1: Replace the control and the gating**

In `apps/native/src/app/officiating.tsx`:

1. Delete the local `SegmentedControl` function (currently lines 104–161).
2. Add imports: `import { Segmented } from "@/components/ui/Segmented";` and extend the shared import to `import { can, isReferee, type RefereeGameListItem } from "@dragons/shared";`
3. Replace the `isAdmin` / `segment` setup (currently lines 167–183) with:

```tsx
  const { data: session } = authClient.useSession();
  const user = (session?.user ?? null) as {
    role?: string | null;
    refereeId?: number | null;
  } | null;
  const isAdmin = can(user, "assignment", "view");
  // Admins who are not themselves referees have no "Mine" games. Referees —
  // including referee-admins — keep the Mine segment.
  const showMine = isReferee(user) || !isAdmin;

  const [segment, setSegment] = useState<Segment>(showMine ? "mine" : "open");
  const [assignModal, setAssignModal] = useState<{
    game: RefereeGameListItem;
    slotNumber: 1 | 2;
  } | null>(null);

  // Session resolves async: if the user turns out to have no Mine segment,
  // leave "mine" for "open".
  useEffect(() => {
    if (!showMine && segment === "mine") setSegment("open");
  }, [showMine, segment]);
```

4. In the `segments` array further down, change the condition `...(isAdmin ? [] : [...])` to `...(showMine ? [{ key: "mine" as const, label: ... }] : [])` — i.e. the Mine entry is now included when `showMine` is true (note the inverted condition: the old code *excluded* Mine for admins; the new code *includes* it for `showMine`).
5. Replace the usage:

```tsx
<Segmented segments={segments} selected={segment} onSelect={setSegment} />
```

6. Remove `Pressable` from the `react-native` import ONLY if lint flags it — the error-retry button still uses `Pressable`, so it stays.

- [ ] **Step 2: Typecheck, lint, and run native tests**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint && pnpm --filter @dragons/native test`
Expected: clean. (The partition/grouping logic this screen uses is already covered by existing tests; the JSX changes are verified by typecheck.)

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/officiating.tsx
git commit -m "feat(native): native segmented control on officiating; keep Mine for referee-admins"
```

### Task 5: Wire haptics into the core touchpoints

**Files:**
- Modify: `apps/native/src/components/Card.tsx`
- Modify: `apps/native/src/components/FilterPill.tsx`
- Modify: `apps/native/src/components/ClaimGameButton.tsx`
- Modify: `apps/native/src/app/officiating.tsx`

- [ ] **Step 1: Card — light impact on every tappable card**

In `apps/native/src/components/Card.tsx`, add `import { haptics } from "@/lib/haptics";` and change the `Pressable`'s handler:

```tsx
      <Pressable
        onPress={() => {
          haptics.light();
          onPress();
        }}
```

(This single edit covers home dashboard cards, teams grid, today items, tools rows, board list rows — everywhere `Card onPress` is used.)

- [ ] **Step 2: FilterPill — selection tick**

In `apps/native/src/components/FilterPill.tsx`, add the same import and change:

```tsx
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
```

- [ ] **Step 3: ClaimGameButton — success/warning notifications**

In `apps/native/src/components/ClaimGameButton.tsx`, add `import { haptics } from "../lib/haptics";` (this file uses relative imports — match its style). In `performClaim`, add `haptics.success();` immediately before `Alert.alert(i18n.t("refereeGame.takeSuccess"));` and `haptics.warning();` as the first line of the `catch` block. Do the same in `performDrop` (success before the `dropSuccess` alert, warning first in its catch).

- [ ] **Step 4: Officiating unassign — same pattern**

In `apps/native/src/app/officiating.tsx`, add `import { haptics } from "@/lib/haptics";`. In `handleUnassign`'s inner async block, add `haptics.success();` before `Alert.alert(i18n.t("refereeGame.admin.removeSuccess"));` and `haptics.warning();` as the first line of its `catch`.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: clean.

```bash
git add apps/native/src/components/Card.tsx apps/native/src/components/FilterPill.tsx apps/native/src/components/ClaimGameButton.tsx apps/native/src/app/officiating.tsx
git commit -m "feat(native): haptic feedback on cards, filters, claim/assign actions"
```

### Task 6: Large titles on stack screens

**Files:**
- Modify: `apps/native/src/app/_layout.tsx`
- Modify: `apps/native/src/app/admin/_layout.tsx`

Note: large titles only apply to native-stack headers, so this covers Officiating (root route — moves into tabs in Phase 3, at which point its entry here is deleted), Profile, and the admin Boards stack. Tab screens draw their own in-screen `SectionHeader` titles and are unaffected. `headerLargeTitle` is a no-op on Android.

- [ ] **Step 1: Root layout**

In `apps/native/src/app/_layout.tsx`, extend the `officiating` and `profile` screen options (both currently set `headerShown`, `headerTitle`, `headerStyle`) by adding to each:

```tsx
            headerLargeTitle: true,
            headerLargeTitleShadowVisible: false,
```

- [ ] **Step 2: Admin layout**

In `apps/native/src/app/admin/_layout.tsx`, add to the `Stack` `screenOptions` object:

```tsx
        headerLargeTitle: true,
        headerLargeTitleShadowVisible: false,
```

and on the `boards/[id]` screen — which sets its title dynamically to the board name and hosts header controls — opt back out by adding `headerLargeTitle: false` to its options:

```tsx
      <Stack.Screen
        name="boards/[id]"
        options={{ title: "", headerLargeTitle: false }}
      />
```

- [ ] **Step 3: Typecheck, lint, commit**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: clean.

```bash
git add apps/native/src/app/_layout.tsx apps/native/src/app/admin/_layout.tsx
git commit -m "feat(native): iOS large titles on officiating, profile, and boards list"
```

- [ ] **Step 4: Manual verification checkpoint (simulator)**

Run: `pnpm --filter @dragons/native ios` (full rebuild — picks up the new native module from Task 2).
Verify: Schedule and Officiating show the native segmented control in both light and dark mode; card taps tick; Profile and Boards list show large titles; claiming/dropping a slot fires a success haptic.

---

## Phase 3 — Tab restructure: Standings survives sign-in, Officiating becomes a tab, Tools dissolves

Target tab model (5 tabs max, iOS native tab bar):

| User | Tabs (in order) |
|---|---|
| Signed out | Home, Schedule, Standings, Teams |
| Signed in, no assignment duties | Home, Schedule, **Standings**, Today, Teams |
| Signed in with `canViewOpenGames` (referee, refereeAdmin, admin, superadmin) | Home, Schedule, **Officiating**, Today, Teams |

Boards (and future native tools) move to a "Tools" section on the Today screen. The Tools tab and screen are deleted.

### Task 7: Change `selectTabs` in `@dragons/shared` (tests first)

**Files:**
- Modify: `packages/shared/src/nav-tabs.ts`
- Modify: `packages/shared/src/nav-tabs.test.ts`

- [ ] **Step 1: Rewrite the test file to describe the new model**

Replace the entire contents of `packages/shared/src/nav-tabs.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { selectTabs } from "./nav-tabs";

describe("selectTabs", () => {
  it("treats undefined like anonymous", () => {
    expect(selectTabs(undefined)).toEqual(["home", "schedule", "standings", "teams"]);
  });

  it("anonymous users get the four fan tabs", () => {
    expect(selectTabs(null)).toEqual(["home", "schedule", "standings", "teams"]);
  });

  it("a signed-in user without assignment duties keeps Standings and gains Today", () => {
    expect(selectTabs({ role: null })).toEqual([
      "home",
      "schedule",
      "standings",
      "today",
      "teams",
    ]);
  });

  it("a referee gets Officiating in place of Standings", () => {
    expect(selectTabs({ role: null, refereeId: 5 })).toEqual([
      "home",
      "schedule",
      "officiating",
      "today",
      "teams",
    ]);
  });

  it.each([["admin"], ["superadmin"], ["refereeAdmin"]])(
    "a %s gets Officiating (assignment:view)",
    (role) => {
      expect(selectTabs({ role })).toEqual([
        "home",
        "schedule",
        "officiating",
        "today",
        "teams",
      ]);
    },
  );

  it.each([["venueManager"], ["teamManager"], ["coach"]])(
    "a %s keeps Standings (no assignment view)",
    (role) => {
      expect(selectTabs({ role })).toEqual([
        "home",
        "schedule",
        "standings",
        "today",
        "teams",
      ]);
    },
  );

  it("never returns a tools tab", () => {
    for (const user of [null, { role: "admin" }, { role: null, refereeId: 1 }]) {
      expect(selectTabs(user)).not.toContain("tools");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/shared test`
Expected: FAIL — current `selectTabs` returns `today` in position 3 and includes `tools`.

- [ ] **Step 3: Implement the new `selectTabs`**

Replace the entire contents of `packages/shared/src/nav-tabs.ts` with:

```ts
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
```

(`visibleSurfaces` is no longer imported here — `nav-surfaces.ts` itself is unchanged and still used by the web tier and the Today screen.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

Note: `pnpm --filter @dragons/native typecheck` now fails because `TAB_CONFIG` still has a `tools` key and no `officiating` key — that is expected and fixed in Task 8. Commit only the shared package here; the monorepo `pnpm typecheck` gate runs at the end of Task 9.

```bash
git add packages/shared/src/nav-tabs.ts packages/shared/src/nav-tabs.test.ts
git commit -m "feat(shared): officiating tab for assignment users; standings survives sign-in; drop tools tab"
```

### Task 8: Native tab config + move the Officiating route into `(tabs)`

**Files:**
- Modify: `apps/native/src/lib/nav/tabs.ts`
- Move: `apps/native/src/app/officiating.tsx` → `apps/native/src/app/(tabs)/officiating.tsx`
- Modify: `apps/native/src/app/(tabs)/officiating.tsx` (post-move: add in-screen title)
- Modify: `apps/native/src/app/_layout.tsx` (drop the root officiating stack entry)
- Modify: `apps/native/src/i18n/en.json`, `apps/native/src/i18n/de.json`

- [ ] **Step 1: Update `TAB_CONFIG`**

In `apps/native/src/lib/nav/tabs.ts`, delete the `tools` entry and add:

```ts
  officiating: {
    name: "officiating",
    labelKey: "tabs.officiating",
    sf: { default: "whistle", selected: "whistle.fill" },
    md: "sports",
  },
```

(`Record<TabId, TabConfig>` makes this exhaustive — typecheck fails until the keys exactly match the new `TabId`.)

- [ ] **Step 2: Add the tab labels**

In `apps/native/src/i18n/en.json`, inside the `"tabs"` object, remove `"tools": "Tools"` and add `"officiating": "Officiating"`. In `de.json`'s `"tabs"` object, remove the tools entry and add `"officiating": "Einsätze"`. Leave the top-level `"tools"` translation group in both files — the Today screen reuses `tools.title` and `tools.boards` in Task 9.

- [ ] **Step 3: Move the route file**

```bash
git mv apps/native/src/app/officiating.tsx "apps/native/src/app/(tabs)/officiating.tsx"
```

The URL stays `/officiating` (route groups add no path segment), so the Today-provider route `/officiating` in `apps/native/src/lib/today/providers/referee.ts` keeps working unchanged.

- [ ] **Step 4: Give the screen an in-screen title (tab screens have no stack header)**

In the moved `apps/native/src/app/(tabs)/officiating.tsx`:

1. Add `import { SectionHeader } from "@/components/SectionHeader";`
2. In the main return (the loaded, non-error branch), render the title above the segmented control:

```tsx
    <Screen scroll={false}>
      <SectionHeader title={i18n.t("refereeTab.title")} />
      <Segmented segments={segments} selected={segment} onSelect={setSegment} />
```

3. Add the same `<SectionHeader title={i18n.t("refereeTab.title")} />` as the first child inside the `<Screen scroll={false}>` of the loading branch and the error branch, so the title doesn't pop in.

- [ ] **Step 5: Remove the root stack entry**

In `apps/native/src/app/_layout.tsx`, delete the entire `<Stack.Screen name="officiating" .../>` element (every user who can access officiating now has it as a tab; there is no longer a root-level route file, so the entry would warn).

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add -A apps/native/src/lib/nav/tabs.ts "apps/native/src/app/(tabs)/officiating.tsx" apps/native/src/app/_layout.tsx apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): officiating as a native tab with whistle symbol"
```

### Task 9: Dissolve the Tools tab into the Today screen; fix the boards admin gate

**Files:**
- Delete: `apps/native/src/app/(tabs)/tools.tsx`
- Modify: `apps/native/src/lib/tools/surfaces.ts`
- Modify: `apps/native/src/app/(tabs)/today.tsx`
- Modify: `apps/native/src/app/admin/_layout.tsx`

- [ ] **Step 1: Remove the officiating surface entry and the Tools screen**

In `apps/native/src/lib/tools/surfaces.ts`, delete the `officiating` entry from `NATIVE_SURFACES` (it is a tab now; listing it again on Today would duplicate it). Keep `boards`.

```bash
git rm "apps/native/src/app/(tabs)/tools.tsx"
```

- [ ] **Step 2: Add the Tools section to the Today screen**

Replace the contents of `apps/native/src/app/(tabs)/today.tsx` with:

```tsx
import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import { visibleSurfaces } from "@dragons/shared";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useGateUser } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { useTodayItems } from "@/lib/today/registry";
import { NATIVE_SURFACES } from "@/lib/tools/surfaces";

export default function TodayScreen() {
  const { colors, textStyles, spacing } = useTheme();
  const router = useRouter();
  const user = useGateUser();
  const items = useTodayItems(user);

  // Native tool surfaces the user can see (boards, future tools). Officiating
  // is excluded: it is its own tab.
  const tools = visibleSurfaces(user)
    .map((s) => NATIVE_SURFACES[s.id])
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

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
            <Pressable
              key={`${item.providerId}:${item.id}`}
              onPress={() => router.push(item.route as Href)}
            >
              <Card>
                <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text
                    style={[textStyles.caption, { color: colors.mutedForeground }]}
                  >
                    {item.subtitle}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}
      {tools.length > 0 ? (
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <SectionHeader title={i18n.t("tools.title")} />
          {tools.map((tool) => (
            <Card key={tool.id} onPress={() => router.push(tool.route as Href)}>
              <Text style={[textStyles.cardTitle, { color: colors.foreground }]}>
                {i18n.t(tool.labelKey)}
              </Text>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
```

- [ ] **Step 3: Gate `/admin/*` on board permission, not the admin role**

Pre-existing flow bug this restructure would otherwise amplify: `NATIVE_SURFACES.boards` is visible to anyone with `board:view` (refereeAdmin, venueManager, teamManager, coach), but `apps/native/src/app/admin/_layout.tsx` redirects everyone who isn't admin/superadmin — those users tap Boards and silently land on Home. The admin group currently hosts only boards screens, so gate on the resource:

In `apps/native/src/app/admin/_layout.tsx`, change the import and the gate:

```tsx
import { can } from "@dragons/shared";
```

```tsx
  const user = session?.user as { role?: string | null } | null | undefined;
  if (!can(user, "board", "view")) {
    return <Redirect href="/" />;
  }
```

(Server-side the board routes are already gated per-permission via `requirePermission("board", ...)`, so this only aligns the client gate with what the API allows.)

- [ ] **Step 4: Full verification gate**

Run: `pnpm --filter @dragons/shared test && pnpm --filter @dragons/native test && pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint && pnpm typecheck`
Expected: all clean. (`pnpm typecheck` covers the web tier, which also imports `selectTabs`/`TabId` — if web references the removed `tools` tab id, typecheck names the file; web renders tabs from the same `selectTabs` so no code change is expected, but verify.)

- [ ] **Step 5: Commit**

```bash
git add -A apps/native/src/lib/tools/surfaces.ts "apps/native/src/app/(tabs)/today.tsx" apps/native/src/app/admin/_layout.tsx
git commit -m "feat(native): fold tools into today screen; gate boards on board:view"
```

- [ ] **Step 6: Manual verification checkpoint (simulator)**

Verify as superadmin: tab bar shows Home, Schedule, Officiating (whistle), Today, Teams; Today shows a Tools section with Boards; Boards opens. Signed out: Home, Schedule, Standings, Teams.

---

## Phase 4 — Boards: native action sheet + native header search

### Task 10: Task long-press uses a native action sheet on iOS

**Files:**
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

The Gorhom-sheet `TaskContextMenu` stays as the Android path; iOS gets `ActionSheetIOS` (no new dependency, no rebuild).

- [ ] **Step 1: Rework `handleTaskLongPress`**

In `apps/native/src/app/admin/boards/[id].tsx`:

1. Extend the `react-native` import with `ActionSheetIOS` and `Platform`.
2. Add `import { haptics } from "@/lib/haptics";` and extend the existing TaskContextMenu import to also bring the action type: `import { TaskContextMenu, type TaskContextMenuHandle, type TaskContextAction } from "@/components/board/TaskContextMenu";`
3. Replace the `handleTaskLongPress` callback (currently lines 250–280) with:

```tsx
  const handleTaskLongPress = useCallback(
    (task: TaskCardData) => {
      const runAction = (action: TaskContextAction) => {
        if (action === "move") {
          moveToSheetRef.current?.open({
            task,
            columns,
            countsByColumn,
            onMove: async (columnId, position) => {
              await moveTask(task.id, columnId, position);
            },
          });
        } else if (action === "priority") {
          pickers.openPriority(task.priority, (p) => {
            // Mutation hook surfaces failures via toast; swallow rejection.
            taskMutations.setPriority(task.id, p).catch(() => {});
          });
        } else if (action === "due") {
          pickers.openDue(task.dueDate, (iso) => {
            taskMutations.setDueDate(task.id, iso).catch(() => {});
          });
        } else if (action === "delete") {
          handleTaskDelete(task);
        }
      };

      if (Platform.OS === "ios") {
        haptics.light();
        const actions: TaskContextAction[] = ["move", "priority", "due", "delete"];
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: task.title,
            options: [
              i18n.t("board.task.actions.moveTo"),
              i18n.t("board.task.actions.setPriority"),
              i18n.t("board.task.actions.setDue"),
              i18n.t("board.task.actions.delete"),
              i18n.t("common.cancel"),
            ],
            destructiveButtonIndex: 3,
            cancelButtonIndex: 4,
          },
          (buttonIndex) => {
            const action = actions[buttonIndex];
            if (action) runAction(action);
          },
        );
        return;
      }

      contextMenuRef.current?.open({ task, onAction: runAction });
    },
    [columns, countsByColumn, moveTask, taskMutations, pickers, handleTaskDelete],
  );
```

(`TaskContextAction` is already exported by `TaskContextMenu.tsx`; the i18n keys are the same ones the sheet renders, and `common.cancel` already exists — `ClaimGameButton` uses it.)

- [ ] **Step 2: Typecheck, lint, run native tests**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint && pnpm --filter @dragons/native test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "apps/native/src/app/admin/boards/[id].tsx"
git commit -m "feat(native): native iOS action sheet for task context menu"
```

### Task 11: Native header search bar on the board detail screen

**Files:**
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: Swap the custom inline input for `headerSearchBarOptions`**

In `apps/native/src/app/admin/boards/[id].tsx`:

1. In the `<Stack.Screen options={{...}}>` block (currently starting around line 357), add alongside `title: board.name`:

```tsx
          headerSearchBarOptions: {
            placeholder: i18n.t("board.search.placeholder"),
            hideWhenScrolling: false,
            onChangeText: (e) => setSearchQuery(e.nativeEvent.text),
            onCancelButtonPress: () => setSearchQuery(""),
          },
```

2. Remove `<BoardSearchInput value={searchQuery} onChange={setSearchQuery} />` from the `headerRight` row (keep the sort button) and delete the `BoardSearchInput` import. Keep `searchQuery` state and the existing "search active" clear-banner UI (around line 429) — it still reflects the query.
3. Leave `apps/native/src/components/board/BoardSearchInput.tsx` in place for now — `git grep -n "BoardSearchInput" apps/native/src` after the edit; if this screen was its only consumer, delete the component file and its test (if one exists) in this same commit.

- [ ] **Step 2: Typecheck, lint, commit**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint && pnpm --filter @dragons/native test`
Expected: clean.

```bash
git add -A "apps/native/src/app/admin/boards/[id].tsx" apps/native/src/components/board/
git commit -m "feat(native): native header search bar on board detail"
```

- [ ] **Step 3: Manual verification checkpoint (simulator)**

Verify: board screen shows the native iOS search field under the title; typing filters tasks live; Cancel clears; long-press on a task opens a native action sheet with Delete in red.

---

## Phase 5 — Contextual titles on detail screens

The four detail screens use transparent headers with `headerTitle: ""` — after any scroll the user has no anchor for where they are, and H2H never names the opponent. Set real titles per screen via an inline `<Stack.Screen options>` once data is loaded. The shared `detailHeaderOptions` in the root layout stays (back arrow, transparency); each screen overrides only the title. The `Screen` component's 44px `headerOffset` already keeps content below the header, so titles don't overlap heroes.

### Task 12: Set data-driven header titles

**Files:**
- Modify: `apps/native/src/app/game/[id].tsx`
- Modify: `apps/native/src/app/team/[id].tsx`
- Modify: `apps/native/src/app/h2h/[teamApiId].tsx`
- Modify: `apps/native/src/app/referee-game/[id].tsx`

- [ ] **Step 1: Game detail**

In `apps/native/src/app/game/[id].tsx`, add `Stack` to the existing `expo-router` import. In the loaded branch of the render (where `match`, `homeName`, and `guestName` from lines ~64–67 are in scope), add as the first JSX child:

```tsx
      <Stack.Screen options={{ headerTitle: `${homeName} – ${guestName}` }} />
```

- [ ] **Step 2: Team detail**

In `apps/native/src/app/team/[id].tsx`, add `Stack` to the `expo-router` import and, in the loaded branch where `team` is non-null:

```tsx
      <Stack.Screen options={{ headerTitle: team.name }} />
```

- [ ] **Step 3: H2H**

In `apps/native/src/app/h2h/[teamApiId].tsx`, add `Stack` to the `expo-router` import. Derive the opponent name from the first match (every match in this list is "own club vs this opponent"):

```tsx
  const first = data?.items[0];
  const opponentName = first
    ? first.homeIsOwnClub
      ? first.guestTeamName
      : first.homeTeamName
    : null;
```

and in the render:

```tsx
      <Stack.Screen
        options={{
          headerTitle: opponentName
            ? i18n.t("h2h.title", { opponent: opponentName })
            : "",
        }}
      />
```

(`h2h.title` already exists: `"Record vs %{opponent}"` / its German counterpart. If `i18n` is not yet imported in this file, add `import { i18n } from "@/lib/i18n";`.)

- [ ] **Step 4: Referee game detail**

In `apps/native/src/app/referee-game/[id].tsx`, add `Stack` to the `expo-router` import and, in the loaded branch where `game` is non-null:

```tsx
      <Stack.Screen options={{ headerTitle: `${game.homeTeamName} – ${game.guestTeamName}` }} />
```

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: clean. If typecheck flags a field name (e.g. `guestTeamName` on the H2H list item type), use the field the screen's own match card already renders — the card components in each file show the authoritative names.

```bash
git add apps/native/src/app/game apps/native/src/app/team apps/native/src/app/h2h apps/native/src/app/referee-game
git commit -m "feat(native): contextual header titles on game, team, h2h, referee-game"
```

- [ ] **Step 6: Final verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all green across the monorepo (CI parity).
Simulator: open a game, a team, an H2H, and a referee game — each shows a centered native header title naming what you're looking at.

---

## Explicitly deferred (separate plans when wanted)

- **Game / referee-game route merge.** Not a simple merge: neutral officiating games have `matchId === null` (no local match row), so `/game/[id]` cannot render them. The right shape is shared section components consumed by both routes, not one route. Plan separately.
- **Dynamic Type / font scaling.** RN 0.83 removed `Text.defaultProps`; supporting this properly means an `AppText` wrapper adopted across ~70 files. Worth doing, too invasive to ride along here.
- **VoiceOver actions for board drag/drop** (`accessibilityActions` on TaskCard: move up/down/to column).
- **expo-symbols adoption** for in-screen icons, and **zeego/UIMenu** context menus with previews (requires new native modules + rebuild; the ActionSheetIOS swap in Task 10 captures most of the value first).
- **Today providers expansion** (open-slot counts, pending approvals) — the provider registry in `apps/native/src/lib/today/` is the extension point.
- **Small per-screen polish:** Teams grid → `FlatList numColumns={2}` for recycling; skeleton loading states sized to content; claim/assign confirmations as inline button-state morphs instead of alerts.
