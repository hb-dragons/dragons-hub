# Native Kanban Phase 3 — Feel & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the native kanban board from "functional" to "feels great". Add motion polish (drag tilt, drop pulse, drop-target glow, checklist progress animation), give the skeleton state real shape, make swipe-to-delete and full a11y available, surface save state on the title field, and make the column pager peek. Phases 1 and 2 closed the parity and discoverability gaps; Phase 3 is the feel layer.

**Architecture:** No new abstractions. Each task is a focused edit to an existing component or hook. Reanimated 4.x's `withSpring` / `withSequence` / `withRepeat` / `interpolate` cover all motion; `react-native-gesture-handler`'s `Swipeable` covers swipe-to-delete; `AccessibilityInfo` covers screen-reader announcements. We reuse the Phase 1 toast subsystem and Phase 1's `formatDueShort` helper. Drop pulse coordinates via a single "recently dropped" task ID held in `useBoardDrag`'s state; the dropped card consumes it once, runs its pulse, and clears the flag.

**Tech Stack:** React Native 0.83.4, Expo 55, expo-router 55, `@gorhom/bottom-sheet` 5.2.10, `react-native-reanimated` 4.3.0, `react-native-gesture-handler` 2.31.1 (`Swipeable`), `react-native-svg` 15.15, `i18n-js` 4.5.1. No new runtime deps. The native app has no automated UI tests; verification is a developer-driven smoke pass on iOS simulator + Android emulator (Task 11).

---

## File Structure

**New files:**
- `apps/native/src/components/board/BoardListSkeleton.tsx` — 4 stacked skeleton rows shaped like a real board list row, used while `useBoardList` is loading
- `apps/native/src/components/board/SaveIndicator.tsx` — 12px three-state indicator (idle / spinner / checkmark) shared by title + description fields

**Modified files:**
- `apps/native/src/components/board/TaskCardDragGhost.tsx` — spring scale, velocity-derived tilt
- `apps/native/src/components/board/TaskCard.tsx` — priority left-edge stripe, drop pulse animation, swipe-to-delete via `Swipeable`, testID + a11y hints
- `apps/native/src/components/board/BoardColumn.tsx` — animated drop-target tint + shadow, testID
- `apps/native/src/components/board/BoardPager.tsx` — column width 0.88 → 0.85, testID
- `apps/native/src/components/board/BoardHeader.tsx` — testID
- `apps/native/src/components/board/FilterChips.tsx` — `showsHorizontalScrollIndicator={true}`, testID
- `apps/native/src/components/board/PriorityPickerSheet.tsx` — colored priority dots
- `apps/native/src/components/board/ChecklistSection.tsx` — animated progress bar, completion glow, checkbox spring
- `apps/native/src/components/board/TaskCardSkeleton.tsx` — match real TaskCard layout, shimmer
- `apps/native/src/components/board/TaskDetailSheet.tsx` — orientation-aware snap points, testID
- `apps/native/src/components/board/TaskDetailBody.tsx` — title + description save indicator, accessibilityHint on property rows
- `apps/native/src/app/admin/boards/index.tsx` — replace spinner with `BoardListSkeleton`
- `apps/native/src/app/admin/boards/[id].tsx` — pass swipe-delete callback to BoardPager → TaskCard, pass `recentlyDroppedTaskId` from `useBoardDrag`
- `apps/native/src/hooks/board/useBoardDrag.ts` — track `recentlyDroppedTaskId` (clears after 400ms), call `AccessibilityInfo.announceForAccessibility` on drag start / drop / cancel
- `apps/native/src/i18n/en.json` — add `priority.colors.*`, `board.task.swipeDelete`, `board.task.savingTitle`, `board.task.savedTitle`, `a11y.*` keys
- `apps/native/src/i18n/de.json` — same keys, German

**Files NOT touched in Phase 3:**
- Any web/API code — Phase 3 is native-only
- New i18n strings beyond the keys listed — keep the surface small
- New mutation hooks — all delete/save flows reuse Phase 1 hooks

---

## Task 1: Drag Ghost Spring + Tilt

**Files:**
- Modify: `apps/native/src/components/board/TaskCardDragGhost.tsx`

The current ghost is a static `transform: scale(1.04)` with no entrance and no rotation. We want it to spring up on pickup and lean into the direction of motion (±2deg). Reanimated's worklet derivatives let us read the previous pointer X to compute a horizontal velocity, then `interpolate` it to a rotation.

- [ ] **Step 1: Update `TaskCardDragGhost.tsx` to spring + tilt**

Replace the full contents of `apps/native/src/components/board/TaskCardDragGhost.tsx` with:

```tsx
import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { View, Text } from "react-native";
import type { TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { formatDueShort } from "./TaskCard";

interface TaskCardDragGhostProps {
  task: TaskCardData;
  /** Absolute screen X of the ghost centre (pointer X) */
  pointerX: SharedValue<number>;
  /** Absolute screen Y of the ghost centre (pointer Y) */
  pointerY: SharedValue<number>;
  /** Original card width, used to size the ghost */
  cardWidth: number;
  /** Original card height, used to size the ghost */
  cardHeight: number;
}

export function TaskCardDragGhost({
  task,
  pointerX,
  pointerY,
  cardWidth,
  cardHeight,
}: TaskCardDragGhostProps) {
  const { colors, spacing, radius } = useTheme();

  let priorityDot: string | null = null;
  if (task.priority === "high") priorityDot = colors.heat;
  else if (task.priority === "urgent") priorityDot = colors.destructive;

  const hasChecklist = task.checklistTotal > 0;
  const firstAssigneeName = task.assignees[0]?.name ?? null;

  // Spring scale: 1 → 1.04, slight bounce.
  const scale = useSharedValue(1);
  // Track previous pointer X on the worklet thread for velocity derivation.
  const prevX = useSharedValue(pointerX.value);
  const velocityX = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1.04, { damping: 12, stiffness: 220, mass: 0.6 });
  }, [scale]);

  // Worklet-derived horizontal velocity (px per frame, smoothed).
  useDerivedValue(() => {
    const dx = pointerX.value - prevX.value;
    // Low-pass filter so a single jitter doesn't flip the tilt.
    velocityX.value = velocityX.value * 0.7 + dx * 0.3;
    prevX.value = pointerX.value;
  });

  const ghostStyle = useAnimatedStyle(() => {
    // Map -20..20 px/frame velocity to -2..2 degrees.
    const rotateDeg = interpolate(
      velocityX.value,
      [-20, 0, 20],
      [-2, 0, 2],
      Extrapolation.CLAMP,
    );
    return {
      position: "absolute",
      left: pointerX.value - cardWidth / 2,
      top: pointerY.value - cardHeight / 2,
      width: cardWidth,
      height: cardHeight,
      transform: [{ scale: scale.value }, { rotate: `${rotateDeg}deg` }],
      opacity: 0.92,
      pointerEvents: "none",
    };
  });

  return (
    <Animated.View style={ghostStyle} pointerEvents="none">
      <View
        style={{
          flex: 1,
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceBase,
          borderWidth: 1,
          borderColor: colors.primary,
          gap: spacing.xs,
          minHeight: 72,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 14,
          elevation: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          {priorityDot ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: priorityDot }} />
          ) : null}
          <Text
            numberOfLines={2}
            style={{ flex: 1, color: colors.foreground, fontSize: 15, fontWeight: "600" }}
          >
            {task.title}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
          {task.dueDate ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {formatDueShort(task.dueDate)}
            </Text>
          ) : null}
          {hasChecklist ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontVariant: ["tabular-nums"] }}>
              {task.checklistChecked}/{task.checklistTotal}
            </Text>
          ) : null}
          {task.assignees.length === 1 && firstAssigneeName ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {firstAssigneeName}
            </Text>
          ) : task.assignees.length > 1 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {i18n.t("board.task.assigneeCount", { count: task.assignees.length })}
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/board/TaskCardDragGhost.tsx
git commit -m "feat(native): drag ghost spring scale + velocity-derived tilt"
```

---

## Task 2: Drop Animation Pulse

**Files:**
- Modify: `apps/native/src/hooks/board/useBoardDrag.ts`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`
- Modify: `apps/native/src/components/board/BoardPager.tsx`
- Modify: `apps/native/src/components/board/BoardColumn.tsx`
- Modify: `apps/native/src/components/board/TaskCard.tsx`

After a successful drop the card should pulse 1 → 1.05 → 1 over ~250ms so the user sees confirmation of where it landed. We thread a single `recentlyDroppedTaskId` value from `useBoardDrag` down to TaskCard; the card whose id matches plays the pulse on mount/effect, then the hook clears the flag after 400ms (longer than the animation so React state settles).

- [ ] **Step 1: Track `recentlyDroppedTaskId` in `useBoardDrag`**

Open `apps/native/src/hooks/board/useBoardDrag.ts`. Find the imports block at the top:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
```

Add `useState` is already imported. Find the `UseBoardDragReturn` interface and add a field:

```ts
interface UseBoardDragReturn {
  /** Ghost position for the animated drag overlay. */
  pointerX: SharedValue<number>;
  pointerY: SharedValue<number>;
  /** Current drag state for rendering. */
  dragState: DragState;
  /** Callbacks passed to BoardPager. */
  onTaskDrag: {
    start: (task: TaskCardData, layout: TaskCardLayout) => void;
    move: (pageX: number, pageY: number) => void;
    end: () => void;
  };
  onPagerLayout: (layout: PagerLayout) => void;
  onPagerScrollUpdate: (scrollX: number) => void;
  onColumnScrollUpdate: (columnId: number, scrollY: number, viewportHeight: number) => void;
  onColumnContentSizeChange: (columnId: number, contentHeight: number) => void;
  onTaskMeasure: (taskId: number, rect: TaskContentRect) => void;
  onColumnHeaderHeight: (columnId: number, headerHeight: number) => void;
  /** The column ID currently highlighted (null when not dragging). */
  dropTargetColumnId: number | null;
  /** Task ID of the most recently dropped card; clears 400ms after drop. */
  recentlyDroppedTaskId: number | null;
}
```

Inside the hook body, after the `dragState` state declaration, add:

```ts
  const [recentlyDroppedTaskId, setRecentlyDroppedTaskId] = useState<number | null>(null);
```

Find the `handleDragEnd` callback. Replace it with this version that sets the flag on a successful drop:

```ts
  const handleDragEnd = useCallback(() => {
    dragActiveRef.current = false;

    // Snapshot drag state before clearing it.
    const snapshot = dragStateRef.current;
    dragStateRef.current = { active: false };
    setDragState({ active: false });

    if (!snapshot.active) return;

    const { x, y } = pointerRef.current;
    const result = callFindDropTarget(x, y, snapshot.task);
    const dropTarget = result?.dropTarget ?? null;

    if (
      dropTarget &&
      (dropTarget.columnId !== snapshot.task.columnId ||
        dropTarget.position !== snapshot.task.position)
    ) {
      haptics.success();
      setRecentlyDroppedTaskId(snapshot.task.id);
      setTimeout(() => setRecentlyDroppedTaskId(null), 400);
      void moveTask(snapshot.task.id, dropTarget.columnId, dropTarget.position);
    }
  }, [callFindDropTarget, moveTask]);
```

Find the return block at the bottom of the hook and add `recentlyDroppedTaskId` to it:

```ts
  return {
    pointerX,
    pointerY,
    dragState,
    onTaskDrag,
    onPagerLayout,
    onPagerScrollUpdate,
    onColumnScrollUpdate,
    onColumnContentSizeChange,
    onTaskMeasure,
    onColumnHeaderHeight,
    dropTargetColumnId: dragState.active ? dragState.dropTargetColumnId : null,
    recentlyDroppedTaskId,
  };
```

- [ ] **Step 2: Forward `recentlyDroppedTaskId` through the screen**

Open `apps/native/src/app/admin/boards/[id].tsx`. Find the destructure of the `useBoardDrag` return value. It will look like:

```tsx
  const drag = useBoardDrag({
    boardId,
    columns,
    tasks,
    windowWidth: winWidth,
    pagerRef,
    columnHandlesRef,
  });
```

(The variable name may be different in your tree — search for `useBoardDrag(`.) Whatever the local name, ensure the value is passed through to `<BoardPager>`. Find the `<BoardPager>` JSX element and add a prop:

```tsx
        <BoardPager
          ref={pagerRef}
          columns={columns}
          tasks={tasks ?? []}
          onActiveColumnChange={setActiveColumnIndex}
          onTaskPress={handleTaskPress}
          onTaskLongPress={handleTaskLongPress}
          onAddTask={handleAddTask}
          draggingTaskId={drag.dragState.active ? drag.dragState.task.id : null}
          dropTargetColumnId={drag.dropTargetColumnId}
          recentlyDroppedTaskId={drag.recentlyDroppedTaskId}
          onTaskDrag={drag.onTaskDrag}
          onTaskMeasure={drag.onTaskMeasure}
          onColumnScrollUpdate={drag.onColumnScrollUpdate}
          onColumnContentSizeChange={drag.onColumnContentSizeChange}
          onColumnHeaderHeight={drag.onColumnHeaderHeight}
          onPagerScrollUpdate={drag.onPagerScrollUpdate}
          onPagerLayout={drag.onPagerLayout}
          columnRefs={columnHandlesRef}
          refreshing={isValidating}
          onRefresh={() => { void mutateTasks(); }}
        />
```

(Add only `recentlyDroppedTaskId={drag.recentlyDroppedTaskId}` — leave the other props as they are in your tree.)

- [ ] **Step 3: Pass `recentlyDroppedTaskId` through BoardPager**

Open `apps/native/src/components/board/BoardPager.tsx`. Find the `BoardPagerProps` interface and add the field:

```ts
interface BoardPagerProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  onActiveColumnChange: (i: number) => void;
  onTaskPress: (task: TaskCardData) => void;
  onTaskLongPress?: (task: TaskCardData) => void;
  onAddTask: (columnId: number) => void;
  /** ID of the task being dragged — fades out its placeholder. */
  draggingTaskId?: number | null;
  /** Column ID that is currently a valid drop target. */
  dropTargetColumnId?: number | null;
  /** Task ID of the most recently dropped card (fires drop-pulse). */
  recentlyDroppedTaskId?: number | null;
  /** Drag callbacks forwarded to task cards. */
  onTaskDrag?: TaskDragCallbacks;
  onTaskMeasure?: (taskId: number, rect: TaskContentRect) => void;
  onColumnScrollUpdate?: (columnId: number, scrollY: number, viewportHeight: number) => void;
  onColumnContentSizeChange?: (columnId: number, contentHeight: number) => void;
  onColumnHeaderHeight?: (columnId: number, headerHeight: number) => void;
  onPagerScrollUpdate?: (scrollX: number) => void;
  onPagerLayout?: (layout: PagerLayout) => void;
  columnRefs?: React.MutableRefObject<Map<number, BoardColumnHandle>>;
  refreshing?: boolean;
  onRefresh?: () => void;
}
```

Find the destructured props block in the `BoardPager` function and add `recentlyDroppedTaskId`:

```tsx
    {
      columns,
      tasks,
      onActiveColumnChange,
      onTaskPress,
      onTaskLongPress,
      onAddTask,
      draggingTaskId,
      dropTargetColumnId,
      recentlyDroppedTaskId,
      onTaskDrag,
      onTaskMeasure,
      onColumnScrollUpdate,
      onColumnContentSizeChange,
      onColumnHeaderHeight,
      onPagerScrollUpdate,
      onPagerLayout,
      columnRefs,
      refreshing,
      onRefresh,
    },
```

In the JSX where each `<BoardColumn>` is rendered, add the prop:

```tsx
          <BoardColumn
            key={col.id}
            ref={(handle) => {
              if (!columnRefs) return;
              if (handle) {
                columnRefs.current.set(col.id, handle);
              } else {
                columnRefs.current.delete(col.id);
              }
            }}
            column={col}
            tasks={tasks}
            width={columnWidth}
            onTaskPress={onTaskPress}
            onTaskLongPress={onTaskLongPress}
            onAddTask={onAddTask}
            draggingTaskId={draggingTaskId}
            isDropTarget={col.id === dropTargetColumnId}
            recentlyDroppedTaskId={recentlyDroppedTaskId}
            onTaskDrag={onTaskDrag}
            onTaskMeasure={onTaskMeasure}
            onScrollUpdate={onColumnScrollUpdate}
            onContentSizeChange={onColumnContentSizeChange}
            onHeaderHeight={onColumnHeaderHeight}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
```

- [ ] **Step 4: Pass `recentlyDroppedTaskId` through BoardColumn**

Open `apps/native/src/components/board/BoardColumn.tsx`. Find the `BoardColumnProps` interface, add field:

```ts
interface BoardColumnProps {
  column: BoardColumnData;
  tasks: TaskCardData[];
  width: number;
  onTaskPress: (task: TaskCardData) => void;
  onTaskLongPress?: (task: TaskCardData) => void;
  onAddTask: (columnId: number) => void;
  draggingTaskId?: number | null;
  /** Task ID of the most recently dropped card (fires drop-pulse). */
  recentlyDroppedTaskId?: number | null;
  onTaskDrag?: TaskDragCallbacks;
  isDropTarget?: boolean;
  onTaskMeasure?: (taskId: number, rect: TaskContentRect) => void;
  onScrollUpdate?: (columnId: number, scrollY: number, viewportHeight: number) => void;
  onContentSizeChange?: (columnId: number, contentHeight: number) => void;
  onHeaderHeight?: (columnId: number, headerHeight: number) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}
```

Find the destructured props in the `BoardColumn` function body and add `recentlyDroppedTaskId`:

```tsx
    {
      column,
      tasks,
      width,
      onTaskPress,
      onTaskLongPress,
      onAddTask,
      draggingTaskId,
      recentlyDroppedTaskId,
      onTaskDrag,
      isDropTarget = false,
      onTaskMeasure,
      onScrollUpdate,
      onContentSizeChange,
      onHeaderHeight,
      refreshing,
      onRefresh,
    },
```

In the `columnTasks.map` JSX, pass `recentlyDropped` to each TaskCard:

```tsx
            {columnTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onPress={onTaskPress}
                onLongPress={onTaskLongPress}
                isBeingDragged={t.id === draggingTaskId}
                recentlyDropped={t.id === recentlyDroppedTaskId}
                onDrag={onTaskDrag}
                onMeasure={onTaskMeasure}
              />
            ))}
```

- [ ] **Step 5: Implement the pulse in TaskCard**

Open `apps/native/src/components/board/TaskCard.tsx`. Find the imports block at the top. Update the Reanimated import to include `useSharedValue`, `useAnimatedStyle`, `withSequence`, `withTiming`:

```tsx
import Animated, {
  measure,
  runOnJS,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
```

Add `useEffect` to the React import at top:

```tsx
import { useCallback, useEffect, useState } from "react";
```

Find `interface TaskCardProps {` and add `recentlyDropped`:

```tsx
interface TaskCardProps {
  task: TaskCardData;
  onPress: (task: TaskCardData) => void;
  onLongPress?: (task: TaskCardData) => void;
  onDrag?: TaskDragCallbacks;
  isBeingDragged?: boolean;
  /** When true, fire a brief 1 → 1.05 → 1 pulse (consumes the flag once). */
  recentlyDropped?: boolean;
  onMeasure?: (taskId: number, rect: TaskContentRect) => void;
}
```

Find the destructured props in `export function TaskCard(...)` and add `recentlyDropped`:

```tsx
export function TaskCard({
  task,
  onPress,
  onLongPress,
  onDrag,
  isBeingDragged = false,
  recentlyDropped = false,
  onMeasure,
}: TaskCardProps) {
```

Inside the `TaskCard` body, after the existing `const [pressed, setPressed] = useState(false);` line, add:

```tsx
  const dropPulse = useSharedValue(1);

  useEffect(() => {
    if (!recentlyDropped) return;
    dropPulse.value = withSequence(
      withTiming(1.05, { duration: 120 }),
      withTiming(1, { duration: 120 }),
    );
  }, [recentlyDropped, dropPulse]);

  const dropPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dropPulse.value }],
  }));
```

Find the `<AnimatedPressable ... style={{ ... }}>` block. We need to merge the animated style with the existing static style. Replace:

```tsx
      style={{
        padding: spacing.md,
        borderRadius: 8,
        backgroundColor: pressed ? colors.surfaceHigh : colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.sm,
        opacity: isBeingDragged ? 0 : 1,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
      }}
```

With:

```tsx
      style={[
        {
          padding: spacing.md,
          borderRadius: 8,
          backgroundColor: pressed ? colors.surfaceHigh : colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          gap: spacing.sm,
          opacity: isBeingDragged ? 0 : 1,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
          elevation: 2,
        },
        dropPulseStyle,
      ]}
```

- [ ] **Step 6: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/native/src/hooks/board/useBoardDrag.ts \
        apps/native/src/app/admin/boards/[id].tsx \
        apps/native/src/components/board/BoardPager.tsx \
        apps/native/src/components/board/BoardColumn.tsx \
        apps/native/src/components/board/TaskCard.tsx
git commit -m "feat(native): drop pulse animation on successful task drop"
```

---

## Task 3: Drop Target Column Visual Upgrade

**Files:**
- Modify: `apps/native/src/components/board/BoardColumn.tsx`

Today the drop target only changes border 1→2px and switches color from `border` to `primary`. We add an animated background tint shift (`surfaceLow → surfaceHigh` in dark, `surfaceHigh → surfaceHighest` in light), an elevated shadow that ramps from 0 → 0.18 opacity / 0 → 12 radius, and use Reanimated's animated style to drive both off a single shared value.

- [ ] **Step 1: Wire animated drop-target style in BoardColumn**

Open `apps/native/src/components/board/BoardColumn.tsx`. Add Reanimated imports at the top of the file (under the existing `react-native` import):

```tsx
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
```

Inside the function body, after the existing `const { colors, spacing, radius, isDark } = useTheme();` line, add:

```tsx
    // Drive drop-target tint + shadow with a single 0 → 1 progress value.
    const dropProgress = useSharedValue(0);
    useDerivedValue(() => {
      dropProgress.value = withTiming(isDropTarget ? 1 : 0, { duration: 180 });
    });

    const baseBg = isDark ? colors.surfaceLow : colors.surfaceHigh;
    const targetBg = isDark ? colors.surfaceHigh : colors.surfaceHighest;

    const animatedColumnStyle = useAnimatedStyle(() => ({
      shadowOpacity: 0.18 * dropProgress.value,
      shadowRadius: 12 * dropProgress.value,
      elevation: 8 * dropProgress.value,
    }));
```

Find the existing column body wrapper:

```tsx
        <View
          style={{
            flex: 1,
            backgroundColor: isDark ? colors.surfaceLow : colors.surfaceHigh,
            borderRadius: radius.md,
            overflow: "hidden",
            borderWidth: isDropTarget ? 2 : 1,
            borderColor: isDropTarget ? colors.primary : colors.border,
          }}
        >
```

Replace with:

```tsx
        <Animated.View
          style={[
            {
              flex: 1,
              backgroundColor: isDropTarget ? targetBg : baseBg,
              borderRadius: radius.md,
              overflow: "hidden",
              borderWidth: isDropTarget ? 2 : 1,
              borderColor: isDropTarget ? colors.primary : colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
            },
            animatedColumnStyle,
          ]}
        >
```

Find the matching closing tag of the wrapper at the bottom of the column (the one that wraps the header + ScrollView):

```tsx
        </View>
      </View>
    );
```

Replace with:

```tsx
        </Animated.View>
      </View>
    );
```

(Make sure only the outer wrapper — the one that has the border and `flex: 1` — was converted to `Animated.View`. The inner header `<View>` and the inner ScrollView wrappers stay as plain views.)

- [ ] **Step 2: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/board/BoardColumn.tsx
git commit -m "feat(native): animated drop-target tint and shadow on column"
```

---

## Task 4: Priority Left-Edge Stripe + Picker Dots

**Files:**
- Modify: `apps/native/src/components/board/TaskCard.tsx`
- Modify: `apps/native/src/components/board/PriorityPickerSheet.tsx`
- Modify: `apps/native/src/i18n/en.json`
- Modify: `apps/native/src/i18n/de.json`

Today priority shows only as a top-right pill and (for high/urgent) a small dot in the drag ghost. Add a 4px colored left edge on the card and matching colored dots on each picker option so the visual language is consistent.

- [ ] **Step 1: Add a `priorityStripeColor` helper**

Open `apps/native/src/components/board/TaskCard.tsx`. Find the existing `priorityBadgeStyle` function. Right above it (or right below it), add a new helper:

```tsx
/**
 * Color of the 4px left-edge stripe.
 * urgent → destructive, high → heat, low → mutedForeground, normal → transparent
 */
function priorityStripeColor(
  priority: TaskPriority,
  colors: ReturnType<typeof useTheme>["colors"],
): string {
  switch (priority) {
    case "urgent":
      return colors.destructive;
    case "high":
      return colors.heat;
    case "low":
      return colors.mutedForeground;
    default:
      return "transparent";
  }
}
```

Export it (other code may want it):

```tsx
export function priorityStripeColor(
  priority: TaskPriority,
  colors: ReturnType<typeof useTheme>["colors"],
): string {
```

(Add `export` keyword to the `function` line.)

- [ ] **Step 2: Render the stripe in TaskCard**

Inside the `TaskCard` body, the existing JSX wraps `<AnimatedPressable>` directly. We want a 4px stripe on the left edge that doesn't affect the card's content padding. The cleanest path is to render an absolute-positioned stripe inside the card.

Find the `cardContent` declaration:

```tsx
  const cardContent = (
    <AnimatedPressable
      ...
      style={[ ... ]}
    >
      {/* Title row + priority badge */}
      <View
```

Right after the opening `<AnimatedPressable ...>` (before the title row), add:

```tsx
      {/* Priority left-edge stripe */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          backgroundColor: priorityStripeColor(task.priority, colors),
          borderTopLeftRadius: 8,
          borderBottomLeftRadius: 8,
        }}
      />
```

The `borderRadius: 8` on the card matches `borderTopLeftRadius`/`borderBottomLeftRadius` so the stripe corners stay rounded. Because the stripe is 4px wide and the card's `padding: spacing.md` (12) is much wider, content visually clears the stripe without further adjustment.

- [ ] **Step 3: Add colored dots to PriorityPickerSheet**

Open `apps/native/src/components/board/PriorityPickerSheet.tsx`. Add the import for the helper:

```tsx
import { priorityStripeColor } from "./TaskCard";
```

Inside the `TASK_PRIORITIES.map((p) => { ... })` block, find the `<Pressable>` for each option. Right before the existing `<Text>` for the priority label, add a colored dot:

Replace:

```tsx
              <Pressable
                key={p}
                onPress={() => {
                  onPickRef.current(p);
                  sheetRef.current?.dismiss();
                }}
                accessibilityRole="button"
                accessibilityLabel={i18n.t(`board.priority.${p}`)}
                style={{
                  padding: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.primary : colors.surfaceBase,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: selected ? colors.primaryForeground : colors.foreground,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  {i18n.t(`board.priority.${p}`)}
                </Text>
                {selected ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.primaryForeground,
                    }}
                  />
                ) : null}
              </Pressable>
```

With:

```tsx
              <Pressable
                key={p}
                onPress={() => {
                  onPickRef.current(p);
                  sheetRef.current?.dismiss();
                }}
                accessibilityRole="button"
                accessibilityLabel={i18n.t(`board.priority.${p}`)}
                style={{
                  padding: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.primary : colors.surfaceBase,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.sm,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor:
                        priorityStripeColor(p, colors) === "transparent"
                          ? selected ? colors.primaryForeground : colors.border
                          : priorityStripeColor(p, colors),
                    }}
                  />
                  <Text
                    style={{
                      color: selected ? colors.primaryForeground : colors.foreground,
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    {i18n.t(`board.priority.${p}`)}
                  </Text>
                </View>
                {selected ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.primaryForeground,
                    }}
                  />
                ) : null}
              </Pressable>
```

- [ ] **Step 4: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/components/board/TaskCard.tsx \
        apps/native/src/components/board/PriorityPickerSheet.tsx
git commit -m "feat(native): priority left-edge stripe on card and colored dots in picker"
```

---

## Task 5: Checklist Completion Animation

**Files:**
- Modify: `apps/native/src/components/board/ChecklistSection.tsx`

Three motion changes:
1. Progress bar width animates with `withTiming(percent, 280)` rather than jumping.
2. On reaching exactly 100% (transition 99 → 100), fire `haptics.success()` and flash the bar's background to `primary` for ~400ms then ease back.
3. When an item's `isChecked` flips, the checkbox itself scales 1 → 1.18 → 1 over 240ms.

- [ ] **Step 1: Convert progress bar to animated width + glow on completion**

Open `apps/native/src/components/board/ChecklistSection.tsx`. Replace the imports:

```tsx
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { TaskDetail } from "@dragons/shared";
import { useChecklistMutations } from "@/hooks/board/useChecklistMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
```

With:

```tsx
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import type { TaskDetail } from "@dragons/shared";
import { useChecklistMutations } from "@/hooks/board/useChecklistMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
```

Inside the `ChecklistSection` function body, after the `const percent = ...` line, add the animated progress logic:

```tsx
  // Animated progress bar width.
  const widthSV = useSharedValue(percent);
  // Glow on completion: 0 = base color, 1 = primary flash.
  const glowSV = useSharedValue(0);
  // Track previous percent so we can detect the 99 → 100 transition.
  const prevPercentRef = useRef(percent);

  useEffect(() => {
    widthSV.value = withTiming(percent, { duration: 280 });
    if (prevPercentRef.current < 100 && percent === 100 && total > 0) {
      haptics.success();
      glowSV.value = withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0, { duration: 220 }),
      );
    }
    prevPercentRef.current = percent;
  }, [percent, total, widthSV, glowSV]);

  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${widthSV.value}%`,
  }));
```

Find the existing static progress bar:

```tsx
      {total > 0 ? (
        <View
          style={{
            height: 6,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceHigh,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${percent}%`,
              height: "100%",
              backgroundColor: colors.primary,
            }}
          />
        </View>
      ) : null}
```

Replace with:

```tsx
      {total > 0 ? (
        <View
          style={{
            height: 6,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceHigh,
            overflow: "hidden",
          }}
        >
          <Animated.View
            style={[
              {
                height: "100%",
                backgroundColor: colors.primary,
              },
              animatedFillStyle,
            ]}
          />
        </View>
      ) : null}
```

(We dropped the explicit completion-glow View because the `withSequence` flash on `glowSV` is already implicit in the percent-to-100 transition; the visible signal users get is the bar finishing + haptic. If a glow flash on the *background* of the bar is desired, the behaviour is achievable by overlaying a second Animated.View at full width with `opacity: glowSV.value`. We add that below.)

Right under the closing `</View>` of the progress bar, add the glow overlay before the `null`:

Replace the block again with:

```tsx
      {total > 0 ? (
        <View
          style={{
            height: 6,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceHigh,
            overflow: "hidden",
          }}
        >
          <Animated.View
            style={[
              {
                height: "100%",
                backgroundColor: colors.primary,
              },
              animatedFillStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: colors.primary,
              },
              useAnimatedStyle(() => ({ opacity: glowSV.value * 0.5 })),
            ]}
          />
        </View>
      ) : null}
```

Wait — invoking `useAnimatedStyle` inline inside JSX violates the rules of hooks. Pull it out. After the `animatedFillStyle` declaration, add:

```tsx
  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: glowSV.value * 0.5,
  }));
```

Then in the JSX use `animatedGlowStyle` instead of the inline call:

```tsx
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: colors.primary,
              },
              animatedGlowStyle,
            ]}
          />
```

- [ ] **Step 2: Animate the checkbox itself on toggle**

Each checklist item is currently rendered inline inside `.map(...)`. Refactoring per-item state into the parent is awkward, so extract the row into a child component that owns its own shared value.

Inside the same file (above `export function ChecklistSection(...)`), add a new component:

```tsx
interface ChecklistRowProps {
  label: string;
  isChecked: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  spacing: ReturnType<typeof useTheme>["spacing"];
  onToggle: () => void;
  onLongPress: () => void;
}

function ChecklistRow({
  label,
  isChecked,
  colors,
  spacing,
  onToggle,
  onLongPress,
}: ChecklistRowProps) {
  const scale = useSharedValue(1);
  const prevChecked = useRef(isChecked);

  useEffect(() => {
    if (prevChecked.current !== isChecked) {
      scale.value = withSequence(
        withSpring(1.18, { damping: 8, stiffness: 260, mass: 0.6 }),
        withSpring(1, { damping: 12, stiffness: 220, mass: 0.6 }),
      );
      prevChecked.current = isChecked;
    }
  }, [isChecked, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onLongPress}
      delayLongPress={500}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isChecked }}
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingVertical: spacing.xs,
      }}
    >
      <Animated.View
        style={[
          {
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: isChecked ? colors.primary : colors.border,
            backgroundColor: isChecked ? colors.primary : "transparent",
            alignItems: "center",
            justifyContent: "center",
          },
          animStyle,
        ]}
      >
        {isChecked ? (
          <Text style={{ color: colors.primaryForeground, fontSize: 14, fontWeight: "700" }}>
            ✓
          </Text>
        ) : null}
      </Animated.View>
      <Text
        style={{
          flex: 1,
          color: colors.foreground,
          fontSize: 15,
          textDecorationLine: isChecked ? "line-through" : "none",
          opacity: isChecked ? 0.6 : 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
```

In the `ChecklistSection` body, replace the existing `.map((item) => ( <Pressable> ... </Pressable> ))` with:

```tsx
      {task.checklist
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((item) => (
          <ChecklistRow
            key={item.id}
            label={item.label}
            isChecked={item.isChecked}
            colors={colors}
            spacing={spacing}
            onToggle={() => {
              haptics.selection();
              void mutations.toggle(task.id, item.id, !item.isChecked);
            }}
            onLongPress={() => confirmDelete(item.id)}
          />
        ))}
```

- [ ] **Step 3: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/components/board/ChecklistSection.tsx
git commit -m "feat(native): animated checklist progress, completion glow, checkbox spring"
```

---

## Task 6: Skeleton Fidelity

**Files:**
- Modify: `apps/native/src/components/board/TaskCardSkeleton.tsx`
- Create: `apps/native/src/components/board/BoardListSkeleton.tsx`
- Modify: `apps/native/src/app/admin/boards/index.tsx`

Today the skeleton is a 2-line stub. Make it shape-match the real TaskCard (3-line stacked title, footer with date + assignees, matching shadow/radius). Add a smooth shimmer using `withRepeat`. Then add a `BoardListSkeleton` for the boards-list screen.

- [ ] **Step 1: Rewrite `TaskCardSkeleton` to match real card shape**

Replace the full contents of `apps/native/src/components/board/TaskCardSkeleton.tsx` with:

```tsx
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

/**
 * Shape-matches the real TaskCard: padding, radius, shadow, three stacked
 * title bars, and a footer row with date + assignees. Shimmer animates
 * the inner skeleton bars' opacity 0.4 ↔ 0.7 over 1200 ms.
 */
export function TaskCardSkeleton() {
  const { colors, spacing } = useTheme();
  const shimmer = useSharedValue(0.4);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(0.7, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(shimmer);
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  const bar = (width: string | number, marginTop = 0) => (
    <Animated.View
      style={[
        {
          height: 12,
          borderRadius: 4,
          backgroundColor: colors.surfaceHighest,
          width: width as number,
          marginTop,
        },
        shimmerStyle,
      ]}
    />
  );

  return (
    <View
      style={{
        padding: spacing.md,
        borderRadius: 8,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.sm,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
      }}
    >
      {/* Title (3 lines, varying widths) */}
      <View style={{ gap: 4 }}>
        {bar("90%")}
        {bar("75%", 4)}
        {bar("55%", 4)}
      </View>

      {/* Footer: date + assignees row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: spacing.xs,
        }}
      >
        <Animated.View
          style={[
            {
              height: 10,
              width: 64,
              borderRadius: 4,
              backgroundColor: colors.surfaceHighest,
            },
            shimmerStyle,
          ]}
        />
        <View style={{ flexDirection: "row" }}>
          {[0, 1, 2].map((i) => (
            <Animated.View
              key={i}
              style={[
                {
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: colors.surfaceHighest,
                  borderWidth: 2,
                  borderColor: colors.card,
                  marginLeft: i === 0 ? 0 : -6,
                },
                shimmerStyle,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Create `BoardListSkeleton`**

Create `apps/native/src/components/board/BoardListSkeleton.tsx`:

```tsx
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

/**
 * Renders 4 stacked skeleton rows that match the shape of a real
 * BoardListScreen row (a tall padded card with a wide title bar and
 * an optional 2-line description bar). Used while useBoardList is loading.
 */
export function BoardListSkeleton() {
  const { colors, spacing, radius } = useTheme();
  const shimmer = useSharedValue(0.4);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(0.7, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(shimmer);
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  const bar = (width: string | number, height = 12, marginTop = 0) => (
    <Animated.View
      style={[
        {
          height,
          borderRadius: 4,
          backgroundColor: colors.surfaceHighest,
          width: width as number,
          marginTop,
        },
        shimmerStyle,
      ]}
    />
  );

  return (
    <View
      style={{
        padding: spacing.lg,
        gap: spacing.md,
      }}
      accessibilityLabel="Loading boards"
      accessibilityRole="progressbar"
      testID="board-list-skeleton"
    >
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceHigh,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 6,
          }}
        >
          {bar(180, 16)}
          {bar("80%", 12, 8)}
          {bar("60%", 12, 4)}
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 3: Use `BoardListSkeleton` in the boards index screen**

Open `apps/native/src/app/admin/boards/index.tsx`. Replace the spinner block:

```tsx
  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }
```

With:

```tsx
  if (isLoading && !data) {
    return <BoardListSkeleton />;
  }
```

Update the imports — remove `ActivityIndicator` (if no longer used) and add the skeleton:

```tsx
import { FlatList, Pressable, Text, View, RefreshControl } from "react-native";
import { router } from "expo-router";
import { useBoardList } from "@/hooks/board/useBoardList";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { BoardListSkeleton } from "@/components/board/BoardListSkeleton";
```

(If your tree's index already imports `ActivityIndicator` for another use, keep it. Inspect carefully.)

- [ ] **Step 4: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/components/board/TaskCardSkeleton.tsx \
        apps/native/src/components/board/BoardListSkeleton.tsx \
        apps/native/src/app/admin/boards/index.tsx
git commit -m "feat(native): shape-matched skeletons with shimmer for tasks and board list"
```

---

## Task 7: Sheet Snap Points Orientation-Aware + Property Row Hints

**Files:**
- Modify: `apps/native/src/components/board/TaskDetailSheet.tsx`
- Modify: `apps/native/src/components/board/TaskDetailBody.tsx`
- Modify: `apps/native/src/i18n/en.json`
- Modify: `apps/native/src/i18n/de.json`

The sheet's snap points are hardcoded to portrait sizes. In landscape (e.g., iPad rotated, Android tablet) `55%` of the height is too small. Compute snap points from `useWindowDimensions`. Also add an `accessibilityHint` to each property row so VoiceOver / TalkBack users hear "Double tap to edit" when focused.

- [ ] **Step 1: Make snap points orientation-aware in TaskDetailSheet**

Open `apps/native/src/components/board/TaskDetailSheet.tsx`. Replace:

```tsx
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
```

With:

```tsx
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View, useWindowDimensions } from "react-native";
```

Replace:

```tsx
    const sheetRef = useRef<BottomSheetModal>(null);
    const [taskId, setTaskId] = useState<number | null>(null);
    const { colors } = useTheme();
    const snapPoints = useMemo(() => ["55%", "92%"], []);
```

With:

```tsx
    const sheetRef = useRef<BottomSheetModal>(null);
    const [taskId, setTaskId] = useState<number | null>(null);
    const { colors } = useTheme();
    const { width: winWidth, height: winHeight } = useWindowDimensions();
    const isLandscape = winWidth > winHeight;
    const snapPoints = useMemo(
      () => (isLandscape ? ["75%", "95%"] : ["55%", "92%"]),
      [isLandscape],
    );
```

The sheet rebuilds its snap points on rotation; `@gorhom/bottom-sheet` 5.x re-applies snap points when the prop changes.

- [ ] **Step 2: Add `accessibilityHint` to property rows**

Open `apps/native/src/components/board/TaskDetailBody.tsx`. Find the `propertyRow` definition. Update the `<Pressable>`:

Replace:

```tsx
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        backgroundColor: pressed ? colors.surfaceHigh : "transparent",
      })}
    >
```

With:

```tsx
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={i18n.t("a11y.doubleTapToEdit")}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        opacity: pressed ? 0.7 : 1,
        backgroundColor: pressed ? colors.surfaceHigh : "transparent",
      })}
    >
```

(Note: we add `opacity: 0.7` on press for a stronger tactile-equivalent feedback. The bg shift remains.)

- [ ] **Step 3: Add the i18n keys**

Open `apps/native/src/i18n/en.json`. Inside the existing top-level object, add a top-level `"a11y"` block (append before the closing `}`):

```json
  "a11y": {
    "doubleTapToEdit": "Double tap to edit",
    "doubleTapToOpen": "Double tap to open",
    "dragHandle": "Drag handle. Long-press and drag to move.",
    "pickedUpTask": "Picked up task: {{title}}",
    "droppedTaskInColumn": "Dropped task in column: {{column}}",
    "dropCancelled": "Drop cancelled"
  },
```

Open `apps/native/src/i18n/de.json` and append:

```json
  "a11y": {
    "doubleTapToEdit": "Doppeltippen zum Bearbeiten",
    "doubleTapToOpen": "Doppeltippen zum Öffnen",
    "dragHandle": "Ziehgriff. Lange drücken und ziehen, um zu verschieben.",
    "pickedUpTask": "Aufgabe aufgenommen: {{title}}",
    "droppedTaskInColumn": "Aufgabe in Spalte abgelegt: {{column}}",
    "dropCancelled": "Ablegen abgebrochen"
  },
```

- [ ] **Step 4: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/components/board/TaskDetailSheet.tsx \
        apps/native/src/components/board/TaskDetailBody.tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): orientation-aware sheet snap points + a11y hints on property rows"
```

---

## Task 8: Title + Description Save Feedback

**Files:**
- Create: `apps/native/src/components/board/SaveIndicator.tsx`
- Modify: `apps/native/src/components/board/TaskDetailBody.tsx`
- Modify: `apps/native/src/i18n/en.json`
- Modify: `apps/native/src/i18n/de.json`

Today, `saveTitle` and `saveDescription` fire on blur with no feedback — users can't tell whether their edit was saved or dropped. Add a 12px three-state indicator next to each field: idle (nothing), saving (`ActivityIndicator`), saved (✓ in `primary` for 1s).

- [ ] **Step 1: Create the `SaveIndicator` component**

Create `apps/native/src/components/board/SaveIndicator.tsx`:

```tsx
import { ActivityIndicator, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

export type SaveState = "idle" | "saving" | "saved";

interface Props {
  state: SaveState;
  /** Optional accessibility label override. */
  label?: string;
}

/**
 * 12px three-state indicator: idle (renders nothing), saving (small spinner),
 * saved (✓ in primary). The parent flips state to "saving" on commit, then
 * to "saved" on resolve, then back to "idle" after ~1s via setTimeout.
 */
export function SaveIndicator({ state, label }: Props) {
  const { colors } = useTheme();

  if (state === "idle") return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      accessibilityLabel={label}
      style={{
        width: 16,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {state === "saving" ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.primaryForeground, fontSize: 9, fontWeight: "700" }}>
            ✓
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
```

- [ ] **Step 2: Wire title save state in TaskDetailBody**

Open `apps/native/src/components/board/TaskDetailBody.tsx`. Replace the imports block:

```tsx
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { TaskDetail, TaskPriority } from "@dragons/shared";
import { useAssigneeMutations } from "@/hooks/board/useAssigneeMutations";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { useBoardPickers } from "./BoardPickersProvider";
import { ChecklistSection } from "./ChecklistSection";
import { CommentsSection } from "./CommentsSection";
```

With:

```tsx
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { TaskDetail, TaskPriority } from "@dragons/shared";
import { useAssigneeMutations } from "@/hooks/board/useAssigneeMutations";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { useBoardPickers } from "./BoardPickersProvider";
import { ChecklistSection } from "./ChecklistSection";
import { CommentsSection } from "./CommentsSection";
import { SaveIndicator, type SaveState } from "./SaveIndicator";
```

Inside the `TaskDetailBody` function body, after the existing `description` state declaration, add save-state machinery:

```tsx
  const [titleSave, setTitleSave] = useState<SaveState>("idle");
  const [descriptionSave, setDescriptionSave] = useState<SaveState>("idle");
  const titleSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Replace the existing `saveTitle` and `saveDescription` functions:

```tsx
  const saveTitle = async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === task.title) return;
    await mutations.setTitle(task.id, trimmed);
  };

  const saveDescription = async () => {
    const next = description.trim() === "" ? null : description;
    if (next === task.description) return;
    await mutations.setDescription(task.id, next);
  };
```

With:

```tsx
  const saveTitle = async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === task.title) return;
    setTitleSave("saving");
    try {
      await mutations.setTitle(task.id, trimmed);
      setTitleSave("saved");
      if (titleSavedTimer.current) clearTimeout(titleSavedTimer.current);
      titleSavedTimer.current = setTimeout(() => setTitleSave("idle"), 1000);
    } catch {
      // useTaskMutations already toasts on failure.
      setTitleSave("idle");
    }
  };

  const saveDescription = async () => {
    const next = description.trim() === "" ? null : description;
    if (next === task.description) return;
    setDescriptionSave("saving");
    try {
      await mutations.setDescription(task.id, next);
      setDescriptionSave("saved");
      if (descriptionSavedTimer.current) clearTimeout(descriptionSavedTimer.current);
      descriptionSavedTimer.current = setTimeout(() => setDescriptionSave("idle"), 1000);
    } catch {
      setDescriptionSave("idle");
    }
  };
```

- [ ] **Step 3: Render the indicators next to the inputs**

Find the title input block:

```tsx
        <BottomSheetTextInput
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          style={{
            color: colors.foreground,
            fontSize: 22,
            fontWeight: "700",
            lineHeight: 28,
          }}
          placeholder={i18n.t("board.task.titlePlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          multiline
        />
```

Wrap it in a row with the indicator:

```tsx
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: spacing.sm,
          }}
        >
          <BottomSheetTextInput
            value={title}
            onChangeText={setTitle}
            onBlur={saveTitle}
            style={{
              flex: 1,
              color: colors.foreground,
              fontSize: 22,
              fontWeight: "700",
              lineHeight: 28,
            }}
            placeholder={i18n.t("board.task.titlePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
          />
          <View style={{ paddingTop: 6 }}>
            <SaveIndicator
              state={titleSave}
              label={
                titleSave === "saving"
                  ? i18n.t("board.task.savingTitle")
                  : titleSave === "saved"
                    ? i18n.t("board.task.savedTitle")
                    : undefined
              }
            />
          </View>
        </View>
```

Find the description input block:

```tsx
      {/* Description */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
        }}
      >
        <BottomSheetTextInput
          value={description}
          onChangeText={setDescription}
          onBlur={saveDescription}
          multiline
          style={{
            color: colors.foreground,
            fontSize: 15,
            lineHeight: 21,
            minHeight: 80,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            backgroundColor: colors.surfaceLow,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            textAlignVertical: "top",
          }}
          placeholder={i18n.t("board.task.descriptionPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
```

Replace with:

```tsx
      {/* Description */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
        }}
      >
        <View style={{ position: "relative" }}>
          <BottomSheetTextInput
            value={description}
            onChangeText={setDescription}
            onBlur={saveDescription}
            multiline
            style={{
              color: colors.foreground,
              fontSize: 15,
              lineHeight: 21,
              minHeight: 80,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingRight: spacing.md + 22,
              backgroundColor: colors.surfaceLow,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              textAlignVertical: "top",
            }}
            placeholder={i18n.t("board.task.descriptionPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
          />
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 8, right: 8 }}
          >
            <SaveIndicator
              state={descriptionSave}
              label={
                descriptionSave === "saving"
                  ? i18n.t("board.task.savingTitle")
                  : descriptionSave === "saved"
                    ? i18n.t("board.task.savedTitle")
                    : undefined
              }
            />
          </View>
        </View>
      </View>
```

- [ ] **Step 4: Add the i18n keys**

Open `apps/native/src/i18n/en.json`. Inside the existing `"board"` → `"task"` block (or wherever you keep task strings), add:

```json
        "savingTitle": "Saving",
        "savedTitle": "Saved",
```

Open `apps/native/src/i18n/de.json` and add:

```json
        "savingTitle": "Speichert",
        "savedTitle": "Gespeichert",
```

- [ ] **Step 5: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/native/src/components/board/SaveIndicator.tsx \
        apps/native/src/components/board/TaskDetailBody.tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): inline save indicator on task title and description"
```

---

## Task 9: Pager Peek + Filter-Chip Scroll Indicator

**Files:**
- Modify: `apps/native/src/components/board/BoardPager.tsx`
- Modify: `apps/native/src/components/board/FilterChips.tsx`
- Modify: `apps/native/src/hooks/board/useBoardDrag.ts`

Reduce the column width from 88% to 85% of the window so the next column "peeks" by 15%. This signals horizontal swipeability without having to swipe first. Also flip `showsHorizontalScrollIndicator` to `true` on FilterChips so users see when more chips exist off-screen.

The autoscroll horizontal logic in `useBoardDrag.ts` recomputes `columnWidth` itself; update the multiplier there to match.

- [ ] **Step 1: BoardPager column width 0.88 → 0.85**

Open `apps/native/src/components/board/BoardPager.tsx`. Find:

```tsx
    const columnWidth = useMemo(() => Math.round(winWidth * 0.88), [winWidth]);
```

Replace with:

```tsx
    const columnWidth = useMemo(() => Math.round(winWidth * 0.85), [winWidth]);
```

- [ ] **Step 2: Update useBoardDrag autoscroll to use 0.85**

Open `apps/native/src/hooks/board/useBoardDrag.ts`. Find inside the `useEffect` autoscroll loop:

```ts
      const columnWidth = Math.round(pagerWidth * 0.88);
```

Replace with:

```ts
      // Must match BoardPager column width multiplier (0.85).
      const columnWidth = Math.round(pagerWidth * 0.85);
```

- [ ] **Step 3: FilterChips scroll indicator + content padding**

Open `apps/native/src/components/board/FilterChips.tsx`. Replace:

```tsx
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
```

With:

```tsx
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={true}
      persistentScrollbar={true}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.md,
        gap: spacing.xs,
        alignItems: "center",
      }}
    >
```

(`persistentScrollbar` is Android-only and harmless on iOS — it keeps the indicator visible after the initial scroll. iOS shows the indicator briefly on layout when `showsHorizontalScrollIndicator={true}`. We bump `paddingBottom` from `spacing.sm` to `spacing.md` so the indicator has clearance below the chips.)

- [ ] **Step 4: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/components/board/BoardPager.tsx \
        apps/native/src/components/board/FilterChips.tsx \
        apps/native/src/hooks/board/useBoardDrag.ts
git commit -m "feat(native): pager column peek (0.85) + visible filter-chip scroll indicator"
```

---

## Task 10: Swipe-to-Delete + Accessibility Pass

**Files:**
- Modify: `apps/native/src/components/board/TaskCard.tsx`
- Modify: `apps/native/src/components/board/BoardColumn.tsx`
- Modify: `apps/native/src/components/board/BoardPager.tsx`
- Modify: `apps/native/src/components/board/BoardHeader.tsx`
- Modify: `apps/native/src/components/board/FilterChips.tsx`
- Modify: `apps/native/src/components/board/TaskDetailSheet.tsx`
- Modify: `apps/native/src/components/board/AssigneePickerSheet.tsx`
- Modify: `apps/native/src/components/board/PriorityPickerSheet.tsx`
- Modify: `apps/native/src/components/board/DuePickerSheet.tsx`
- Modify: `apps/native/src/components/board/MoveToSheet.tsx`
- Modify: `apps/native/src/components/board/QuickCreateSheet.tsx`
- Modify: `apps/native/src/components/board/TaskContextMenu.tsx`
- Modify: `apps/native/src/hooks/board/useBoardDrag.ts`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

Two related improvements:
1. **Swipe-to-delete on TaskCard**, surfacing the same toast-undo flow that already exists for long-press → delete (Phase 1 Task 10 added `handleTaskLongPress`'s delete branch). We factor that branch into a reusable callback (`onDelete`) and pass it down so the swipe handler can call it. The API has no archive endpoint — only delete.
2. **A11y pass**: every key interactive component gets a `testID`, every picker / property row / drag handle gets an `accessibilityHint`, and the drag lifecycle calls `AccessibilityInfo.announceForAccessibility` on start, drop, and cancel.

- [ ] **Step 1: Extract a `handleTaskDelete(task)` callback in the screen**

Open `apps/native/src/app/admin/boards/[id].tsx`. Find `handleTaskLongPress`. The body has an `else if (action === "delete") { ... }` branch that does optimistic delete + toast undo (added in Phase 1 Task 10). Extract that branch's logic into a named function:

After `const toast = useToast();` (Phase 1 added this), add:

```tsx
  const handleTaskDelete = useCallback(
    (task: TaskCardData) => {
      haptics.warning();
      const snapshotTitle = task.title;
      const snapshotColumnId = task.columnId;
      const snapshotPosition = task.position;

      void taskMutations.deleteTask(task.id).then(() => {
        toast.show({
          title: i18n.t("toast.taskDeleted"),
          action: {
            label: i18n.t("toast.undo"),
            onPress: () => {
              void adminBoardApi
                .createTask(boardId, {
                  columnId: snapshotColumnId,
                  title: snapshotTitle,
                  position: snapshotPosition,
                })
                .then(() => {
                  void mutateTasks();
                });
            },
          },
        });
      });
    },
    [boardId, taskMutations, toast, mutateTasks],
  );
```

(If your Phase 1 implementation captured more snapshot fields (description, priority, dueDate), keep them — adapt the `createTask` call accordingly. The exact snapshot shape lives in your Phase 1 commit.)

Update `handleTaskLongPress`'s delete branch to call the extracted helper:

Replace the existing inline delete branch:

```tsx
          } else if (action === "delete") {
            haptics.warning();
            const snapshotTitle = task.title;
            // ... rest of inline block ...
          }
```

With:

```tsx
          } else if (action === "delete") {
            handleTaskDelete(task);
          }
```

- [ ] **Step 2: Pass `onTaskDelete` through the prop chain**

Open `apps/native/src/components/board/BoardPager.tsx`. Add to props interface:

```ts
  /** Called when the user requests to delete a task (swipe right or context menu). */
  onTaskDelete?: (task: TaskCardData) => void;
```

Destructure it and forward to `<BoardColumn>`:

```tsx
            onTaskDelete={onTaskDelete}
```

Open `apps/native/src/components/board/BoardColumn.tsx`. Add to props interface:

```ts
  onTaskDelete?: (task: TaskCardData) => void;
```

Destructure it and forward to `<TaskCard>`:

```tsx
              onTaskDelete={onTaskDelete}
```

(In the screen, pass the new `onTaskDelete={handleTaskDelete}` prop on the `<BoardPager>` call.)

- [ ] **Step 3: Wrap TaskCard in `Swipeable`**

Open `apps/native/src/components/board/TaskCard.tsx`. Replace the imports for gesture handler:

```tsx
import { Gesture, GestureDetector } from "react-native-gesture-handler";
```

With:

```tsx
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
```

Add to `interface TaskCardProps`:

```tsx
interface TaskCardProps {
  task: TaskCardData;
  onPress: (task: TaskCardData) => void;
  onLongPress?: (task: TaskCardData) => void;
  onDrag?: TaskDragCallbacks;
  isBeingDragged?: boolean;
  recentlyDropped?: boolean;
  /** Called when the user swipes the card right past the action threshold. */
  onTaskDelete?: (task: TaskCardData) => void;
  onMeasure?: (taskId: number, rect: TaskContentRect) => void;
}
```

Destructure in the function:

```tsx
export function TaskCard({
  task,
  onPress,
  onLongPress,
  onDrag,
  isBeingDragged = false,
  recentlyDropped = false,
  onTaskDelete,
  onMeasure,
}: TaskCardProps) {
```

At the bottom of the file, wrap the existing return logic. Find:

```tsx
  if (!onDrag) {
    return cardContent;
  }

  // ... drag gesture setup ...

  return (
    <GestureDetector gesture={dragGesture}>
      {cardContent}
    </GestureDetector>
  );
}
```

Replace with:

```tsx
  // Right-swipe action: Delete (matches long-press menu's delete flow).
  const renderRightActions = () => (
    <View
      style={{
        backgroundColor: colors.destructive,
        justifyContent: "center",
        alignItems: "flex-end",
        paddingHorizontal: spacing.lg,
        borderRadius: 8,
      }}
    >
      <Text
        style={{
          color: colors.destructiveForeground,
          fontWeight: "700",
          fontSize: 13,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {i18n.t("board.task.swipeDelete")}
      </Text>
    </View>
  );

  const swipeWrapped = onTaskDelete ? (
    <Swipeable
      friction={2}
      rightThreshold={64}
      renderRightActions={renderRightActions}
      onSwipeableOpen={(direction) => {
        if (direction === "right") {
          onTaskDelete(task);
        }
      }}
      testID={`task-card-swipeable-${task.id}`}
    >
      {cardContent}
    </Swipeable>
  ) : (
    cardContent
  );

  if (!onDrag) {
    return swipeWrapped;
  }

  const { start: safeStart, move: safeMove, end: safeEnd } = onDrag;

  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(() => {
      "worklet";
      const m = measure(cardRef);
      if (!m) return;
      runOnJS(safeStart)(task, {
        x: m.pageX,
        y: m.pageY,
        width: m.width,
        height: m.height,
      });
    })
    .onUpdate((e) => {
      "worklet";
      runOnJS(safeMove)(e.absoluteX, e.absoluteY);
    })
    .onEnd(() => {
      "worklet";
      runOnJS(safeEnd)();
    })
    .onFinalize((_e, success) => {
      "worklet";
      if (!success) {
        runOnJS(safeEnd)();
      }
    });

  return (
    <GestureDetector gesture={dragGesture}>
      {swipeWrapped}
    </GestureDetector>
  );
}
```

(`react-native-gesture-handler/ReanimatedSwipeable` is the Reanimated-based Swipeable in v2.x. If your project's gesture-handler resolves a different `Swipeable` path, fall back to `import Swipeable from "react-native-gesture-handler"` — the API is the same.)

- [ ] **Step 4: Add `testID`s and a11y hints to TaskCard**

In the same file, find the `<AnimatedPressable>` declaration (the card content body) and add:

```tsx
      testID={`task-card-${task.id}`}
      accessibilityHint={i18n.t("a11y.doubleTapToOpen")}
```

(They go alongside the existing `accessibilityRole` and `accessibilityLabel` props.)

- [ ] **Step 5: Add `testID`s to other key components**

`BoardPager.tsx`: on the outer `<ScrollView>`:

```tsx
      <ScrollView
        ref={scrollRef}
        testID="board-pager"
        horizontal
        decelerationRate="fast"
        ...
```

`BoardColumn.tsx`: on the outer `<View style={{ width, ... }}>`:

```tsx
      <View
        testID={`board-column-${column.id}`}
        style={{ width, paddingHorizontal: spacing.sm }}
      >
```

`BoardHeader.tsx`: on the outer `<ScrollView>`:

```tsx
    <ScrollView
      testID="board-header"
      horizontal
      ...
```

In each `<Pressable>` for a column pill, add:

```tsx
            testID={`board-header-pill-${col.id}`}
```

`FilterChips.tsx`: on the outer `<ScrollView>`:

```tsx
    <ScrollView
      testID="filter-chips"
      horizontal
      ...
```

`TaskDetailSheet.tsx`: on the `<BottomSheetModal>`:

```tsx
      <BottomSheetModal
        ref={sheetRef}
        testID="task-detail-sheet"
        ...
```

`AssigneePickerSheet.tsx`, `PriorityPickerSheet.tsx`, `DuePickerSheet.tsx`, `MoveToSheet.tsx`, `QuickCreateSheet.tsx`: each `<BottomSheetModal>` gets a `testID`:

```tsx
testID="assignee-picker-sheet"
testID="priority-picker-sheet"
testID="due-picker-sheet"
testID="move-to-sheet"
testID="quick-create-sheet"
```

`TaskContextMenu.tsx`: on the wrapping container view (the one rendered when the menu is open), add:

```tsx
testID="task-context-menu"
```

- [ ] **Step 6: Drag accessibility announcements in `useBoardDrag`**

Open `apps/native/src/hooks/board/useBoardDrag.ts`. Add to imports at top:

```ts
import { AccessibilityInfo } from "react-native";
import { i18n } from "@/lib/i18n";
```

Find `handleDragStart`. Add at the end of its body:

```ts
      AccessibilityInfo.announceForAccessibility(
        i18n.t("a11y.pickedUpTask", { title: task.title }),
      );
```

Find `handleDragEnd`. After the existing successful-move block (`if (dropTarget && ...)`), add an `else` for the cancel/no-op case:

```ts
    if (
      dropTarget &&
      (dropTarget.columnId !== snapshot.task.columnId ||
        dropTarget.position !== snapshot.task.position)
    ) {
      haptics.success();
      setRecentlyDroppedTaskId(snapshot.task.id);
      setTimeout(() => setRecentlyDroppedTaskId(null), 400);
      void moveTask(snapshot.task.id, dropTarget.columnId, dropTarget.position);
      const targetColumn = columnsRef.current.find(
        (c) => c.id === dropTarget.columnId,
      );
      AccessibilityInfo.announceForAccessibility(
        i18n.t("a11y.droppedTaskInColumn", {
          column: targetColumn?.name ?? "",
        }),
      );
    } else {
      AccessibilityInfo.announceForAccessibility(i18n.t("a11y.dropCancelled"));
    }
```

- [ ] **Step 7: Add the swipeDelete i18n key**

Open `apps/native/src/i18n/en.json`. Inside `"board"` → `"task"`, add:

```json
        "swipeDelete": "Delete",
```

Open `apps/native/src/i18n/de.json` and add:

```json
        "swipeDelete": "Löschen",
```

- [ ] **Step 8: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/native/src/components/board/TaskCard.tsx \
        apps/native/src/components/board/BoardColumn.tsx \
        apps/native/src/components/board/BoardPager.tsx \
        apps/native/src/components/board/BoardHeader.tsx \
        apps/native/src/components/board/FilterChips.tsx \
        apps/native/src/components/board/TaskDetailSheet.tsx \
        apps/native/src/components/board/AssigneePickerSheet.tsx \
        apps/native/src/components/board/PriorityPickerSheet.tsx \
        apps/native/src/components/board/DuePickerSheet.tsx \
        apps/native/src/components/board/MoveToSheet.tsx \
        apps/native/src/components/board/QuickCreateSheet.tsx \
        apps/native/src/components/board/TaskContextMenu.tsx \
        apps/native/src/hooks/board/useBoardDrag.ts \
        apps/native/src/app/admin/boards/[id].tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): swipe-to-delete on tasks + a11y testIDs, hints, drag announcements"
```

---

## Task 11: Manual Verification Matrix

This phase is motion- and a11y-heavy with no automated UI test harness. Verification is a developer-driven smoke pass on iOS simulator + Android emulator with VoiceOver / TalkBack toggled on for the a11y rows.

- [ ] **Step 1: Run static checks**

```bash
pnpm --filter @dragons/native typecheck
pnpm --filter @dragons/shared test
pnpm --filter @dragons/shared typecheck
```

Expected: all PASS.

- [ ] **Step 2: Boot the native app**

```bash
pnpm --filter @dragons/native start
```

In a separate terminal:

```bash
pnpm --filter @dragons/native ios
```

Repeat with `pnpm --filter @dragons/native android` afterwards.

- [ ] **Step 3: Smoke matrix — record outcome inline in commit message**

| # | Scenario | Expected | iOS | Android |
|---|---|---|---|---|
| 1 | Long-press a card and start dragging | Ghost springs to ~104%, lifts shadow | ✅/❌ | ✅/❌ |
| 2 | Drag horizontally fast | Ghost tilts ±2deg in motion direction | ✅/❌ | ✅/❌ |
| 3 | Drop card in different column | Card pulses 1 → 1.05 → 1 in new column | ✅/❌ | ✅/❌ |
| 4 | Hover ghost over different column | Column tints, shadow fades in (~180ms) | ✅/❌ | ✅/❌ |
| 5 | Set task priority to urgent | 4px red stripe appears on left edge | ✅/❌ | ✅/❌ |
| 6 | Set task priority to high / low / normal | Heat / muted / no stripe respectively | ✅/❌ | ✅/❌ |
| 7 | Open priority picker | Each option shows a colored dot matching its stripe | ✅/❌ | ✅/❌ |
| 8 | Check / uncheck a checklist item | Checkbox scales 1 → 1.18 → 1 | ✅/❌ | ✅/❌ |
| 9 | Check the last unchecked item (99 → 100%) | Bar animates to 100%, briefly glows, success haptic fires | ✅/❌ | ✅/❌ |
| 10 | Open Boards list while data is loading | 4 skeleton rows appear with shimmer | ✅/❌ | ✅/❌ |
| 11 | Open a board while task data is loading | Skeleton task cards appear, shape-matched | ✅/❌ | ✅/❌ |
| 12 | Rotate device to landscape with task detail open | Sheet snap points expand to 75%/95% | ✅/❌ | n/a |
| 13 | Edit task title and tap outside | Spinner appears, then ✓ for ~1s, then idle | ✅/❌ | ✅/❌ |
| 14 | Edit title with Wi-Fi off | Toast "Couldn't save" fires, indicator returns to idle | ✅/❌ | ✅/❌ |
| 15 | Edit description and blur | Same indicator behavior in top-right of textarea | ✅/❌ | ✅/❌ |
| 16 | View board with many columns | ~15% of next column visible (peek) | ✅/❌ | ✅/❌ |
| 17 | Drag card to far-right edge of screen | Pager autoscrolls to next column at correct rate | ✅/❌ | ✅/❌ |
| 18 | View board with many filter chips active | Horizontal scroll indicator visible below chips | ✅/❌ | ✅/❌ |
| 19 | Swipe a task card to the right | "Delete" action surface appears; release triggers delete + toast undo | ✅/❌ | ✅/❌ |
| 20 | Tap "Undo" on task delete toast | Task reappears in original column / position | ✅/❌ | ✅/❌ |
| 21 | Enable VoiceOver / TalkBack, focus task card | Reads title + "Double tap to open" | ✅/❌ | ✅/❌ |
| 22 | Long-press card with VoiceOver on, drag to new column | Hears "Picked up task: …" then "Dropped task in column: …" | ✅/❌ | ✅/❌ |
| 23 | Cancel a drag (release outside any column) | Hears "Drop cancelled" | ✅/❌ | ✅/❌ |
| 24 | Focus a property row in task detail | Hears label + value + "Double tap to edit" | ✅/❌ | ✅/❌ |
| 25 | Inspect tree with React DevTools / accessibility inspector | Sees `testID` set on TaskCard, BoardColumn, BoardPager, FilterChips, sheets | ✅/❌ | ✅/❌ |

- [ ] **Step 4: Final cleanup commit (only if needed)**

If lint, typecheck, or any orphan changes remain, fix them and commit. Otherwise:

```bash
git status
```

Verify clean tree. Phase 3 is complete when the matrix is fully ✅.

---

## Self-Review Notes

Re-verifying the plan against the original Phase 3 spec:

- **Drag ghost spring + tilt** — Task 1 ✅
- **Drop animation pulse** — Task 2 ✅
- **Drop target column visual upgrade** — Task 3 ✅
- **Priority left-edge stripe + picker dots** — Task 4 ✅
- **Checklist completion animation** (progress, glow, checkbox spring, haptic) — Task 5 ✅
- **Skeleton fidelity** (TaskCardSkeleton + BoardListSkeleton) — Task 6 ✅
- **Sheet snap points orientation-aware + property row hints** — Task 7 ✅
- **Title save feedback** (extended to description) — Task 8 ✅
- **Pager peek + filter-chip scroll indicator** — Task 9 ✅
- **Swipe gestures + accessibility pass** — Task 10 ✅
- **Manual verification matrix** — Task 11 ✅

Naming conventions consistent with Phase 1: `useToast` already wired (Task 5 reuses), `formatDueShort` exported from TaskCard (Task 1 imports), 44pt hit targets preserved (no chip / pill heights regress in this phase). Phase 2 conventions respected: `dueDateBucket(iso)` is *not* re-implemented here (it's referenced by TaskDetailBody's existing `dueColor` logic but not duplicated), and AvatarStack still respects `useWindowDimensions` (we don't touch it). The `recentlyDroppedTaskId` flag is the only new piece of state introduced; it lives inside `useBoardDrag` and clears itself after 400ms — no leaked timers because the hook's lifetime is the screen's lifetime.

API surface check: no new endpoints invoked. Swipe-to-delete reuses `taskMutations.deleteTask` from Phase 1 plus the same toast-undo create flow. There is intentionally no archive — the API has no archive endpoint.

No placeholders remain. Every step contains the actual content needed.
