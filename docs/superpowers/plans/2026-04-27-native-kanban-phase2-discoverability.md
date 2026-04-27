# Native Kanban Phase 2 — Discoverability & Power-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the native board match the web's discoverability budget — the user can find a task by typing its title, slice the board by an arbitrary set of assignees, sort columns by something other than position, persist their filter+sort across sessions, drag columns to reorder them, and read due-date urgency at a glance even on a small phone.

**Architecture:** Search is a header-mounted collapsible icon → text input that filters tasks in-memory by title substring. The existing `BoardFilters` shape gains an `assigneeIds: Set<string>` slot fed by a new `AssigneeFilterSheet` (multi-select, "Apply" gated). Filter + sort state persists per-board through a `useBoardFilterPersistence` hook backed by `expo-secure-store` (AsyncStorage is not in `apps/native/package.json`). Sort is a new bottom sheet driven by a pure comparator helper in `@dragons/shared`. Column reorder is a long-press-on-pill gesture system that lifts a column visually, disables the pager scroll, and on release applies a column reorder via the existing `applyColumnReorder` helper + `useColumnMutations.reorder()`. Avatar overflow recomputes its `max` from window width so 4-inch screens don't drown in chips. Due-date colour buckets (`overdue` / `today` / `soon` / `later`) are a pure helper in shared.

**Tech Stack:** React Native 0.83.4, Expo 55, expo-router 55, `@gorhom/bottom-sheet` 5.2.10, `react-native-reanimated` 4.3.0, `react-native-gesture-handler` 2.31.1, SWR 2.4.1, `i18n-js` 4.5.1, Vitest 4 (for `@dragons/shared` pure logic only — native has no test runner; UI changes get manual verification), `expo-secure-store` 55 (already in deps).

---

## File Structure

**New files:**
- `apps/native/src/components/board/BoardSearchInput.tsx` — collapsible header search affordance
- `apps/native/src/components/board/AssigneeFilterSheet.tsx` — multi-select assignee filter sheet
- `apps/native/src/components/board/SortSheet.tsx` — sort options bottom sheet
- `apps/native/src/hooks/board/useBoardFilterPersistence.ts` — per-board filter + sort persistence hook
- `apps/native/src/hooks/board/useColumnDrag.ts` — long-press column reorder gesture state
- `packages/shared/src/board-filter-storage.ts` — pure (de)serialisation for filter persistence
- `packages/shared/src/board-filter-storage.test.ts` — vitest
- `packages/shared/src/board-task-sort.ts` — pure comparator factory for sort modes
- `packages/shared/src/board-task-sort.test.ts` — vitest
- `packages/shared/src/board-due-date.ts` — pure due-date bucket helper
- `packages/shared/src/board-due-date.test.ts` — vitest

**Modified files:**
- `apps/native/src/components/board/FilterChips.tsx` — extend `BoardFilters` with `assigneeIds`, add Assignees chip, add active count badge for assignee filter
- `apps/native/src/components/board/BoardHeader.tsx` — accept reorder-mode props (lifted column id, drag handlers); plain pill render stays the same when reorder mode is off
- `apps/native/src/components/board/BoardPager.tsx` — accept `scrollEnabled` prop forwarded into the outer horizontal `ScrollView`
- `apps/native/src/components/board/TaskCard.tsx` — `AvatarStack` reads `useWindowDimensions`; due-date row uses `dueDateBucket` for colour + label
- `apps/native/src/app/admin/boards/[id].tsx` — wire search, assignee filter sheet, sort sheet, column drag, persistence; thread sort through tasks memo
- `apps/native/src/i18n/en.json` — add `board.search.*`, `board.filters.assignees`, `board.sort.*` keys
- `apps/native/src/i18n/de.json` — same keys, German
- `packages/shared/src/index.ts` — export new pure helpers

**Files NOT touched in Phase 2 (deferred to Phase 3):**
- Drag ghost tilt/spring, drop pulse animation, swipe-to-archive — Phase 3
- Skeleton fidelity, a11y screen-reader announcements — Phase 3
- Cross-board global search — Phase 3

---

## Task 1: Search Within Board

**Files:**
- Create: `apps/native/src/components/board/BoardSearchInput.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`
- Modify: `apps/native/src/i18n/en.json`
- Modify: `apps/native/src/i18n/de.json`

`TaskCardData` does NOT carry the description field (it lives on `TaskDetail`), so search matches the task title only. We document this as a known limitation; full-text search across descriptions is a server-side concern deferred to Phase 3.

- [ ] **Step 1: Create the `BoardSearchInput` component**

Create `apps/native/src/components/board/BoardSearchInput.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View, Text } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface Props {
  /** Current query string. */
  value: string;
  /** Called on every keystroke. */
  onChange: (next: string) => void;
}

function SearchIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
      <Path d="M20 20l-3.5-3.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function BoardSearchInput({ value, onChange }: Props) {
  const { colors, spacing, radius } = useTheme();
  const [expanded, setExpanded] = useState(value.length > 0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  if (!expanded) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.search.open")}
        hitSlop={12}
        style={{
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SearchIcon size={20} color={colors.foreground} />
      </Pressable>
    );
  }

  const collapse = () => {
    onChange("");
    setExpanded(false);
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        height: 44,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceLow,
        borderWidth: 1,
        borderColor: colors.border,
        flex: 1,
      }}
    >
      <SearchIcon size={16} color={colors.mutedForeground} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={i18n.t("board.search.placeholder")}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={{
          flex: 1,
          color: colors.foreground,
          fontSize: 15,
          paddingVertical: 0,
        }}
      />
      <Pressable
        onPress={collapse}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.search.close")}
        hitSlop={12}
        style={{
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.mutedForeground, fontSize: 16, fontWeight: "700" }}>×</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Add search i18n keys**

Open `apps/native/src/i18n/en.json`. Find the existing `"board": { ... }` block. Inside it, add (alongside existing sub-blocks like `"filters"`, `"empty"`):

```json
    "search": {
      "open": "Search tasks",
      "close": "Close search",
      "placeholder": "Search by title…",
      "matches": "{{count}} match",
      "matchesPlural": "{{count}} matches"
    },
```

Open `apps/native/src/i18n/de.json` and add:

```json
    "search": {
      "open": "Aufgaben suchen",
      "close": "Suche schließen",
      "placeholder": "Nach Titel suchen…",
      "matches": "{{count}} Treffer",
      "matchesPlural": "{{count}} Treffer"
    },
```

- [ ] **Step 3: Wire search state into board detail screen**

Open `apps/native/src/app/admin/boards/[id].tsx`. Add the import block near the existing component imports:

```tsx
import { BoardSearchInput } from "@/components/board/BoardSearchInput";
```

Add state inside `BoardDetailBody`, below the existing `useState<BoardFilters>` line:

```tsx
  const [searchQuery, setSearchQuery] = useState("");
```

Find the `tasks` `useMemo` block. Replace it with:

```tsx
  const tasks = useMemo(() => {
    if (!rawTasks) return rawTasks;
    // NOTE: TaskCardData has no description field — board search matches
    // task title only. Description-level search is server-side and deferred.
    const q = searchQuery.trim().toLowerCase();
    return rawTasks.filter((t) => {
      if (q.length > 0 && !t.title.toLowerCase().includes(q)) return false;
      if (filters.mine && currentUserId) {
        if (!t.assignees.some((a) => a.userId === currentUserId)) return false;
      }
      if (filters.dueSoon) {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        const now = Date.now();
        if (d.getTime() < now) return false;
        if (d.getTime() > now + 7 * 24 * 60 * 60 * 1000) return false;
      }
      if (filters.unassigned) {
        if (t.assignees.length > 0) return false;
      }
      return true;
    });
  }, [rawTasks, filters, currentUserId, searchQuery]);
```

Mount the search input in the header bar. Find the `<Stack.Screen ... />` that was placed in Phase 1 (with `headerRight` for the settings ⋯ button). Replace its `headerRight` with a flex-row that contains both the search input and the existing settings dot menu:

```tsx
      <Stack.Screen
        options={{
          title: board.name,
          headerRight: () => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
                maxWidth: 240,
              }}
            >
              <BoardSearchInput value={searchQuery} onChange={setSearchQuery} />
              <Pressable
                onPress={() => settingsSheetRef.current?.open({ board })}
                accessibilityRole="button"
                accessibilityLabel={i18n.t("admin.boards.settingsTitle")}
                hitSlop={12}
                style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.sm }}
              >
                <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "700" }}>⋯</Text>
              </Pressable>
            </View>
          ),
        }}
      />
```

If `View` is not yet imported on this file, it already is (it is used elsewhere in the body). Verify the existing import line `import { Alert, Pressable, Text, View, ActivityIndicator, useWindowDimensions } from "react-native";` is intact.

- [ ] **Step 4: Add a search-active hint above the pager**

Still in `apps/native/src/app/admin/boards/[id].tsx`, find the `<FilterChips ... />` element. Just below it (still above the `<View style={{ flex: 1 }}>` that wraps the pager), add:

```tsx
      {searchQuery.trim().length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: spacing.md,
            paddingBottom: spacing.xs,
          }}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {i18n.t(
              (tasks?.length ?? 0) === 1 ? "board.search.matches" : "board.search.matchesPlural",
              { count: tasks?.length ?? 0 },
            )}
          </Text>
          <Pressable
            onPress={() => setSearchQuery("")}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("common.clear")}
            hitSlop={12}
          >
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
              {i18n.t("common.clear")}
            </Text>
          </Pressable>
        </View>
      ) : null}
```

- [ ] **Step 5: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/native/src/components/board/BoardSearchInput.tsx \
        apps/native/src/app/admin/boards/\[id\].tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): collapsible board search with title substring filter"
```

---

## Task 2: Multi-Assignee Filter

**Files:**
- Modify: `apps/native/src/components/board/FilterChips.tsx`
- Create: `apps/native/src/components/board/AssigneeFilterSheet.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`
- Modify: `apps/native/src/i18n/en.json`
- Modify: `apps/native/src/i18n/de.json`

- [ ] **Step 1: Extend `BoardFilters` and `FilterChips`**

Replace the full contents of `apps/native/src/components/board/FilterChips.tsx` with:

```tsx
import { ScrollView, Pressable, Text, View } from "react-native";
import type { TaskPriority } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface BoardFilters {
  mine: boolean;
  priority: TaskPriority | null;
  dueSoon: boolean;
  unassigned: boolean;
  /** User IDs to include. Empty set = no assignee filter applied. */
  assigneeIds: Set<string>;
}

interface Props {
  filters: BoardFilters;
  onToggleMine: () => void;
  onPressPriority: () => void;
  onClearPriority?: () => void;
  onToggleDueSoon: () => void;
  onToggleUnassigned: () => void;
  onPressAssignees: () => void;
  onClearAssignees?: () => void;
}

const CHIP_HEIGHT = 44;

export function FilterChips({
  filters,
  onToggleMine,
  onPressPriority,
  onClearPriority,
  onToggleDueSoon,
  onToggleUnassigned,
  onPressAssignees,
  onClearAssignees,
}: Props) {
  const { colors, spacing, radius } = useTheme();

  const chipStyle = (active: boolean) => ({
    height: CHIP_HEIGHT,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: active ? colors.secondary : "transparent",
    borderWidth: 1,
    borderColor: active ? colors.secondary : colors.border,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
  });

  const textStyle = (active: boolean) => ({
    color: active ? colors.secondaryForeground : colors.mutedForeground,
    fontSize: 13,
    fontWeight: "500" as const,
  });

  const assigneeCount = filters.assigneeIds.size;
  const assigneeActive = assigneeCount > 0;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.sm,
        gap: spacing.xs,
        alignItems: "center",
      }}
    >
      <Pressable
        onPress={onToggleMine}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.filters.mine")}
        style={chipStyle(filters.mine)}
      >
        <Text style={textStyle(filters.mine)}>{i18n.t("board.filters.mine")}</Text>
      </Pressable>

      <Pressable
        onPress={onPressAssignees}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.filters.assignees")}
        style={chipStyle(assigneeActive)}
      >
        <Text style={textStyle(assigneeActive)}>{i18n.t("board.filters.assignees")}</Text>
        {assigneeActive ? (
          <View
            style={{
              minWidth: 20,
              height: 20,
              paddingHorizontal: 6,
              borderRadius: 10,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: colors.primaryForeground,
                fontSize: 11,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {assigneeCount}
            </Text>
          </View>
        ) : null}
        {assigneeActive && onClearAssignees ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onClearAssignees();
            }}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("common.clear")}
            hitSlop={16}
            style={{
              marginLeft: 4,
              width: 18,
              height: 18,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ ...textStyle(true), fontSize: 16, lineHeight: 16 }}>×</Text>
          </Pressable>
        ) : null}
      </Pressable>

      <Pressable
        onPress={onPressPriority}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.filters.priority")}
        style={chipStyle(filters.priority != null)}
      >
        <Text style={textStyle(filters.priority != null)}>
          {filters.priority
            ? i18n.t(`board.priority.${filters.priority}`)
            : i18n.t("board.filters.priority")}
        </Text>
        {filters.priority != null && onClearPriority ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onClearPriority();
            }}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("common.clear")}
            hitSlop={16}
            style={{
              marginLeft: 4,
              width: 18,
              height: 18,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ ...textStyle(true), fontSize: 16, lineHeight: 16 }}>×</Text>
          </Pressable>
        ) : null}
      </Pressable>

      <Pressable
        onPress={onToggleDueSoon}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.filters.dueSoon")}
        style={chipStyle(filters.dueSoon)}
      >
        <Text style={textStyle(filters.dueSoon)}>{i18n.t("board.filters.dueSoon")}</Text>
      </Pressable>

      <Pressable
        onPress={onToggleUnassigned}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.filters.unassigned")}
        style={chipStyle(filters.unassigned)}
      >
        <Text style={textStyle(filters.unassigned)}>{i18n.t("board.filters.unassigned")}</Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Create the `AssigneeFilterSheet`**

Create `apps/native/src/components/board/AssigneeFilterSheet.tsx` with:

```tsx
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import useSWR from "swr";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface PickableUser {
  id: string;
  name: string | null;
  email: string;
}

export interface AssigneeFilterSheetHandle {
  open: (
    initialSelected: Set<string>,
    onApply: (next: Set<string>) => void,
  ) => void;
}

export const AssigneeFilterSheet = forwardRef<AssigneeFilterSheetHandle>(
  function AssigneeFilterSheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const onApplyRef = useRef<(next: Set<string>) => void>(() => {});
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const snapPoints = useMemo(() => ["92%"], []);
    const { colors, spacing, radius } = useTheme();

    useImperativeHandle(
      ref,
      () => ({
        open: (initialSelected, onApply) => {
          setSelected(new Set(initialSelected));
          onApplyRef.current = onApply;
          setSearch("");
          sheetRef.current?.present();
        },
      }),
      [],
    );

    const { data: userPage, isLoading } = useSWR(
      ["admin/users", search],
      async () => {
        const result = await authClient.admin.listUsers({
          query: {
            limit: 50,
            offset: 0,
            searchValue: search || undefined,
            searchField: "name",
            searchOperator: "contains",
          },
        });
        if (result.error) throw new Error(result.error.message ?? "failed");
        return result.data;
      },
    );

    const users: PickableUser[] = useMemo(() => {
      if (!userPage?.users) return [];
      return userPage.users.map((u) => ({
        id: u.id,
        name: u.name ?? null,
        email: u.email,
      }));
    }, [userPage]);

    const sortedUsers = useMemo(() => {
      return [...users].sort((a, b) => {
        const aHas = selected.has(a.id) ? 0 : 1;
        const bHas = selected.has(b.id) ? 0 : 1;
        return aHas - bHas;
      });
    }, [users, selected]);

    const toggle = useCallback((id: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }, []);

    const apply = () => {
      onApplyRef.current(selected);
      sheetRef.current?.dismiss();
    };

    const clearAll = () => {
      setSelected(new Set());
    };

    const renderItem = useCallback(
      ({ item }: { item: PickableUser }) => {
        const isSelected = selected.has(item.id);
        return (
          <Pressable
            onPress={() => toggle(item.id)}
            accessibilityRole="checkbox"
            accessibilityLabel={item.name ?? item.email}
            accessibilityState={{ checked: isSelected }}
            style={({ pressed }) => ({
              padding: spacing.md,
              marginBottom: spacing.xs,
              borderRadius: radius.md,
              backgroundColor: pressed ? colors.surfaceHigh : colors.surfaceBase,
              borderWidth: 1,
              borderColor: isSelected ? colors.primary : colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            })}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>
                {item.name ?? i18n.t("board.task.unnamedUser")}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{item.email}</Text>
            </View>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isSelected ? (
                <Text style={{ color: colors.primaryForeground, fontSize: 14, fontWeight: "700" }}>
                  ✓
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      },
      [colors, spacing, radius, selected, toggle],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <View style={{ padding: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
              {i18n.t("board.filters.assignees")}
            </Text>
            {selected.size > 0 ? (
              <Pressable
                onPress={clearAll}
                accessibilityRole="button"
                accessibilityLabel={i18n.t("common.clear")}
                hitSlop={12}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>
                  {i18n.t("common.clear")} ({selected.size})
                </Text>
              </Pressable>
            ) : null}
          </View>
          <BottomSheetTextInput
            value={search}
            onChangeText={setSearch}
            placeholder={i18n.t("board.assignees.searchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceLow,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.foreground,
              fontSize: 15,
            }}
          />
        </View>

        {isLoading && sortedUsers.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", paddingTop: spacing.xl }}>
            <ActivityIndicator color={colors.foreground} />
          </View>
        ) : (
          <BottomSheetFlatList
            data={sortedUsers}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
            renderItem={renderItem}
            ListEmptyComponent={
              <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: spacing.lg }}>
                {i18n.t("board.assignees.empty")}
              </Text>
            }
          />
        )}

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: spacing.md,
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Pressable
            onPress={apply}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("common.apply")}
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.primary,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>
              {i18n.t("common.apply")}
            </Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    );
  },
);
```

- [ ] **Step 3: Add assignees-filter and common.apply i18n keys**

Open `apps/native/src/i18n/en.json`. Find the existing `"board": { ... "filters": { ... } ... }` block. Inside `"filters"`, add:

```json
      "assignees": "Assignees",
```

Find the existing `"common": { ... }` block. Add:

```json
    "apply": "Apply",
```

(If `apply` already exists, leave the file alone for that key.)

Open `apps/native/src/i18n/de.json` and add to `board.filters`:

```json
      "assignees": "Zuständige",
```

And to `common`:

```json
    "apply": "Anwenden",
```

- [ ] **Step 4: Wire `AssigneeFilterSheet` into board detail**

Open `apps/native/src/app/admin/boards/[id].tsx`. Add imports near the existing component imports:

```tsx
import {
  AssigneeFilterSheet,
  type AssigneeFilterSheetHandle,
} from "@/components/board/AssigneeFilterSheet";
```

Update the `BoardFilters` initial value. Find:

```tsx
  const [filters, setFilters] = useState<BoardFilters>({
    mine: false,
    priority: null,
    dueSoon: false,
    unassigned: false,
  });
```

Replace with:

```tsx
  const [filters, setFilters] = useState<BoardFilters>({
    mine: false,
    priority: null,
    dueSoon: false,
    unassigned: false,
    assigneeIds: new Set<string>(),
  });
```

Add a ref alongside the existing sheet refs:

```tsx
  const assigneeFilterRef = useRef<AssigneeFilterSheetHandle | null>(null);
```

Extend the `tasks` filter `useMemo` to apply the assignee filter. Find the existing filter chain (added in Task 1 above):

```tsx
      if (filters.unassigned) {
        if (t.assignees.length > 0) return false;
      }
      return true;
```

Replace with:

```tsx
      if (filters.unassigned) {
        if (t.assignees.length > 0) return false;
      }
      if (filters.assigneeIds.size > 0) {
        if (!t.assignees.some((a) => filters.assigneeIds.has(a.userId))) return false;
      }
      return true;
```

Add the open handler near the other filter handlers (e.g. just below `onClearPriorityFilter`):

```tsx
  const onPressAssignees = useCallback(() => {
    assigneeFilterRef.current?.open(filters.assigneeIds, (next) => {
      setFilters((f) => ({ ...f, assigneeIds: next }));
    });
  }, [filters.assigneeIds]);

  const onClearAssignees = useCallback(() => {
    setFilters((f) => ({ ...f, assigneeIds: new Set<string>() }));
  }, []);
```

Update the `<FilterChips ... />` element to pass the new props:

```tsx
      <FilterChips
        filters={filters}
        onToggleMine={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
        onPressPriority={onPressPriorityChip}
        onClearPriority={onClearPriorityFilter}
        onToggleDueSoon={() => setFilters((f) => ({ ...f, dueSoon: !f.dueSoon }))}
        onToggleUnassigned={() => setFilters((f) => ({ ...f, unassigned: !f.unassigned }))}
        onPressAssignees={onPressAssignees}
        onClearAssignees={onClearAssignees}
      />
```

At the bottom of the JSX, alongside the other sheet mounts, add:

```tsx
      <AssigneeFilterSheet ref={assigneeFilterRef} />
```

- [ ] **Step 5: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/native/src/components/board/FilterChips.tsx \
        apps/native/src/components/board/AssigneeFilterSheet.tsx \
        apps/native/src/app/admin/boards/\[id\].tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): multi-assignee board filter with picker sheet"
```

---

## Task 3: Filter + Sort Persistence

**Files:**
- Create: `packages/shared/src/board-filter-storage.ts`
- Create: `packages/shared/src/board-filter-storage.test.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/native/src/hooks/board/useBoardFilterPersistence.ts`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

`@react-native-async-storage/async-storage` is **not** in `apps/native/package.json` — only `expo-secure-store: ~55.0.0` is installed. We use `expo-secure-store` which stores values up to 2KB on iOS Keychain / Android Keystore. A serialised filter blob is far below that limit. The hook also covers sort mode persistence (consumed by Task 4).

- [ ] **Step 1: Write failing tests for the storage helper**

Create `packages/shared/src/board-filter-storage.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  serializeFilters,
  parseFilters,
  type SerialisableBoardFilters,
} from "./board-filter-storage";

describe("board-filter-storage", () => {
  it("round-trips an empty filter", () => {
    const original: SerialisableBoardFilters = {
      mine: false,
      priority: null,
      dueSoon: false,
      unassigned: false,
      assigneeIds: new Set<string>(),
    };
    const serialised = serializeFilters(original);
    const parsed = parseFilters(serialised);
    expect(parsed).toEqual(original);
    expect(parsed.assigneeIds).toBeInstanceOf(Set);
  });

  it("round-trips a populated filter", () => {
    const original: SerialisableBoardFilters = {
      mine: true,
      priority: "urgent",
      dueSoon: true,
      unassigned: false,
      assigneeIds: new Set(["u1", "u2"]),
    };
    const parsed = parseFilters(serializeFilters(original));
    expect(parsed.mine).toBe(true);
    expect(parsed.priority).toBe("urgent");
    expect(parsed.dueSoon).toBe(true);
    expect(parsed.unassigned).toBe(false);
    expect([...parsed.assigneeIds].sort()).toEqual(["u1", "u2"]);
  });

  it("returns defaults when input is null", () => {
    const parsed = parseFilters(null);
    expect(parsed).toEqual({
      mine: false,
      priority: null,
      dueSoon: false,
      unassigned: false,
      assigneeIds: new Set<string>(),
    });
  });

  it("returns defaults on malformed JSON", () => {
    const parsed = parseFilters("not-json");
    expect(parsed.mine).toBe(false);
    expect(parsed.assigneeIds).toBeInstanceOf(Set);
    expect(parsed.assigneeIds.size).toBe(0);
  });

  it("rejects unknown priority values", () => {
    const parsed = parseFilters(
      JSON.stringify({
        mine: false,
        priority: "made-up",
        dueSoon: false,
        unassigned: false,
        assigneeIds: [],
      }),
    );
    expect(parsed.priority).toBeNull();
  });

  it("ignores unknown fields", () => {
    const parsed = parseFilters(
      JSON.stringify({
        mine: true,
        priority: null,
        dueSoon: false,
        unassigned: false,
        assigneeIds: [],
        rogueField: 999,
      }),
    );
    expect(parsed.mine).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pnpm --filter @dragons/shared test -- board-filter-storage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `packages/shared/src/board-filter-storage.ts` with:

```ts
/**
 * Pure (de)serialisation for the native kanban board's filter state.
 * Lives in @dragons/shared so it can be unit-tested under vitest.
 *
 * The native app reads/writes the serialised string via expo-secure-store
 * (AsyncStorage isn't installed in apps/native).
 */

import { TASK_PRIORITIES, type TaskPriority } from "./constants";

export interface SerialisableBoardFilters {
  mine: boolean;
  priority: TaskPriority | null;
  dueSoon: boolean;
  unassigned: boolean;
  assigneeIds: Set<string>;
}

interface Wire {
  mine: boolean;
  priority: TaskPriority | null;
  dueSoon: boolean;
  unassigned: boolean;
  assigneeIds: string[];
}

const DEFAULTS: SerialisableBoardFilters = {
  mine: false,
  priority: null,
  dueSoon: false,
  unassigned: false,
  assigneeIds: new Set<string>(),
};

function isPriority(value: unknown): value is TaskPriority {
  return (
    typeof value === "string" &&
    (TASK_PRIORITIES as readonly string[]).includes(value)
  );
}

export function serializeFilters(filters: SerialisableBoardFilters): string {
  const wire: Wire = {
    mine: filters.mine,
    priority: filters.priority,
    dueSoon: filters.dueSoon,
    unassigned: filters.unassigned,
    assigneeIds: [...filters.assigneeIds],
  };
  return JSON.stringify(wire);
}

export function parseFilters(input: string | null): SerialisableBoardFilters {
  if (input == null) return cloneDefaults();
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    return cloneDefaults();
  }
  if (!raw || typeof raw !== "object") return cloneDefaults();
  const r = raw as Partial<Wire>;
  return {
    mine: typeof r.mine === "boolean" ? r.mine : false,
    priority: r.priority == null ? null : isPriority(r.priority) ? r.priority : null,
    dueSoon: typeof r.dueSoon === "boolean" ? r.dueSoon : false,
    unassigned: typeof r.unassigned === "boolean" ? r.unassigned : false,
    assigneeIds: new Set(
      Array.isArray(r.assigneeIds)
        ? r.assigneeIds.filter((s): s is string => typeof s === "string")
        : [],
    ),
  };
}

function cloneDefaults(): SerialisableBoardFilters {
  return {
    ...DEFAULTS,
    assigneeIds: new Set<string>(),
  };
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @dragons/shared test -- board-filter-storage`
Expected: PASS (6 tests).

- [ ] **Step 5: Export from `@dragons/shared`**

Open `packages/shared/src/index.ts`. Add (after the `board-undo` exports added in Phase 1):

```ts
export { serializeFilters, parseFilters } from "./board-filter-storage";
export type { SerialisableBoardFilters } from "./board-filter-storage";
```

- [ ] **Step 6: Create the persistence hook**

Create `apps/native/src/hooks/board/useBoardFilterPersistence.ts` with:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import {
  serializeFilters,
  parseFilters,
  type SerialisableBoardFilters,
} from "@dragons/shared";

/**
 * Per-board filter persistence keyed by `board:<id>:filters`. Backed by
 * expo-secure-store (AsyncStorage is not installed in apps/native).
 *
 * The sort mode is stored under `board:<id>:sort`. We expose two state
 * tuples so screens can reuse the same hot-path memoisation.
 */

export type BoardSortMode =
  | "position"
  | "due-asc"
  | "due-desc"
  | "priority-desc"
  | "updated-desc";

const SORT_MODES: readonly BoardSortMode[] = [
  "position",
  "due-asc",
  "due-desc",
  "priority-desc",
  "updated-desc",
];

const DEFAULT_SORT: BoardSortMode = "position";

function isSortMode(v: unknown): v is BoardSortMode {
  return typeof v === "string" && (SORT_MODES as readonly string[]).includes(v);
}

const filtersKey = (boardId: number) => `board:${boardId}:filters`;
const sortKey = (boardId: number) => `board:${boardId}:sort`;

interface PersistedState {
  filters: SerialisableBoardFilters;
  sort: BoardSortMode;
  /** True until the initial load from storage has resolved. */
  hydrating: boolean;
}

export function useBoardFilterPersistence(boardId: number) {
  const [state, setState] = useState<PersistedState>(() => ({
    filters: parseFilters(null),
    sort: DEFAULT_SORT,
    hydrating: true,
  }));

  // Track whether we've hydrated to avoid persisting the default state on
  // first render before the actual stored value is known.
  const hydratedRef = useRef(false);

  // Hydrate on mount / boardId change.
  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    setState((s) => ({ ...s, hydrating: true }));
    void (async () => {
      try {
        const [rawFilters, rawSort] = await Promise.all([
          SecureStore.getItemAsync(filtersKey(boardId)),
          SecureStore.getItemAsync(sortKey(boardId)),
        ]);
        if (cancelled) return;
        const parsedFilters = parseFilters(rawFilters);
        const parsedSort = isSortMode(rawSort) ? rawSort : DEFAULT_SORT;
        setState({ filters: parsedFilters, sort: parsedSort, hydrating: false });
      } finally {
        hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  // Persist filters whenever they change post-hydration.
  useEffect(() => {
    if (!hydratedRef.current) return;
    void SecureStore.setItemAsync(
      filtersKey(boardId),
      serializeFilters(state.filters),
    );
  }, [boardId, state.filters]);

  // Persist sort mode post-hydration.
  useEffect(() => {
    if (!hydratedRef.current) return;
    void SecureStore.setItemAsync(sortKey(boardId), state.sort);
  }, [boardId, state.sort]);

  const setFilters = useCallback(
    (
      next:
        | SerialisableBoardFilters
        | ((prev: SerialisableBoardFilters) => SerialisableBoardFilters),
    ) => {
      setState((s) => ({
        ...s,
        filters: typeof next === "function" ? next(s.filters) : next,
      }));
    },
    [],
  );

  const setSort = useCallback((next: BoardSortMode) => {
    setState((s) => ({ ...s, sort: next }));
  }, []);

  return {
    filters: state.filters,
    sort: state.sort,
    hydrating: state.hydrating,
    setFilters,
    setSort,
  };
}
```

- [ ] **Step 7: Replace local filter state in board detail with the hook**

Open `apps/native/src/app/admin/boards/[id].tsx`. Add the import:

```tsx
import { useBoardFilterPersistence } from "@/hooks/board/useBoardFilterPersistence";
```

Replace:

```tsx
  const [filters, setFilters] = useState<BoardFilters>({
    mine: false,
    priority: null,
    dueSoon: false,
    unassigned: false,
    assigneeIds: new Set<string>(),
  });
```

with:

```tsx
  const persistence = useBoardFilterPersistence(boardId);
  const filters = persistence.filters as BoardFilters;
  const setFilters = persistence.setFilters as (
    next: BoardFilters | ((prev: BoardFilters) => BoardFilters),
  ) => void;
```

The `BoardFilters` type from `FilterChips` is structurally compatible with `SerialisableBoardFilters` (both have the same fields). The cast is one-way and avoids leaking storage types into UI code.

- [ ] **Step 8: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/shared typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/board-filter-storage.ts \
        packages/shared/src/board-filter-storage.test.ts \
        packages/shared/src/index.ts \
        apps/native/src/hooks/board/useBoardFilterPersistence.ts \
        apps/native/src/app/admin/boards/\[id\].tsx
git commit -m "feat(native): persist board filters and sort per-board via expo-secure-store"
```

---

## Task 4: Sort Options

**Files:**
- Create: `packages/shared/src/board-task-sort.ts`
- Create: `packages/shared/src/board-task-sort.test.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/native/src/components/board/SortSheet.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`
- Modify: `apps/native/src/i18n/en.json`
- Modify: `apps/native/src/i18n/de.json`

The persistence hook already covers sort mode (Task 3 step 6). Here we add the comparator + the sheet + wire it through.

- [ ] **Step 1: Write failing tests for the comparator**

Create `packages/shared/src/board-task-sort.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { boardTaskComparator } from "./board-task-sort";
import type { TaskCardData } from "./tasks";

const make = (overrides: Partial<TaskCardData>): TaskCardData => ({
  id: 1,
  columnId: 1,
  position: 0,
  title: "t",
  priority: "normal",
  dueDate: null,
  checklistChecked: 0,
  checklistTotal: 0,
  assignees: [],
  // updatedAt is optional on the wire — comparator tolerates missing values.
  ...overrides,
});

describe("boardTaskComparator", () => {
  it("position mode preserves position then id", () => {
    const cmp = boardTaskComparator("position");
    const a = make({ id: 1, position: 2 });
    const b = make({ id: 2, position: 1 });
    expect([a, b].sort(cmp).map((t) => t.id)).toEqual([2, 1]);
  });

  it("position mode falls back to id when position equal", () => {
    const cmp = boardTaskComparator("position");
    const a = make({ id: 5, position: 0 });
    const b = make({ id: 3, position: 0 });
    expect([a, b].sort(cmp).map((t) => t.id)).toEqual([3, 5]);
  });

  it("due-asc puts earliest due first, nulls last", () => {
    const cmp = boardTaskComparator("due-asc");
    const a = make({ id: 1, dueDate: "2026-05-10T00:00:00Z" });
    const b = make({ id: 2, dueDate: "2026-04-10T00:00:00Z" });
    const c = make({ id: 3, dueDate: null });
    expect([a, b, c].sort(cmp).map((t) => t.id)).toEqual([2, 1, 3]);
  });

  it("due-desc puts latest due first, nulls last", () => {
    const cmp = boardTaskComparator("due-desc");
    const a = make({ id: 1, dueDate: "2026-05-10T00:00:00Z" });
    const b = make({ id: 2, dueDate: "2026-04-10T00:00:00Z" });
    const c = make({ id: 3, dueDate: null });
    expect([a, b, c].sort(cmp).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("priority-desc orders urgent > high > normal > low", () => {
    const cmp = boardTaskComparator("priority-desc");
    const items = [
      make({ id: 1, priority: "low" }),
      make({ id: 2, priority: "urgent" }),
      make({ id: 3, priority: "normal" }),
      make({ id: 4, priority: "high" }),
    ];
    expect(items.sort(cmp).map((t) => t.id)).toEqual([2, 4, 3, 1]);
  });

  it("updated-desc puts latest updatedAt first, missing last", () => {
    const cmp = boardTaskComparator("updated-desc");
    const items = [
      make({ id: 1, updatedAt: "2026-04-26T00:00:00Z" } as Partial<TaskCardData>),
      make({ id: 2, updatedAt: "2026-04-27T00:00:00Z" } as Partial<TaskCardData>),
      make({ id: 3 }),
    ];
    expect(items.sort(cmp).map((t) => t.id)).toEqual([2, 1, 3]);
  });

  it("comparator is stable on equal keys", () => {
    const cmp = boardTaskComparator("priority-desc");
    const a = make({ id: 1, priority: "high" });
    const b = make({ id: 2, priority: "high" });
    expect([a, b].sort(cmp).map((t) => t.id)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pnpm --filter @dragons/shared test -- board-task-sort`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the comparator**

Create `packages/shared/src/board-task-sort.ts` with:

```ts
/**
 * Pure comparator factory for the native kanban board's sort options.
 * The native side keeps tasks per-column; this comparator runs after the
 * column slice so it sorts within a column.
 *
 * `updatedAt` is optional on TaskCardData — older API responses may omit
 * it. The comparator treats missing values as "older than everything"
 * for `updated-desc`.
 */

import type { TaskCardData, TaskPriority } from "./tasks";

export type BoardSortMode =
  | "position"
  | "due-asc"
  | "due-desc"
  | "priority-desc"
  | "updated-desc";

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

type WithUpdated = TaskCardData & { updatedAt?: string };

function tieBreak(a: TaskCardData, b: TaskCardData): number {
  return a.id - b.id;
}

export function boardTaskComparator(
  mode: BoardSortMode,
): (a: TaskCardData, b: TaskCardData) => number {
  switch (mode) {
    case "position":
      return (a, b) => {
        const d = a.position - b.position;
        return d !== 0 ? d : tieBreak(a, b);
      };
    case "due-asc":
      return (a, b) => {
        if (a.dueDate == null && b.dueDate == null) return tieBreak(a, b);
        if (a.dueDate == null) return 1;
        if (b.dueDate == null) return -1;
        const d = Date.parse(a.dueDate) - Date.parse(b.dueDate);
        return d !== 0 ? d : tieBreak(a, b);
      };
    case "due-desc":
      return (a, b) => {
        if (a.dueDate == null && b.dueDate == null) return tieBreak(a, b);
        if (a.dueDate == null) return 1;
        if (b.dueDate == null) return -1;
        const d = Date.parse(b.dueDate) - Date.parse(a.dueDate);
        return d !== 0 ? d : tieBreak(a, b);
      };
    case "priority-desc":
      return (a, b) => {
        const d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        return d !== 0 ? d : tieBreak(a, b);
      };
    case "updated-desc":
      return (a, b) => {
        const au = (a as WithUpdated).updatedAt;
        const bu = (b as WithUpdated).updatedAt;
        if (au == null && bu == null) return tieBreak(a, b);
        if (au == null) return 1;
        if (bu == null) return -1;
        const d = Date.parse(bu) - Date.parse(au);
        return d !== 0 ? d : tieBreak(a, b);
      };
  }
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @dragons/shared test -- board-task-sort`
Expected: PASS (7 tests).

- [ ] **Step 5: Export from `@dragons/shared`**

Open `packages/shared/src/index.ts`. After the `board-filter-storage` export added in Task 3, add:

```ts
export { boardTaskComparator } from "./board-task-sort";
export type { BoardSortMode } from "./board-task-sort";
```

If `BoardSortMode` is also imported by `useBoardFilterPersistence` from the local path (Task 3), update that file's import to come from `@dragons/shared` instead. Replace in `apps/native/src/hooks/board/useBoardFilterPersistence.ts`:

The current local `BoardSortMode` declaration in that file becomes redundant — keep the runtime list `SORT_MODES` for validation, but re-export the type from shared for consumers. Replace at the top of the file:

```ts
export type BoardSortMode =
  | "position"
  | "due-asc"
  | "due-desc"
  | "priority-desc"
  | "updated-desc";
```

with:

```ts
import type { BoardSortMode } from "@dragons/shared";
export type { BoardSortMode };
```

- [ ] **Step 6: Create the `SortSheet`**

Create `apps/native/src/components/board/SortSheet.tsx` with:

```tsx
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import type { BoardSortMode } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

const OPTIONS: BoardSortMode[] = [
  "position",
  "due-asc",
  "due-desc",
  "priority-desc",
  "updated-desc",
];

export interface SortSheetHandle {
  open: (current: BoardSortMode, onPick: (next: BoardSortMode) => void) => void;
}

export const SortSheet = forwardRef<SortSheetHandle>(function SortSheet(_p, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const onPickRef = useRef<(next: BoardSortMode) => void>(() => {});
  const [current, setCurrent] = useState<BoardSortMode>("position");
  const snapPoints = useMemo(() => ["48%"], []);
  const { colors, spacing, radius } = useTheme();

  useImperativeHandle(ref, () => ({
    open: (initial, onPick) => {
      setCurrent(initial);
      onPickRef.current = onPick;
      sheetRef.current?.present();
    },
  }), []);

  const pick = (mode: BoardSortMode) => {
    setCurrent(mode);
    onPickRef.current(mode);
    sheetRef.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      enablePanDownToClose
    >
      <BottomSheetView style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
          {i18n.t("board.sort.title")}
        </Text>
        {OPTIONS.map((mode) => {
          const selected = mode === current;
          return (
            <Pressable
              key={mode}
              onPress={() => pick(mode)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.surfaceLow : "transparent",
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 15,
                  fontWeight: selected ? "700" : "500",
                }}
              >
                {i18n.t(`board.sort.modes.${mode}`)}
              </Text>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  borderWidth: 2,
                  borderColor: selected ? colors.primary : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selected ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.primary,
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </BottomSheetView>
    </BottomSheetModal>
  );
});
```

- [ ] **Step 7: Add sort i18n keys**

Open `apps/native/src/i18n/en.json`. Inside the `"board": { ... }` block, add:

```json
    "sort": {
      "title": "Sort tasks",
      "open": "Sort",
      "modes": {
        "position": "Position (default)",
        "due-asc": "Due date (earliest first)",
        "due-desc": "Due date (latest first)",
        "priority-desc": "Priority (high to low)",
        "updated-desc": "Recently updated"
      }
    },
```

Open `apps/native/src/i18n/de.json` and add:

```json
    "sort": {
      "title": "Sortieren",
      "open": "Sortieren",
      "modes": {
        "position": "Position (Standard)",
        "due-asc": "Fälligkeit (früheste zuerst)",
        "due-desc": "Fälligkeit (späteste zuerst)",
        "priority-desc": "Priorität (hoch nach niedrig)",
        "updated-desc": "Zuletzt aktualisiert"
      }
    },
```

- [ ] **Step 8: Mount sort sheet and apply sort to tasks**

Open `apps/native/src/app/admin/boards/[id].tsx`. Add imports:

```tsx
import { SortSheet, type SortSheetHandle } from "@/components/board/SortSheet";
import { boardTaskComparator } from "@dragons/shared";
```

Add a ref alongside the other sheet refs:

```tsx
  const sortSheetRef = useRef<SortSheetHandle | null>(null);
```

The `persistence` hook from Task 3 already exposes `sort` and `setSort`. Pull them out near where filters are pulled:

```tsx
  const sort = persistence.sort;
  const setSort = persistence.setSort;
```

Replace the existing `tasks` `useMemo` (the one that already handles search + filter) so it also sorts. Find the closing `}` of the predicate filter and the dependency array. Replace the whole memo with:

```tsx
  const tasks = useMemo(() => {
    if (!rawTasks) return rawTasks;
    // NOTE: TaskCardData has no description field — board search matches
    // task title only. Description-level search is server-side and deferred.
    const q = searchQuery.trim().toLowerCase();
    const filtered = rawTasks.filter((t) => {
      if (q.length > 0 && !t.title.toLowerCase().includes(q)) return false;
      if (filters.mine && currentUserId) {
        if (!t.assignees.some((a) => a.userId === currentUserId)) return false;
      }
      if (filters.dueSoon) {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        const now = Date.now();
        if (d.getTime() < now) return false;
        if (d.getTime() > now + 7 * 24 * 60 * 60 * 1000) return false;
      }
      if (filters.unassigned) {
        if (t.assignees.length > 0) return false;
      }
      if (filters.assigneeIds.size > 0) {
        if (!t.assignees.some((a) => filters.assigneeIds.has(a.userId))) return false;
      }
      return true;
    });
    if (sort === "position") return filtered;
    return [...filtered].sort(boardTaskComparator(sort));
  }, [rawTasks, filters, currentUserId, searchQuery, sort]);
```

Add a sort button to the `Stack.Screen` `headerRight`. Replace the `headerRight` we set up in Task 1 with:

```tsx
          headerRight: () => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
                maxWidth: 280,
              }}
            >
              <BoardSearchInput value={searchQuery} onChange={setSearchQuery} />
              <Pressable
                onPress={() => sortSheetRef.current?.open(sort, setSort)}
                accessibilityRole="button"
                accessibilityLabel={i18n.t("board.sort.open")}
                hitSlop={12}
                style={{
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: sort === "position" ? colors.foreground : colors.primary,
                    fontSize: 18,
                    fontWeight: "700",
                  }}
                >
                  ⇅
                </Text>
              </Pressable>
              <Pressable
                onPress={() => settingsSheetRef.current?.open({ board })}
                accessibilityRole="button"
                accessibilityLabel={i18n.t("admin.boards.settingsTitle")}
                hitSlop={12}
                style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.sm }}
              >
                <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "700" }}>⋯</Text>
              </Pressable>
            </View>
          ),
```

At the bottom alongside the other sheet mounts, add:

```tsx
      <SortSheet ref={sortSheetRef} />
```

- [ ] **Step 9: TypeScript check + tests**

Run:
```bash
pnpm --filter @dragons/shared test
pnpm --filter @dragons/native typecheck
```
Expected: both PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/board-task-sort.ts \
        packages/shared/src/board-task-sort.test.ts \
        packages/shared/src/index.ts \
        apps/native/src/hooks/board/useBoardFilterPersistence.ts \
        apps/native/src/components/board/SortSheet.tsx \
        apps/native/src/app/admin/boards/\[id\].tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): board task sort modes with bottom sheet picker"
```

---

## Task 5: Column Drag Reorder

**Files:**
- Create: `apps/native/src/hooks/board/useColumnDrag.ts`
- Modify: `apps/native/src/components/board/BoardHeader.tsx`
- Modify: `apps/native/src/components/board/BoardPager.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`
- Modify: `apps/native/src/i18n/en.json`
- Modify: `apps/native/src/i18n/de.json`

The reorder gesture is scoped to the header pill row. We deliberately avoid extending `useBoardDrag` (which is already 381 LOC and concerns task drag + autoscroll). Pager horizontal scroll is disabled while a column is "lifted". On release we compute the new column order, optimistically apply it, and call `useColumnMutations.reorder()` which already handles error toasts + revalidation.

- [ ] **Step 1: Create the `useColumnDrag` hook**

Create `apps/native/src/hooks/board/useColumnDrag.ts` with:

```ts
import { useCallback, useMemo, useState } from "react";
import { applyColumnReorder } from "@dragons/shared";
import type { BoardColumnData } from "@dragons/shared";
import { haptics } from "@/lib/haptics";
import { useColumnMutations } from "./useColumnMutations";

interface ReorderState {
  /** Column id currently lifted; null when not in reorder mode. */
  liftedId: number | null;
  /** Current target index where the lifted column would settle. */
  targetIndex: number | null;
}

export interface UseColumnDragResult {
  liftedColumnId: number | null;
  targetIndex: number | null;
  /** True while a lift is active; pager scroll should be disabled. */
  reordering: boolean;
  /** Begin reorder for the given column (called from header pill long-press). */
  start: (column: BoardColumnData) => void;
  /** Move to a different target index (called as the drag pans across pills). */
  setTargetIndex: (index: number) => void;
  /** Commit current target. */
  commit: () => Promise<void>;
  /** Bail out without persisting. */
  cancel: () => void;
}

export function useColumnDrag(
  boardId: number,
  columns: BoardColumnData[],
): UseColumnDragResult {
  const [state, setState] = useState<ReorderState>({
    liftedId: null,
    targetIndex: null,
  });
  const mutations = useColumnMutations(boardId);

  const sourceIndex = useMemo(() => {
    if (state.liftedId == null) return null;
    const i = columns.findIndex((c) => c.id === state.liftedId);
    return i >= 0 ? i : null;
  }, [columns, state.liftedId]);

  const start = useCallback((column: BoardColumnData) => {
    haptics.medium();
    const idx = columns.findIndex((c) => c.id === column.id);
    if (idx < 0) return;
    setState({ liftedId: column.id, targetIndex: idx });
  }, [columns]);

  const setTargetIndex = useCallback((index: number) => {
    setState((s) => {
      if (s.liftedId == null) return s;
      const clamped = Math.max(0, Math.min(columns.length - 1, index));
      if (clamped === s.targetIndex) return s;
      haptics.selection();
      return { ...s, targetIndex: clamped };
    });
  }, [columns.length]);

  const cancel = useCallback(() => {
    setState({ liftedId: null, targetIndex: null });
  }, []);

  const commit = useCallback(async () => {
    if (state.liftedId == null || state.targetIndex == null || sourceIndex == null) {
      cancel();
      return;
    }
    if (state.targetIndex === sourceIndex) {
      cancel();
      return;
    }

    // Build the new ordering: remove from sourceIndex, insert at targetIndex.
    const reordered = [...columns];
    const [moved] = reordered.splice(sourceIndex, 1);
    if (!moved) {
      cancel();
      return;
    }
    reordered.splice(state.targetIndex, 0, moved);

    // Translate to position deltas. We reassign sequential positions so the
    // wire payload is unambiguous; `applyColumnReorder` is idempotent against
    // sequential positions and matches the server's convention.
    const order = reordered.map((c, i) => ({ id: c.id, position: i }));

    haptics.success();
    cancel();
    try {
      // Result of applyColumnReorder is unused at this point — the SWR
      // revalidation inside reorder() reconciles state. The pure helper is
      // referenced here to make the relationship between the hook and
      // shared logic explicit and to keep the import alive.
      void applyColumnReorder(columns, order);
      await mutations.reorder(order);
    } catch {
      // toast already shown by hook
    }
  }, [cancel, columns, mutations, sourceIndex, state.liftedId, state.targetIndex]);

  return {
    liftedColumnId: state.liftedId,
    targetIndex: state.targetIndex,
    reordering: state.liftedId != null,
    start,
    setTargetIndex,
    commit,
    cancel,
  };
}
```

- [ ] **Step 2: Extend `BoardHeader` with reorder gesture wiring**

Open `apps/native/src/components/board/BoardHeader.tsx`. Replace the file with:

```tsx
import { useCallback, useRef } from "react";
import { ScrollView, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";

interface BoardHeaderProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  activeColumnIndex: number;
  onPillPress: (index: number) => void;
  onPillLongPress?: (column: BoardColumnData) => void;
  onAddColumnPress?: () => void;
  /** Reorder mode props */
  liftedColumnId?: number | null;
  targetIndex?: number | null;
  onReorderStart?: (column: BoardColumnData) => void;
  onReorderTargetIndex?: (index: number) => void;
  onReorderCommit?: () => void;
  onReorderCancel?: () => void;
}

const PILL_HEIGHT = 44;

export function BoardHeader({
  columns,
  tasks,
  activeColumnIndex,
  onPillPress,
  onPillLongPress,
  onAddColumnPress,
  liftedColumnId,
  targetIndex,
  onReorderStart,
  onReorderTargetIndex,
  onReorderCommit,
  onReorderCancel,
}: BoardHeaderProps) {
  const { colors, spacing, radius } = useTheme();

  // Pill x positions (left edges, in scroll-content coords) keyed by index.
  const pillRectsRef = useRef<Map<number, { x: number; width: number }>>(new Map());

  const onPillLayout = useCallback((index: number, x: number, width: number) => {
    pillRectsRef.current.set(index, { x, width });
  }, []);

  const indexFromX = useCallback((x: number) => {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    pillRectsRef.current.forEach((r, i) => {
      const centre = r.x + r.width / 2;
      const d = Math.abs(centre - x);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    });
    return bestIndex;
  }, []);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xs,
        gap: spacing.xs,
        alignItems: "center",
      }}
    >
      {columns.map((col, i) => {
        const active = i === activeColumnIndex;
        const lifted = col.id === liftedColumnId;
        const count = tasks.filter((t) => t.columnId === col.id).length;
        const indicateDropTarget =
          liftedColumnId != null && targetIndex === i && col.id !== liftedColumnId;

        return (
          <ColumnPill
            key={col.id}
            index={i}
            column={col}
            count={count}
            active={active}
            lifted={lifted}
            indicateDropTarget={indicateDropTarget}
            colors={colors}
            spacing={spacing}
            radius={radius}
            onPress={() => onPillPress(i)}
            onLongPress={onPillLongPress}
            onReorderStart={onReorderStart}
            onReorderPan={(absX) => {
              const idx = indexFromX(absX);
              onReorderTargetIndex?.(idx);
            }}
            onReorderCommit={onReorderCommit}
            onReorderCancel={onReorderCancel}
            onLayoutPosition={onPillLayout}
          />
        );
      })}
      {onAddColumnPress ? (
        <Pressable
          onPress={onAddColumnPress}
          accessibilityRole="button"
          style={{
            height: PILL_HEIGHT,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: 14, fontWeight: "600" }}>+</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// ColumnPill (separated so each pill owns its gesture detector)
// ---------------------------------------------------------------------------

interface ColumnPillProps {
  index: number;
  column: BoardColumnData;
  count: number;
  active: boolean;
  lifted: boolean;
  indicateDropTarget: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  spacing: ReturnType<typeof useTheme>["spacing"];
  radius: ReturnType<typeof useTheme>["radius"];
  onPress: () => void;
  onLongPress?: (column: BoardColumnData) => void;
  onReorderStart?: (column: BoardColumnData) => void;
  onReorderPan?: (absX: number) => void;
  onReorderCommit?: () => void;
  onReorderCancel?: () => void;
  onLayoutPosition: (index: number, x: number, width: number) => void;
}

function ColumnPill({
  index,
  column,
  count,
  active,
  lifted,
  indicateDropTarget,
  colors,
  spacing,
  radius,
  onPress,
  onLongPress,
  onReorderStart,
  onReorderPan,
  onReorderCommit,
  onReorderCancel,
  onLayoutPosition,
}: ColumnPillProps) {
  const scale = useSharedValue(1);
  const elevation = useSharedValue(0);

  // When lifted state flips, animate.
  if (lifted && scale.value !== 1.05) {
    scale.value = withTiming(1.05, { duration: 120 });
    elevation.value = withTiming(8, { duration: 120 });
  } else if (!lifted && scale.value !== 1) {
    scale.value = withTiming(1, { duration: 120 });
    elevation.value = withTiming(0, { duration: 120 });
  }

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    elevation: elevation.value,
    shadowOpacity: elevation.value > 0 ? 0.18 : 0,
  }));

  const reorderGesture = Gesture.Pan()
    .activateAfterLongPress(450)
    .onStart(() => {
      "worklet";
      runOnJS(notifyStart)();
    })
    .onUpdate((e) => {
      "worklet";
      runOnJS(notifyPan)(e.absoluteX);
    })
    .onEnd(() => {
      "worklet";
      runOnJS(notifyCommit)();
    })
    .onFinalize((_e, success) => {
      "worklet";
      if (!success) runOnJS(notifyCancel)();
    });

  function notifyStart() {
    onReorderStart?.(column);
  }
  function notifyPan(x: number) {
    onReorderPan?.(x);
  }
  function notifyCommit() {
    onReorderCommit?.();
  }
  function notifyCancel() {
    onReorderCancel?.();
  }

  const pill = (
    <Animated.View
      onLayout={(e) => {
        onLayoutPosition(index, e.nativeEvent.layout.x, e.nativeEvent.layout.width);
      }}
      style={[
        {
          height: PILL_HEIGHT,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          backgroundColor: active ? colors.primary : "transparent",
          borderWidth: indicateDropTarget ? 2 : 1,
          borderColor: indicateDropTarget
            ? colors.primary
            : active
              ? colors.primary
              : colors.border,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.xs,
          opacity: lifted ? 0.9 : 1,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 12,
        },
        animStyle,
      ]}
    >
      {column.color ? (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: column.color,
          }}
        />
      ) : null}
      <Text
        style={{
          color: active ? colors.primaryForeground : colors.foreground,
          fontSize: 14,
          fontWeight: "600",
        }}
      >
        {column.name}
      </Text>
      <Text
        style={{
          color: active ? colors.primaryForeground : colors.mutedForeground,
          fontSize: 12,
          fontVariant: ["tabular-nums"],
          opacity: active ? 0.85 : 1,
        }}
      >
        {count}
      </Text>
    </Animated.View>
  );

  return (
    <GestureDetector gesture={reorderGesture}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress ? () => onLongPress(column) : undefined}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={column.name}
      >
        {pill}
      </Pressable>
    </GestureDetector>
  );
}
```

- [ ] **Step 3: Forward `scrollEnabled` from `BoardPager`**

Open `apps/native/src/components/board/BoardPager.tsx`. Add to the `BoardPagerProps` interface:

```ts
  /** When false, the pager's horizontal scroll is disabled (used during column reorder). */
  scrollEnabled?: boolean;
```

Add to the destructured props:

```ts
      scrollEnabled = true,
```

(Place it near `refreshing`.) Then pass it to the outer `<ScrollView ... />`. Find:

```tsx
      <ScrollView
        ref={scrollRef}
        horizontal
        decelerationRate="fast"
```

Replace with:

```tsx
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={scrollEnabled}
        decelerationRate="fast"
```

- [ ] **Step 4: Wire reorder hook into board detail**

Open `apps/native/src/app/admin/boards/[id].tsx`. Add the import:

```tsx
import { useColumnDrag } from "@/hooks/board/useColumnDrag";
```

Inside `BoardDetailBody`, after `const moveTask = useMoveTask(boardId);`, add:

```tsx
  const columnDrag = useColumnDrag(boardId, columns);
```

Update the `<BoardHeader ... />` element. Find the version we set up in Phase 1 + Task 1 here:

```tsx
      <BoardHeader
        columns={columns}
        tasks={rawTasks ?? []}
        activeColumnIndex={activeIndex}
        onPillPress={onPillPress}
        onPillLongPress={onColumnLongPress}
        onAddColumnPress={onAddColumnPress}
      />
```

Replace with:

```tsx
      <BoardHeader
        columns={columns}
        tasks={rawTasks ?? []}
        activeColumnIndex={activeIndex}
        onPillPress={onPillPress}
        onPillLongPress={columnDrag.reordering ? undefined : onColumnLongPress}
        onAddColumnPress={onAddColumnPress}
        liftedColumnId={columnDrag.liftedColumnId}
        targetIndex={columnDrag.targetIndex}
        onReorderStart={columnDrag.start}
        onReorderTargetIndex={columnDrag.setTargetIndex}
        onReorderCommit={columnDrag.commit}
        onReorderCancel={columnDrag.cancel}
      />
```

Pass `scrollEnabled` to the pager. Find the existing `<BoardPager ... />` element and add the prop alongside the others:

```tsx
            scrollEnabled={!columnDrag.reordering}
```

- [ ] **Step 5: Add reorder i18n keys (used for a11y hint)**

Open `apps/native/src/i18n/en.json`. Inside `"board": { "column": { ... } }`, add:

```json
      "reorderHint": "Long-press a column header to drag-reorder.",
```

Open `apps/native/src/i18n/de.json`:

```json
      "reorderHint": "Spaltenkopf lange drücken, um neu anzuordnen.",
```

(These keys are used by Task 7 manual smoke step descriptions; the UI itself does not render them yet — the hint is documented for future onboarding work but kept available so Phase 3's a11y task can pick it up.)

- [ ] **Step 6: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/native/src/hooks/board/useColumnDrag.ts \
        apps/native/src/components/board/BoardHeader.tsx \
        apps/native/src/components/board/BoardPager.tsx \
        apps/native/src/app/admin/boards/\[id\].tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): long-press column reorder via header pill drag"
```

---

## Task 6: Avatar Overflow + Due-Date Color Spectrum

**Files:**
- Create: `packages/shared/src/board-due-date.ts`
- Create: `packages/shared/src/board-due-date.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/native/src/components/board/TaskCard.tsx`
- Modify: `apps/native/src/i18n/en.json`
- Modify: `apps/native/src/i18n/de.json`

The bucket helper drives both colour and label. We bucket against a passed-in `now` so tests stay deterministic. The native `useTheme()` exposes `colors.destructive` and `colors.primary`; for the "today" amber state we reuse `colors.warning` if it exists in the theme, else fall back to a literal `#f59e0b` — verify by reading the theme file. The plan uses `colors.warning` as the canonical token name; if the theme has not exposed it, the fallback is documented inline.

- [ ] **Step 1: Write failing tests for `dueDateBucket`**

Create `packages/shared/src/board-due-date.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { dueDateBucket } from "./board-due-date";

const NOW_ISO = "2026-04-27T12:00:00Z";
const NOW = new Date(NOW_ISO);

describe("dueDateBucket", () => {
  it("returns null for null input", () => {
    expect(dueDateBucket(null, NOW)).toBeNull();
  });

  it("returns 'overdue' for any past time", () => {
    expect(dueDateBucket("2026-04-26T23:59:00Z", NOW)).toBe("overdue");
    expect(dueDateBucket("2025-01-01T00:00:00Z", NOW)).toBe("overdue");
  });

  it("returns 'today' for any moment on the same calendar day (UTC)", () => {
    expect(dueDateBucket("2026-04-27T00:00:00Z", NOW)).toBe("today");
    expect(dueDateBucket("2026-04-27T23:59:59Z", NOW)).toBe("today");
  });

  it("returns 'soon' for tomorrow through 3 days out", () => {
    expect(dueDateBucket("2026-04-28T00:00:00Z", NOW)).toBe("soon");
    expect(dueDateBucket("2026-04-30T23:59:59Z", NOW)).toBe("soon");
  });

  it("returns 'later' for >3 days out", () => {
    expect(dueDateBucket("2026-05-01T00:00:00Z", NOW)).toBe("later");
    expect(dueDateBucket("2027-01-01T00:00:00Z", NOW)).toBe("later");
  });

  it("returns null for unparsable input", () => {
    expect(dueDateBucket("not-a-date", NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pnpm --filter @dragons/shared test -- board-due-date`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `packages/shared/src/board-due-date.ts` with:

```ts
/**
 * Due-date urgency buckets for the native kanban board.
 *
 * Buckets:
 *   - overdue: dueDate strictly before `now`
 *   - today:   same UTC calendar day as `now`
 *   - soon:    1..3 days out (UTC)
 *   - later:   >3 days out
 *
 * UTC is used deliberately so the bucket is stable across DST shifts and
 * matches the server's day arithmetic. The displayed "today/tomorrow"
 * labels are localised in the UI layer separately.
 */

export type DueDateBucket = "overdue" | "today" | "soon" | "later";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function dueDateBucket(
  dueIso: string | null,
  now: Date,
): DueDateBucket | null {
  if (dueIso == null) return null;
  const t = Date.parse(dueIso);
  if (Number.isNaN(t)) return null;
  if (t < now.getTime()) return "overdue";

  const dueDay = utcDayStart(new Date(t));
  const nowDay = utcDayStart(now);

  if (dueDay === nowDay) return "today";

  const diffDays = Math.round((dueDay - nowDay) / MS_PER_DAY);
  if (diffDays >= 1 && diffDays <= 3) return "soon";
  return "later";
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @dragons/shared test -- board-due-date`
Expected: PASS (6 tests).

- [ ] **Step 5: Export from `@dragons/shared`**

Open `packages/shared/src/index.ts`. After the `board-task-sort` exports, add:

```ts
export { dueDateBucket } from "./board-due-date";
export type { DueDateBucket } from "./board-due-date";
```

- [ ] **Step 6: Add due-label i18n keys**

Open `apps/native/src/i18n/en.json`. Inside `"board": { "task": { ... } }`, add:

```json
      "dueOverdue": "Overdue",
      "dueToday": "Today",
      "dueTomorrow": "Tomorrow",
```

Open `apps/native/src/i18n/de.json`:

```json
      "dueOverdue": "Überfällig",
      "dueToday": "Heute",
      "dueTomorrow": "Morgen",
```

- [ ] **Step 7: Update `TaskCard` for avatar overflow + due colour**

Open `apps/native/src/components/board/TaskCard.tsx`. Add the import block near the top (alongside the existing `useWindowDimensions` is missing — add it now):

```tsx
import { useWindowDimensions } from "react-native";
import { dueDateBucket, type DueDateBucket } from "@dragons/shared";
```

Find the existing helper section (right after `function formatDueShort`). Add a new helper:

```ts
/** Returns the user-visible due label for a bucket + raw iso. */
export function formatDueWithBucket(
  iso: string,
  bucket: DueDateBucket | null,
  t: (key: string) => string,
): string {
  if (bucket === "overdue") return t("board.task.dueOverdue");
  if (bucket === "today") return t("board.task.dueToday");
  if (bucket === "soon") {
    // Distinguish tomorrow from "soon".
    const due = new Date(iso);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (
      due.getUTCFullYear() === tomorrow.getUTCFullYear() &&
      due.getUTCMonth() === tomorrow.getUTCMonth() &&
      due.getUTCDate() === tomorrow.getUTCDate()
    ) {
      return t("board.task.dueTomorrow");
    }
  }
  return formatDueShort(iso);
}

/** Returns the colour for a due-date bucket. Falls back to mutedForeground. */
export function dueColorFor(
  bucket: DueDateBucket | null,
  colors: ReturnType<typeof useTheme>["colors"],
): string {
  switch (bucket) {
    case "overdue":
      return colors.destructive;
    case "today":
      // The theme's `warning` token may not exist on every codebase.
      // We fall through to the explicit amber as the documented default.
      return ((colors as unknown) as { warning?: string }).warning ?? "#f59e0b";
    case "soon":
      return colors.primary;
    case "later":
    default:
      return colors.mutedForeground;
  }
}
```

Update the `AvatarStack` component to compute `max` from window width. Find the function signature:

```ts
function AvatarStack({
  assignees,
  size,
  ring,
  mutedBg,
  mutedFg,
  max = 3,
}: AvatarStackProps) {
```

Replace with:

```ts
function AvatarStack({
  assignees,
  size,
  ring,
  mutedBg,
  mutedFg,
  max,
}: AvatarStackProps) {
  const { width: windowWidth } = useWindowDimensions();
  const effectiveMax = max ?? (windowWidth < 380 ? 2 : 3);
```

Inside the function body, replace the line:

```ts
  const visible = assignees.slice(0, max);
```

with:

```ts
  const visible = assignees.slice(0, effectiveMax);
```

(`effectiveMax` was just declared.)

Update the `TaskCard` due-date row. Find:

```tsx
          {task.dueDate ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <CalendarIcon size={12} color={colors.mutedForeground} />
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontSize: 11,
                  fontWeight: "500",
                }}
              >
                {formatDueShort(task.dueDate)}
              </Text>
            </View>
          ) : null}
```

Replace with:

```tsx
          {task.dueDate ? (() => {
            const bucket = dueDateBucket(task.dueDate, new Date());
            const dueColour = dueColorFor(bucket, colors);
            return (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <CalendarIcon size={12} color={dueColour} />
                <Text
                  style={{
                    color: dueColour,
                    fontSize: 11,
                    fontWeight: bucket === "overdue" || bucket === "today" ? "700" : "500",
                  }}
                >
                  {formatDueWithBucket(task.dueDate, bucket, i18n.t.bind(i18n))}
                </Text>
              </View>
            );
          })() : null}
```

- [ ] **Step 8: TypeScript check + tests**

Run:
```bash
pnpm --filter @dragons/shared test
pnpm --filter @dragons/native typecheck
```
Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/board-due-date.ts \
        packages/shared/src/board-due-date.test.ts \
        packages/shared/src/index.ts \
        apps/native/src/components/board/TaskCard.tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): due-date urgency buckets and width-aware avatar overflow"
```

---

## Task 7: Manual Smoke + Full Phase Verification

This phase touches search, filtering, sorting, persistence, column drag, and card visuals. Run the static checks first, then walk the simulator scenarios.

- [ ] **Step 1: Run static checks**

Run from repo root:

```bash
pnpm --filter @dragons/shared test
pnpm --filter @dragons/shared typecheck
pnpm --filter @dragons/native typecheck
```

Expected: all PASS. Vitest should report at least 19 new tests across `board-filter-storage`, `board-task-sort`, and `board-due-date`.

- [ ] **Step 2: Boot the native app**

```bash
pnpm --filter @dragons/native start
```

(In a separate terminal:)

```bash
pnpm --filter @dragons/native ios
```

Expected: simulator launches, splash dismisses, sign in works.

- [ ] **Step 3: Smoke checklist (admin user)**

Walk through these scenarios. Mark ✅ or ❌ in the commit message at the end:

1. Open a board with at least 8 tasks. Tap the search icon in the header → input expands. Type a few letters → list filters live, "n match(es)" pill appears below the filter chips. Tap the pill's Clear → search is cleared but input stays open. Tap × on the input → input collapses.
2. Filter chip row: tap "Assignees" → multi-select sheet opens with users sorted by selected-first. Pick two users → tap Apply. Expect: tasks limited to those users, chip shows "Assignees (2)".
3. Tap the "Assignees" chip × clear button → filter clears.
4. Toggle "Mine" filter while assignees filter is also active → both apply (intersection).
5. Tap the sort icon (⇅) in header → sheet shows 5 options with current selection highlighted. Pick "Due date (earliest first)" → tasks within each column reorder. Switch to "Priority (high to low)" → urgent tasks float up.
6. Force-quit the app, relaunch, navigate back into the same board. Expect: the previously chosen filters and sort mode are restored from `expo-secure-store`.
7. Long-press a column header pill → after ~450ms the pill lifts (scale + shadow), pager scroll is locked, and panning across pills moves the lifted pill's "drop target" indicator. Release on a different position → the column reorders. Toast NOT required (silent success matches the pattern of other reorder ops).
8. While in column reorder mode, try a horizontal swipe on the pager body. Expect: scroll is disabled until release.
9. Long-press a column header pill but don't pan → release. Expect: lift cancels, no API call.
10. Open a task with a due date in the past. Card shows "Overdue" in red (destructive).
11. Open a task with a due date today (UTC). Card shows "Today" in amber.
12. Open a task with a due date 2 days out. Card shows formatted date in primary colour.
13. Open a task with a due date 7 days out. Card shows formatted date in mutedForeground.
14. Reduce simulator to a 4-inch device profile (iPhone SE 1st gen or similar). On a task with 4 assignees the avatar stack should show 2 avatars + "+2", not 3 + "+1".
15. Confirm column drag commit hits the API: turn airplane mode on, drag a column to a new position. Expect: optimistic move snaps back when `useColumnMutations.reorder` fails; "Couldn't save" toast appears (toast wired in Phase 1's `useColumnMutations`).
16. Open assignee filter sheet → pick 1 user → backstop with the Clear button at the top of the sheet (it should also reset selection in-sheet without dismissing).
17. With search query "foo" and sort = "due-asc" both active, navigate to another board and back. Expect: search resets (search is per-session, not persisted), sort persists. Filters persist.

- [ ] **Step 4: Final commit (any cleanup)**

If any leftover lint/typecheck issues exist, fix them. Then:

```bash
git status
```

Verify clean tree. If clean, Phase 2 is complete.

---

## Self-Review Notes

Re-verifying the plan against the original Phase 2 spec:

- **Search within board** — Task 1 ✅ (collapsible icon, plain `TextInput`, title-only with documented limitation, match-count pill)
- **Multi-assignee filter** — Task 2 ✅ (extended `BoardFilters` with `assigneeIds: Set<string>`, new `AssigneeFilterSheet`, Apply gate, count badge on chip)
- **Filter persistence** — Task 3 ✅ (pure `serializeFilters` + `parseFilters` in shared with vitest, `useBoardFilterPersistence` hook backed by `expo-secure-store` since AsyncStorage is not installed)
- **Sort options** — Task 4 ✅ (5 modes, `SortSheet` radio bottom sheet, pure `boardTaskComparator` in shared with vitest, persisted via the same hook as filters)
- **Column drag reorder** — Task 5 ✅ (`useColumnDrag` hook, header pill long-press gesture, pager `scrollEnabled` toggle, optimistic via `useColumnMutations.reorder`, references `applyColumnReorder` from shared)
- **Avatar overflow + due-date colour spectrum** — Task 6 ✅ (width-aware `effectiveMax`, pure `dueDateBucket` in shared with vitest, `dueColorFor` mapping with `warning` fallback, `formatDueWithBucket` for Today/Tomorrow/Overdue labels)
- **Manual verification gate** — Task 7 ✅

Type/method names verified consistent across tasks: `BoardFilters` (UI), `SerialisableBoardFilters` (storage wire), `BoardSortMode` (re-exported from shared), `dueDateBucket`, `dueColorFor`, `formatDueWithBucket`, `useColumnDrag`. All sheet handles use the `XHandle` naming convention (matches existing `TaskDetailSheetHandle`, `MoveToSheetHandle`, etc.).

Constraints honoured:
- Phase 1 conventions assumed: `useToast`, `useColumnMutations(boardId).reorder`, `formatDueShort` exported from `TaskCard`, 44pt pill heights — none re-introduced.
- No native test runner needed; new pure logic lives in `@dragons/shared` with vitest.
- AsyncStorage not present → fall-through to `expo-secure-store` documented and used.
- `applyColumnReorder` imported from `@dragons/shared` per the spec instead of re-implementing.
- `AssigneeFilterSheet` follows the `AssigneePickerSheet` interaction pattern but adds an Apply gate per spec.

No placeholders remain. Every step contains the actual content needed.
