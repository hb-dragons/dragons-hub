# Native Kanban Phase 1 — Parity & Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the fatal gaps between the native kanban board and its web/API counterpart: silent mutation failures stop, board/column CRUD works on native, destructive actions get undo, hit targets meet HIG, empty states stop being broken.

**Architecture:** Add a tiny in-tree toast subsystem (`useToast` hook + `<ToastHost>` portal-equivalent) so every mutation hook surfaces success/error. Add `useBoardMutations` and `useColumnMutations` paralleling the existing `useTaskMutations` shape. Add new screens and bottom sheets for board create/edit/delete and column add/edit/delete/reorder. Replace `Alert.alert` confirm-then-delete on tasks/checklist/comments with optimistic delete + undo toast. Bump filter-chip and column-pill heights to 44 px. Make the drag ghost share `formatDueShort` with `TaskCard` so date format stays stable mid-drag.

**Tech Stack:** React Native 0.83.4, Expo 55, expo-router 55, `@gorhom/bottom-sheet` 5.2.10, `react-native-reanimated` 4.3.0, `react-native-gesture-handler` 2.31.1, SWR 2.4.1, `i18n-js` 4.5.1, Vitest 4 (for `@dragons/shared` pure logic only — native has no test runner; UI changes get manual verification).

---

## File Structure

**New files:**
- `apps/native/src/components/ui/Toast.tsx` — single visual toast component
- `apps/native/src/components/ui/ToastHost.tsx` — root-level host that renders the active toast
- `apps/native/src/hooks/useToast.tsx` — `<ToastProvider>` + `useToast()` hook with `show({ title, action?, variant? })`
- `apps/native/src/hooks/board/useBoardMutations.ts` — create/update/delete board
- `apps/native/src/hooks/board/useColumnMutations.ts` — add/update/delete/reorder column
- `apps/native/src/components/board/BoardSettingsSheet.tsx` — bottom sheet for rename/delete board
- `apps/native/src/components/board/CreateBoardSheet.tsx` — bottom sheet for new board
- `apps/native/src/components/board/ColumnSettingsSheet.tsx` — bottom sheet for column rename/color/done-flag/delete
- `apps/native/src/components/board/AddColumnSheet.tsx` — bottom sheet for adding a column
- `packages/shared/src/board-undo.ts` — pure helper that produces an UndoEntry for delete operations
- `packages/shared/src/board-undo.test.ts` — vitest for the helper

**Modified files:**
- `apps/native/src/app/_layout.tsx` — wrap app with `<ToastProvider>` + render `<ToastHost>`
- `apps/native/src/app/admin/boards/index.tsx` — header create button, empty-state CTA, navigate-on-create
- `apps/native/src/app/admin/boards/[id].tsx` — empty-state for 0 columns, settings header button, mount sheets, replace alert-delete with toast-undo, wire pager add-column
- `apps/native/src/components/board/BoardPager.tsx` — render trailing "+ Add column" pill
- `apps/native/src/components/board/BoardHeader.tsx` — pill height 32→44, long-press to open ColumnSettingsSheet
- `apps/native/src/components/board/BoardColumn.tsx` — long-press header to open ColumnSettingsSheet
- `apps/native/src/components/board/FilterChips.tsx` — chip height 28→44, hitSlop on × button bumped, accessibility label fix
- `apps/native/src/components/board/TaskCardDragGhost.tsx` — import + use `formatDueShort`
- `apps/native/src/components/board/TaskCard.tsx` — export `formatDueShort` for ghost reuse
- `apps/native/src/components/board/TaskDetailBody.tsx` — title char counter at >270, single-source `formatDueShort` for due display
- `apps/native/src/components/board/ChecklistSection.tsx` — replace alert-delete with optimistic + undo toast
- `apps/native/src/components/board/CommentsSection.tsx` — replace alert-delete with optimistic + undo toast
- `apps/native/src/hooks/board/useTaskMutations.ts` — add `deleteTaskWithUndo` returning rollback
- `apps/native/src/hooks/board/useChecklistMutations.ts` — add `deleteItemWithUndo`
- `apps/native/src/hooks/board/useCommentMutations.ts` — add `removeWithUndo`
- `apps/native/src/hooks/board/useMoveTask.ts` — toast on move failure
- `apps/native/src/i18n/en.json` — add `toast.*`, `board.actions.*`, `board.column.actions.*`, `board.column.colors.*` keys
- `apps/native/src/i18n/de.json` — same keys, German
- `packages/shared/src/index.ts` — export new `board-undo` helpers

**Files NOT touched in Phase 1 (deferred to Phase 2/3):**
- Search/sort/filter persistence — Phase 2
- Column drag-reorder — Phase 2
- Multi-assignee filter, due-date color spectrum, avatar overflow — Phase 2
- Drag ghost tilt/spring, drop pulse, swipe gestures, skeleton fidelity, a11y announcements — Phase 3

---

## Task 1: Toast Infrastructure

**Files:**
- Create: `apps/native/src/hooks/useToast.tsx`
- Create: `apps/native/src/components/ui/Toast.tsx`
- Create: `apps/native/src/components/ui/ToastHost.tsx`

- [ ] **Step 1: Create the Toast visual component**

Create `apps/native/src/components/ui/Toast.tsx` with the following content:

```tsx
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

export type ToastVariant = "default" | "success" | "error";

export interface ToastProps {
  title: string;
  variant?: ToastVariant;
  /** Optional action button (e.g. Undo). */
  action?: { label: string; onPress: () => void };
  /** Auto-dismiss after this many ms. Defaults to 4000. */
  durationMs?: number;
  onDismiss: () => void;
}

export function Toast({
  title,
  variant = "default",
  action,
  durationMs = 4000,
  onDismiss,
}: ToastProps) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 180 });
    translateY.value = withTiming(0, { duration: 180 });

    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) runOnJS(onDismiss)();
      });
      translateY.value = withTiming(20, { duration: 180 });
    }, durationMs);

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const bg =
    variant === "error"
      ? colors.destructive
      : variant === "success"
        ? colors.primary
        : colors.surfaceHighest;
  const fg =
    variant === "error"
      ? colors.destructiveForeground
      : variant === "success"
        ? colors.primaryForeground
        : colors.foreground;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          left: spacing.lg,
          right: spacing.lg,
          bottom: insets.bottom + spacing.lg,
        },
        animStyle,
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: bg,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          gap: spacing.md,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <Text
          style={{
            flex: 1,
            color: fg,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        {action ? (
          <Pressable
            onPress={() => {
              action.onPress();
              onDismiss();
            }}
            accessibilityRole="button"
            hitSlop={12}
            style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}
          >
            <Text
              style={{
                color: fg,
                fontSize: 14,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
```

- [ ] **Step 2: Create the toast hook + provider**

Create `apps/native/src/hooks/useToast.tsx` with the following content:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ToastVariant } from "@/components/ui/Toast";

export interface ShowToastArgs {
  title: string;
  variant?: ToastVariant;
  action?: { label: string; onPress: () => void };
  durationMs?: number;
}

interface ActiveToast extends ShowToastArgs {
  /** Monotonically increasing id so the host re-mounts on rapid show calls. */
  id: number;
}

interface ToastContextValue {
  show: (args: ShowToastArgs) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const ActiveToastContext = createContext<ActiveToast | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveToast | null>(null);
  const idRef = useRef(0);

  const show = useCallback((args: ShowToastArgs) => {
    idRef.current += 1;
    setActive({ ...args, id: idRef.current });
  }, []);

  const dismiss = useCallback(() => {
    setActive(null);
  }, []);

  const api = useMemo<ToastContextValue>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      <ActiveToastContext.Provider value={active}>{children}</ActiveToastContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function useActiveToast(): ActiveToast | null {
  return useContext(ActiveToastContext);
}
```

- [ ] **Step 3: Create the toast host**

Create `apps/native/src/components/ui/ToastHost.tsx` with the following content:

```tsx
import { Toast } from "./Toast";
import { useActiveToast, useToast } from "@/hooks/useToast";

export function ToastHost() {
  const active = useActiveToast();
  const { dismiss } = useToast();
  if (!active) return null;
  return (
    <Toast
      key={active.id}
      title={active.title}
      variant={active.variant}
      action={active.action}
      durationMs={active.durationMs}
      onDismiss={dismiss}
    />
  );
}
```

- [ ] **Step 4: Wire ToastProvider + ToastHost into root layout**

Modify `apps/native/src/app/_layout.tsx`. Find the `RootLayout` return block and update the provider tree:

Before:
```tsx
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <KeyboardProvider>
          <SWRConfig value={swrConfig}>
            <LocaleProvider>
              <ThemeProvider>
                <BoardPickersProvider>
                  <BottomSheetModalProvider>
                    <BoardPickersSheets />
                    <RootNavigator />
                  </BottomSheetModalProvider>
                </BoardPickersProvider>
              </ThemeProvider>
            </LocaleProvider>
          </SWRConfig>
        </KeyboardProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
```

After:
```tsx
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <KeyboardProvider>
          <SWRConfig value={swrConfig}>
            <LocaleProvider>
              <ThemeProvider>
                <ToastProvider>
                  <BoardPickersProvider>
                    <BottomSheetModalProvider>
                      <BoardPickersSheets />
                      <RootNavigator />
                      <ToastHost />
                    </BottomSheetModalProvider>
                  </BoardPickersProvider>
                </ToastProvider>
              </ThemeProvider>
            </LocaleProvider>
          </SWRConfig>
        </KeyboardProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
```

Also add the imports at the top of the file:

```tsx
import { ToastProvider } from "@/hooks/useToast";
import { ToastHost } from "@/components/ui/ToastHost";
```

- [ ] **Step 5: Add toast i18n keys**

Open `apps/native/src/i18n/en.json`. Add a top-level `"toast"` block (alphabetic insertion is not strict — append before the closing `}` of the document, after the last existing top-level key):

```json
  "toast": {
    "saved": "Changes saved",
    "saveFailed": "Couldn't save",
    "deleteFailed": "Couldn't delete",
    "moveFailed": "Couldn't move task",
    "createFailed": "Couldn't create",
    "undo": "Undo",
    "taskDeleted": "Task deleted",
    "checklistItemDeleted": "Item deleted",
    "commentDeleted": "Comment deleted",
    "boardCreated": "Board created",
    "boardDeleted": "Board deleted",
    "columnAdded": "Column added",
    "columnDeleted": "Column deleted"
  },
```

Open `apps/native/src/i18n/de.json` and append:

```json
  "toast": {
    "saved": "Änderungen gespeichert",
    "saveFailed": "Speichern fehlgeschlagen",
    "deleteFailed": "Löschen fehlgeschlagen",
    "moveFailed": "Verschieben fehlgeschlagen",
    "createFailed": "Erstellen fehlgeschlagen",
    "undo": "Rückgängig",
    "taskDeleted": "Aufgabe gelöscht",
    "checklistItemDeleted": "Eintrag gelöscht",
    "commentDeleted": "Kommentar gelöscht",
    "boardCreated": "Board erstellt",
    "boardDeleted": "Board gelöscht",
    "columnAdded": "Spalte hinzugefügt",
    "columnDeleted": "Spalte gelöscht"
  },
```

- [ ] **Step 6: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS (no compile errors).

- [ ] **Step 7: Commit**

```bash
git add apps/native/src/components/ui/Toast.tsx \
        apps/native/src/components/ui/ToastHost.tsx \
        apps/native/src/hooks/useToast.tsx \
        apps/native/src/app/_layout.tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): add toast subsystem for board mutation feedback"
```

---

## Task 2: Wire Toasts Into Existing Mutation Hooks

**Files:**
- Modify: `apps/native/src/hooks/board/useTaskMutations.ts`
- Modify: `apps/native/src/hooks/board/useChecklistMutations.ts`
- Modify: `apps/native/src/hooks/board/useCommentMutations.ts`
- Modify: `apps/native/src/hooks/board/useAssigneeMutations.ts`
- Modify: `apps/native/src/hooks/board/useMoveTask.ts`

The existing hooks throw on failure but nothing catches; users see no error. Wrap each mutation in a try/catch that emits a toast on failure. Success toasts are intentionally omitted for routine field edits (the value updates in place, which is its own confirmation) — only destructive operations announce success in Task 5.

- [ ] **Step 1: Update `useTaskMutations` to emit error toasts**

Read the current file at `apps/native/src/hooks/board/useTaskMutations.ts` (already exists — see existing source). Replace its full contents with:

```ts
import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import type { TaskDetail, TaskPriority } from "@dragons/shared";
import type { UpdateTaskBody } from "@dragons/api-client";
import { taskKey } from "./useTaskDetail";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useTaskMutations(boardId: number) {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function patch(taskId: number, body: UpdateTaskBody): Promise<TaskDetail> {
    try {
      const next = await adminBoardApi.updateTask(taskId, body);
      await Promise.all([
        mutate(taskKey(taskId), next, { revalidate: false }),
        mutate(
          (key) => Array.isArray(key) && key[0] === tasksPrefix(boardId),
        ),
      ]);
      return next;
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
      throw error;
    }
  }

  async function deleteTask(id: number) {
    try {
      await adminBoardApi.deleteTask(id);
      await Promise.all([
        mutate(taskKey(id), undefined, { revalidate: false }),
        mutate(
          (key) => Array.isArray(key) && key[0] === tasksPrefix(boardId),
        ),
      ]);
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.deleteFailed"), variant: "error" });
      throw error;
    }
  }

  return {
    setTitle: (id: number, title: string) => patch(id, { title }),
    setDescription: (id: number, description: string | null) =>
      patch(id, { description }),
    setPriority: (id: number, priority: TaskPriority) =>
      patch(id, { priority }),
    setDueDate: (id: number, dueDate: string | null) =>
      patch(id, { dueDate }),
    deleteTask,
  };
}
```

- [ ] **Step 2: Update `useChecklistMutations`**

Replace full contents of `apps/native/src/hooks/board/useChecklistMutations.ts` with:

```ts
import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import { taskKey } from "./useTaskDetail";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useChecklistMutations(boardId: number) {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function reconcile(taskId: number) {
    await Promise.all([
      mutate(taskKey(taskId)),
      mutate(
        (key) => Array.isArray(key) && key[0] === tasksPrefix(boardId),
      ),
    ]);
  }

  async function withErrorToast<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
      throw error;
    }
  }

  return {
    addItem: (taskId: number, label: string) =>
      withErrorToast(async () => {
        await adminBoardApi.addChecklistItem(taskId, label);
        await reconcile(taskId);
      }),
    toggle: (taskId: number, itemId: number, isChecked: boolean) =>
      withErrorToast(async () => {
        await adminBoardApi.updateChecklistItem(taskId, itemId, { isChecked });
        await reconcile(taskId);
      }),
    deleteItem: (taskId: number, itemId: number) =>
      withErrorToast(async () => {
        await adminBoardApi.deleteChecklistItem(taskId, itemId);
        await reconcile(taskId);
      }),
  };
}
```

- [ ] **Step 3: Update `useCommentMutations`**

Replace full contents of `apps/native/src/hooks/board/useCommentMutations.ts` with:

```ts
import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import { taskKey } from "./useTaskDetail";

export function useCommentMutations() {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function withErrorToast<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
      throw error;
    }
  }

  return {
    add: (taskId: number, body: string) =>
      withErrorToast(async () => {
        await adminBoardApi.addComment(taskId, body);
        await mutate(taskKey(taskId));
      }),
    update: (taskId: number, commentId: number, body: string) =>
      withErrorToast(async () => {
        await adminBoardApi.updateComment(taskId, commentId, body);
        await mutate(taskKey(taskId));
      }),
    remove: (taskId: number, commentId: number) =>
      withErrorToast(async () => {
        await adminBoardApi.deleteComment(taskId, commentId);
        await mutate(taskKey(taskId));
      }),
  };
}
```

- [ ] **Step 4: Update `useAssigneeMutations`**

Replace full contents of `apps/native/src/hooks/board/useAssigneeMutations.ts` with:

```ts
import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import { taskKey } from "./useTaskDetail";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useAssigneeMutations(boardId: number) {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function reconcile(taskId: number) {
    await Promise.all([
      mutate(taskKey(taskId)),
      mutate((key) => Array.isArray(key) && key[0] === tasksPrefix(boardId)),
    ]);
  }

  async function withErrorToast<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
      throw error;
    }
  }

  return {
    add: (taskId: number, userId: string) =>
      withErrorToast(async () => {
        await adminBoardApi.addAssignee(taskId, userId);
        await reconcile(taskId);
      }),
    remove: (taskId: number, userId: string) =>
      withErrorToast(async () => {
        await adminBoardApi.removeAssignee(taskId, userId);
        await reconcile(taskId);
      }),
  };
}
```

- [ ] **Step 5: Update `useMoveTask` to emit error toast**

Open `apps/native/src/hooks/board/useMoveTask.ts`. Replace the full file with:

```ts
// Note: this hook's rollback path is not unit-tested because @dragons/native
// has no test harness yet. The pure reorder logic it calls (applyTaskMove)
// is covered by @dragons/shared's test suite.
import { useSWRConfig } from "swr";
import type { Arguments } from "swr";
import { adminBoardApi } from "@/lib/api";
import { applyTaskMove } from "@dragons/shared";
import type { TaskCardData } from "@dragons/shared";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useMoveTask(boardId: number) {
  const { cache, mutate } = useSWRConfig();
  const toast = useToast();

  return async function moveTask(
    taskId: number,
    targetColumnId: number,
    targetPosition: number,
  ): Promise<void> {
    const prefix = tasksPrefix(boardId);

    const snapshots = new Map<Arguments, TaskCardData[] | undefined>();
    const cacheKeys = (cache as unknown as { keys: () => IterableIterator<Arguments> }).keys();
    for (const key of cacheKeys) {
      if (Array.isArray(key) && key[0] === prefix) {
        const entry = (cache as unknown as { get: (k: Arguments) => { data?: unknown } | undefined }).get(key);
        if (entry) snapshots.set(key, entry.data as TaskCardData[] | undefined);
      }
    }

    await mutate(
      (key) => Array.isArray(key) && key[0] === prefix,
      (prev: TaskCardData[] | undefined) =>
        prev ? applyTaskMove(prev, taskId, targetColumnId, targetPosition) : prev,
      { revalidate: false },
    );

    try {
      await adminBoardApi.moveTask(taskId, {
        columnId: targetColumnId,
        position: targetPosition,
      });
      await mutate((key) => Array.isArray(key) && key[0] === prefix);
    } catch (error) {
      for (const [key, value] of snapshots) {
        await mutate(key, value, { revalidate: false });
      }
      void mutate((key) => Array.isArray(key) && key[0] === prefix);
      haptics.warning();
      toast.show({ title: i18n.t("toast.moveFailed"), variant: "error" });
      throw error;
    }
  };
}
```

- [ ] **Step 6: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/native/src/hooks/board/useTaskMutations.ts \
        apps/native/src/hooks/board/useChecklistMutations.ts \
        apps/native/src/hooks/board/useCommentMutations.ts \
        apps/native/src/hooks/board/useAssigneeMutations.ts \
        apps/native/src/hooks/board/useMoveTask.ts
git commit -m "feat(native): wire toast feedback into board mutation hooks"
```

---

## Task 3: Board Mutations Hook + Create Board Sheet

**Files:**
- Create: `apps/native/src/hooks/board/useBoardMutations.ts`
- Create: `apps/native/src/components/board/CreateBoardSheet.tsx`
- Modify: `apps/native/src/app/admin/boards/index.tsx`

- [ ] **Step 1: Create `useBoardMutations` hook**

Create `apps/native/src/hooks/board/useBoardMutations.ts` with:

```ts
import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import type {
  CreateBoardBody,
  UpdateBoardBody,
} from "@dragons/api-client";
import type { BoardData } from "@dragons/shared";
import { BOARD_LIST_KEY } from "./useBoardList";
import { boardKey } from "./useBoard";

export function useBoardMutations() {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function create(body: CreateBoardBody): Promise<BoardData> {
    try {
      const created = await adminBoardApi.createBoard(body);
      await Promise.all([
        mutate(BOARD_LIST_KEY),
        mutate(boardKey(created.id), created, { revalidate: false }),
      ]);
      haptics.success();
      toast.show({ title: i18n.t("toast.boardCreated"), variant: "success" });
      return created;
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.createFailed"), variant: "error" });
      throw error;
    }
  }

  async function update(id: number, body: UpdateBoardBody): Promise<BoardData> {
    try {
      const next = await adminBoardApi.updateBoard(id, body);
      await Promise.all([
        mutate(boardKey(id), next, { revalidate: false }),
        mutate(BOARD_LIST_KEY),
      ]);
      return next;
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
      throw error;
    }
  }

  async function remove(id: number): Promise<void> {
    try {
      await adminBoardApi.deleteBoard(id);
      await Promise.all([
        mutate(boardKey(id), undefined, { revalidate: false }),
        mutate(BOARD_LIST_KEY),
      ]);
      haptics.success();
      toast.show({ title: i18n.t("toast.boardDeleted"), variant: "success" });
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.deleteFailed"), variant: "error" });
      throw error;
    }
  }

  return { create, update, remove };
}
```

- [ ] **Step 2: Create `CreateBoardSheet` component**

Create `apps/native/src/components/board/CreateBoardSheet.tsx` with:

```tsx
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useBoardMutations } from "@/hooks/board/useBoardMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface CreateBoardSheetHandle {
  open: (onCreated?: (boardId: number) => void) => void;
}

export const CreateBoardSheet = forwardRef<CreateBoardSheetHandle>(
  function CreateBoardSheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const onCreatedRef = useRef<((id: number) => void) | undefined>(undefined);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const snapPoints = useMemo(() => ["50%"], []);
    const { colors, spacing, radius } = useTheme();
    const mutations = useBoardMutations();

    useImperativeHandle(ref, () => ({
      open: (onCreated) => {
        setName("");
        setDescription("");
        onCreatedRef.current = onCreated;
        sheetRef.current?.present();
      },
    }), []);

    const submit = async () => {
      const trimmed = name.trim();
      if (!trimmed || submitting) return;
      setSubmitting(true);
      try {
        const created = await mutations.create({
          name: trimmed,
          description: description.trim() || null,
        });
        sheetRef.current?.dismiss();
        onCreatedRef.current?.(created.id);
      } catch {
        // toast already shown
      } finally {
        setSubmitting(false);
      }
    };

    const canSubmit = name.trim().length > 0 && !submitting;

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
        <BottomSheetView style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
            {i18n.t("admin.boards.new")}
          </Text>

          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder={i18n.t("admin.boards.namePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            maxLength={120}
            returnKeyType="next"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceLow,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.foreground,
              fontSize: 16,
              fontWeight: "600",
            }}
          />

          <BottomSheetTextInput
            value={description}
            onChangeText={setDescription}
            placeholder={i18n.t("admin.boards.descriptionPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            style={{
              padding: spacing.md,
              minHeight: 80,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceLow,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.foreground,
              fontSize: 14,
              textAlignVertical: "top",
            }}
          />

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            accessibilityRole="button"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: canSubmit ? colors.primary : colors.surfaceHigh,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing.sm,
              opacity: canSubmit ? 1 : 0.6,
            }}
          >
            {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : null}
            <Text
              style={{
                color: canSubmit ? colors.primaryForeground : colors.mutedForeground,
                fontWeight: "700",
              }}
            >
              {i18n.t("admin.boards.create")}
            </Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
```

- [ ] **Step 3: Add board CRUD i18n keys**

Open `apps/native/src/i18n/en.json`. Find the existing `"admin": { "boards": { ... } }` block and replace it with:

```json
  "admin": {
    "boards": {
      "title": "Boards",
      "empty": "No boards yet.",
      "emptyHint": "Create your first board to get started.",
      "new": "New board",
      "create": "Create",
      "namePlaceholder": "Board name",
      "descriptionPlaceholder": "Description (optional)",
      "settingsTitle": "Board settings",
      "rename": "Rename",
      "delete": "Delete board",
      "deleteConfirmTitle": "Delete board?",
      "deleteConfirmMessage": "All columns and tasks will be deleted. This cannot be undone."
    }
  },
```

Open `apps/native/src/i18n/de.json` and replace the same block with:

```json
  "admin": {
    "boards": {
      "title": "Boards",
      "empty": "Noch keine Boards.",
      "emptyHint": "Erstelle dein erstes Board.",
      "new": "Neues Board",
      "create": "Erstellen",
      "namePlaceholder": "Boardname",
      "descriptionPlaceholder": "Beschreibung (optional)",
      "settingsTitle": "Board-Einstellungen",
      "rename": "Umbenennen",
      "delete": "Board löschen",
      "deleteConfirmTitle": "Board löschen?",
      "deleteConfirmMessage": "Alle Spalten und Aufgaben werden gelöscht. Dies kann nicht rückgängig gemacht werden."
    }
  },
```

- [ ] **Step 4: Update board list page with create CTA + empty hint**

Replace the full contents of `apps/native/src/app/admin/boards/index.tsx` with:

```tsx
import { useRef } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Stack, router } from "expo-router";
import { useBoardList } from "@/hooks/board/useBoardList";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import {
  CreateBoardSheet,
  type CreateBoardSheetHandle,
} from "@/components/board/CreateBoardSheet";

export default function BoardListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { data, isLoading, mutate, isValidating } = useBoardList();
  const createRef = useRef<CreateBoardSheetHandle | null>(null);

  const openCreate = () =>
    createRef.current?.open((id) => {
      router.push(`/admin/boards/${id}`);
    });

  const HeaderRight = (
    <Pressable
      onPress={openCreate}
      accessibilityRole="button"
      accessibilityLabel={i18n.t("admin.boards.new")}
      hitSlop={12}
      style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
    >
      <Text
        style={{
          color: colors.primary,
          fontSize: 16,
          fontWeight: "700",
        }}
      >
        +
      </Text>
    </Pressable>
  );

  if (isLoading && !data) {
    return (
      <>
        <Stack.Screen
          options={{
            title: i18n.t("admin.boards.title"),
            headerRight: () => HeaderRight,
          }}
        />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.foreground} />
        </View>
        <CreateBoardSheet ref={createRef} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: i18n.t("admin.boards.title"),
          headerRight: () => HeaderRight,
        }}
      />
      <FlatList
        data={data ?? []}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={isValidating && !isLoading}
            onRefresh={() => {
              void mutate();
            }}
            tintColor={colors.foreground}
          />
        }
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: spacing["3xl"],
              gap: spacing.md,
            }}
          >
            <Text
              style={{
                color: colors.foreground,
                textAlign: "center",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              {i18n.t("admin.boards.empty")}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                textAlign: "center",
                fontSize: 14,
              }}
            >
              {i18n.t("admin.boards.emptyHint")}
            </Text>
            <Pressable
              onPress={openCreate}
              accessibilityRole="button"
              style={{
                marginTop: spacing.sm,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.primary,
              }}
            >
              <Text
                style={{
                  color: colors.primaryForeground,
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                {i18n.t("admin.boards.new")}
              </Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/admin/boards/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            style={{
              padding: spacing.lg,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceHigh,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "600" }}>
              {item.name}
            </Text>
            {item.description ? (
              <Text
                numberOfLines={2}
                style={{ color: colors.mutedForeground, marginTop: spacing.xs }}
              >
                {item.description}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
      <CreateBoardSheet ref={createRef} />
    </>
  );
}
```

- [ ] **Step 5: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/native/src/hooks/board/useBoardMutations.ts \
        apps/native/src/components/board/CreateBoardSheet.tsx \
        apps/native/src/app/admin/boards/index.tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): board create + empty-state CTA on board list"
```

---

## Task 4: Board Settings Sheet (rename + delete)

**Files:**
- Create: `apps/native/src/components/board/BoardSettingsSheet.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: Create `BoardSettingsSheet`**

Create `apps/native/src/components/board/BoardSettingsSheet.tsx` with:

```tsx
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import type { BoardData } from "@dragons/shared";
import { useBoardMutations } from "@/hooks/board/useBoardMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface OpenArgs {
  board: BoardData;
}

export interface BoardSettingsSheetHandle {
  open: (args: OpenArgs) => void;
}

export const BoardSettingsSheet = forwardRef<BoardSettingsSheetHandle>(
  function BoardSettingsSheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [board, setBoard] = useState<BoardData | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const snapPoints = useMemo(() => ["55%"], []);
    const { colors, spacing, radius } = useTheme();
    const mutations = useBoardMutations();

    useImperativeHandle(ref, () => ({
      open: ({ board: b }) => {
        setBoard(b);
        setName(b.name);
        setDescription(b.description ?? "");
        sheetRef.current?.present();
      },
    }), []);

    useEffect(() => {
      // Reset on dismiss handled by onDismiss prop below
    }, []);

    const saveRename = async () => {
      if (!board) return;
      const trimmedName = name.trim();
      const trimmedDesc = description.trim() || null;
      if (!trimmedName) return;
      if (trimmedName === board.name && trimmedDesc === (board.description ?? null)) {
        sheetRef.current?.dismiss();
        return;
      }
      setSubmitting(true);
      try {
        await mutations.update(board.id, {
          name: trimmedName,
          description: trimmedDesc,
        });
        sheetRef.current?.dismiss();
      } catch {
        // toast already shown
      } finally {
        setSubmitting(false);
      }
    };

    const confirmDelete = () => {
      if (!board) return;
      Alert.alert(
        i18n.t("admin.boards.deleteConfirmTitle"),
        i18n.t("admin.boards.deleteConfirmMessage"),
        [
          { text: i18n.t("common.cancel"), style: "cancel" },
          {
            text: i18n.t("common.delete"),
            style: "destructive",
            onPress: async () => {
              try {
                await mutations.remove(board.id);
                sheetRef.current?.dismiss();
                router.back();
              } catch {
                // toast already shown
              }
            },
          },
        ],
      );
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onDismiss={() => setBoard(null)}
      >
        <BottomSheetView style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
            {i18n.t("admin.boards.settingsTitle")}
          </Text>

          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder={i18n.t("admin.boards.namePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            maxLength={120}
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceLow,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.foreground,
              fontSize: 16,
              fontWeight: "600",
            }}
          />

          <BottomSheetTextInput
            value={description}
            onChangeText={setDescription}
            placeholder={i18n.t("admin.boards.descriptionPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            style={{
              padding: spacing.md,
              minHeight: 64,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceLow,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.foreground,
              fontSize: 14,
              textAlignVertical: "top",
            }}
          />

          <Pressable
            onPress={saveRename}
            disabled={submitting || !name.trim()}
            accessibilityRole="button"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor:
                submitting || !name.trim() ? colors.surfaceHigh : colors.primary,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing.sm,
            }}
          >
            {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : null}
            <Text
              style={{
                color:
                  submitting || !name.trim()
                    ? colors.mutedForeground
                    : colors.primaryForeground,
                fontWeight: "700",
              }}
            >
              {i18n.t("common.save")}
            </Text>
          </Pressable>

          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />

          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.destructive,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.destructive, fontWeight: "700" }}>
              {i18n.t("admin.boards.delete")}
            </Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
```

- [ ] **Step 2: Mount sheet + add settings header button on board detail**

Open `apps/native/src/app/admin/boards/[id].tsx`. Add the import block near the existing component imports:

```tsx
import { BoardSettingsSheet, type BoardSettingsSheetHandle } from "@/components/board/BoardSettingsSheet";
```

Inside `BoardDetailBody`, add a new ref alongside the existing `useRef` declarations near `quickCreateRef`:

```tsx
  const settingsSheetRef = useRef<BoardSettingsSheetHandle | null>(null);
```

Modify the `<Stack.Screen ... />` element. Replace:

```tsx
      <Stack.Screen options={{ title: board.name }} />
```

with:

```tsx
      <Stack.Screen
        options={{
          title: board.name,
          headerRight: () => (
            <Pressable
              onPress={() => settingsSheetRef.current?.open({ board })}
              accessibilityRole="button"
              accessibilityLabel={i18n.t("admin.boards.settingsTitle")}
              hitSlop={12}
              style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
            >
              <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "700" }}>⋯</Text>
            </Pressable>
          ),
        }}
      />
```

At the bottom of the JSX (next to the other sheets, just before the closing `</View>`), add:

```tsx
      <BoardSettingsSheet ref={settingsSheetRef} />
```

- [ ] **Step 3: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/components/board/BoardSettingsSheet.tsx \
        apps/native/src/app/admin/boards/\[id\].tsx
git commit -m "feat(native): board settings sheet (rename, delete) with header trigger"
```

---

## Task 5: Column Mutations Hook + Add Column Sheet

**Files:**
- Create: `apps/native/src/hooks/board/useColumnMutations.ts`
- Create: `apps/native/src/components/board/AddColumnSheet.tsx`

- [ ] **Step 1: Create `useColumnMutations` hook**

Create `apps/native/src/hooks/board/useColumnMutations.ts` with:

```ts
import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import type {
  AddColumnBody,
  UpdateColumnBody,
} from "@dragons/api-client";
import type { BoardColumnData } from "@dragons/shared";
import { boardKey } from "./useBoard";

export function useColumnMutations(boardId: number) {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function withErrorToast<T>(fn: () => Promise<T>, failKey: string): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t(failKey), variant: "error" });
      throw error;
    }
  }

  async function add(body: AddColumnBody): Promise<BoardColumnData> {
    return withErrorToast(async () => {
      const created = await adminBoardApi.addColumn(boardId, body);
      await mutate(boardKey(boardId));
      haptics.success();
      toast.show({ title: i18n.t("toast.columnAdded"), variant: "success" });
      return created;
    }, "toast.createFailed");
  }

  async function update(colId: number, body: UpdateColumnBody): Promise<BoardColumnData> {
    return withErrorToast(async () => {
      const next = await adminBoardApi.updateColumn(boardId, colId, body);
      await mutate(boardKey(boardId));
      return next;
    }, "toast.saveFailed");
  }

  async function remove(colId: number): Promise<void> {
    return withErrorToast(async () => {
      await adminBoardApi.deleteColumn(boardId, colId);
      await mutate(boardKey(boardId));
      haptics.success();
      toast.show({ title: i18n.t("toast.columnDeleted"), variant: "success" });
    }, "toast.deleteFailed");
  }

  async function reorder(order: { id: number; position: number }[]): Promise<void> {
    return withErrorToast(async () => {
      await adminBoardApi.reorderColumns(boardId, order);
      await mutate(boardKey(boardId));
    }, "toast.saveFailed");
  }

  return { add, update, remove, reorder };
}
```

- [ ] **Step 2: Create `AddColumnSheet` component**

Create `apps/native/src/components/board/AddColumnSheet.tsx` with:

```tsx
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useColumnMutations } from "@/hooks/board/useColumnMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

const COLOR_PRESETS = [
  null,
  "#9ca3af", // slate
  "#34d399", // emerald
  "#60a5fa", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#a78bfa", // violet
  "#f472b6", // pink
] as const;

interface OpenArgs {
  boardId: number;
}

export interface AddColumnSheetHandle {
  open: (args: OpenArgs) => void;
}

export const AddColumnSheet = forwardRef<AddColumnSheetHandle>(function AddColumnSheet(_p, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [args, setArgs] = useState<OpenArgs | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const snapPoints = useMemo(() => ["55%"], []);
  const { colors, spacing, radius } = useTheme();

  // The hook is parameterised by boardId; we instantiate it per-open.
  // Holding mutations in state would be wrong; instantiate inside submit().
  // (useColumnMutations is a hook so must be called at the top-level — it
  //  is unconditional on boardId, the boardId is captured from `args`.)
  const mutations = useColumnMutations(args?.boardId ?? 0);

  useImperativeHandle(ref, () => ({
    open: (next) => {
      setArgs(next);
      setName("");
      setColor(null);
      sheetRef.current?.present();
    },
  }), []);

  const submit = async () => {
    if (!args) return;
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await mutations.add({ name: trimmed, color });
      sheetRef.current?.dismiss();
    } catch {
      // toast handled in hook
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      onDismiss={() => setArgs(null)}
    >
      <BottomSheetView style={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
          {i18n.t("board.column.addTitle")}
        </Text>

        <BottomSheetTextInput
          value={name}
          onChangeText={setName}
          placeholder={i18n.t("board.column.namePlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          autoFocus
          maxLength={64}
          returnKeyType="done"
          onSubmitEditing={submit}
          style={{
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceLow,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.foreground,
            fontSize: 16,
            fontWeight: "600",
          }}
        />

        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          {COLOR_PRESETS.map((c, i) => {
            const selected = c === color;
            return (
              <Pressable
                key={c ?? `none-${i}`}
                onPress={() => setColor(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                hitSlop={6}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: c ?? colors.surfaceHigh,
                  borderWidth: selected ? 3 : 1,
                  borderColor: selected ? colors.primary : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {c == null ? (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>—</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          style={{
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: canSubmit ? colors.primary : colors.surfaceHigh,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: spacing.sm,
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : null}
          <Text
            style={{
              color: canSubmit ? colors.primaryForeground : colors.mutedForeground,
              fontWeight: "700",
            }}
          >
            {i18n.t("board.column.add")}
          </Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
```

- [ ] **Step 3: Add column i18n keys**

Open `apps/native/src/i18n/en.json`. Find the existing `"board": { ... "column": { "addCard": "+ Add card", "empty": "Drop tasks here" } ... }` block and replace the `"column"` sub-block with:

```json
    "column": {
      "addCard": "+ Add card",
      "empty": "Drop tasks here",
      "addTitle": "Add column",
      "namePlaceholder": "Column name",
      "add": "Add column",
      "settingsTitle": "Column settings",
      "delete": "Delete column",
      "deleteConfirmTitle": "Delete column?",
      "deleteConfirmMessage": "All tasks in this column will be deleted. This cannot be undone.",
      "markAsDone": "Mark as done column",
      "newColumn": "+ New column"
    },
```

In `apps/native/src/i18n/de.json` replace with:

```json
    "column": {
      "addCard": "+ Karte hinzufügen",
      "empty": "Aufgaben hier ablegen",
      "addTitle": "Spalte hinzufügen",
      "namePlaceholder": "Spaltenname",
      "add": "Spalte hinzufügen",
      "settingsTitle": "Spalten-Einstellungen",
      "delete": "Spalte löschen",
      "deleteConfirmTitle": "Spalte löschen?",
      "deleteConfirmMessage": "Alle Aufgaben in dieser Spalte werden gelöscht. Dies kann nicht rückgängig gemacht werden.",
      "markAsDone": "Als Erledigt-Spalte markieren",
      "newColumn": "+ Neue Spalte"
    },
```

- [ ] **Step 4: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/hooks/board/useColumnMutations.ts \
        apps/native/src/components/board/AddColumnSheet.tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): column mutations hook + add-column sheet"
```

---

## Task 6: Column Settings Sheet (rename, color, done-flag, delete)

**Files:**
- Create: `apps/native/src/components/board/ColumnSettingsSheet.tsx`

- [ ] **Step 1: Create `ColumnSettingsSheet`**

Create `apps/native/src/components/board/ColumnSettingsSheet.tsx` with:

```tsx
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BoardColumnData } from "@dragons/shared";
import { useColumnMutations } from "@/hooks/board/useColumnMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

const COLOR_PRESETS = [
  null,
  "#9ca3af",
  "#34d399",
  "#60a5fa",
  "#f59e0b",
  "#ef4444",
  "#a78bfa",
  "#f472b6",
] as const;

interface OpenArgs {
  boardId: number;
  column: BoardColumnData;
}

export interface ColumnSettingsSheetHandle {
  open: (args: OpenArgs) => void;
}

export const ColumnSettingsSheet = forwardRef<ColumnSettingsSheetHandle>(
  function ColumnSettingsSheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [args, setArgs] = useState<OpenArgs | null>(null);
    const [name, setName] = useState("");
    const [color, setColor] = useState<string | null>(null);
    const [isDoneColumn, setIsDoneColumn] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const snapPoints = useMemo(() => ["65%"], []);
    const { colors, spacing, radius } = useTheme();

    const mutations = useColumnMutations(args?.boardId ?? 0);

    useImperativeHandle(ref, () => ({
      open: (next) => {
        setArgs(next);
        setName(next.column.name);
        setColor(next.column.color ?? null);
        setIsDoneColumn(Boolean(next.column.isDoneColumn));
        sheetRef.current?.present();
      },
    }), []);

    const save = async () => {
      if (!args) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      setSubmitting(true);
      try {
        await mutations.update(args.column.id, {
          name: trimmed,
          color,
          isDoneColumn,
        });
        sheetRef.current?.dismiss();
      } catch {
        // toast handled
      } finally {
        setSubmitting(false);
      }
    };

    const confirmDelete = () => {
      if (!args) return;
      Alert.alert(
        i18n.t("board.column.deleteConfirmTitle"),
        i18n.t("board.column.deleteConfirmMessage"),
        [
          { text: i18n.t("common.cancel"), style: "cancel" },
          {
            text: i18n.t("common.delete"),
            style: "destructive",
            onPress: async () => {
              try {
                await mutations.remove(args.column.id);
                sheetRef.current?.dismiss();
              } catch {
                // toast handled
              }
            },
          },
        ],
      );
    };

    const canSave = name.trim().length > 0 && !submitting;

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onDismiss={() => setArgs(null)}
      >
        <BottomSheetView style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
            {i18n.t("board.column.settingsTitle")}
          </Text>

          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder={i18n.t("board.column.namePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            maxLength={64}
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceLow,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.foreground,
              fontSize: 16,
              fontWeight: "600",
            }}
          />

          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            {COLOR_PRESETS.map((c, i) => {
              const selected = c === color;
              return (
                <Pressable
                  key={c ?? `none-${i}`}
                  onPress={() => setColor(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  hitSlop={6}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: c ?? colors.surfaceHigh,
                    borderWidth: selected ? 3 : 1,
                    borderColor: selected ? colors.primary : colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {c == null ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>—</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setIsDoneColumn((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: isDoneColumn }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceLow,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
              {i18n.t("board.column.markAsDone")}
            </Text>
            <View
              style={{
                width: 44,
                height: 26,
                borderRadius: 13,
                backgroundColor: isDoneColumn ? colors.primary : colors.surfaceHighest,
                padding: 2,
                alignItems: isDoneColumn ? "flex-end" : "flex-start",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: colors.surfaceLowest,
                }}
              />
            </View>
          </Pressable>

          <Pressable
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: canSave ? colors.primary : colors.surfaceHigh,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing.sm,
              opacity: canSave ? 1 : 0.6,
            }}
          >
            {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : null}
            <Text
              style={{
                color: canSave ? colors.primaryForeground : colors.mutedForeground,
                fontWeight: "700",
              }}
            >
              {i18n.t("common.save")}
            </Text>
          </Pressable>

          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />

          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.destructive,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.destructive, fontWeight: "700" }}>
              {i18n.t("board.column.delete")}
            </Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
```

- [ ] **Step 2: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/board/ColumnSettingsSheet.tsx
git commit -m "feat(native): column settings sheet (rename, color, done-flag, delete)"
```

---

## Task 7: Wire Column Sheets Into Board Detail + Add Trailing "+" Pill

**Files:**
- Modify: `apps/native/src/components/board/BoardPager.tsx`
- Modify: `apps/native/src/components/board/BoardColumn.tsx`
- Modify: `apps/native/src/components/board/BoardHeader.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: Add long-press support to `BoardHeader` pills**

Open `apps/native/src/components/board/BoardHeader.tsx`. Replace the file with:

```tsx
import { ScrollView, Pressable, Text, View } from "react-native";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";

interface BoardHeaderProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  activeColumnIndex: number;
  onPillPress: (index: number) => void;
  onPillLongPress?: (column: BoardColumnData) => void;
  onAddColumnPress?: () => void;
}

const PILL_HEIGHT = 44;

export function BoardHeader({
  columns,
  tasks,
  activeColumnIndex,
  onPillPress,
  onPillLongPress,
  onAddColumnPress,
}: BoardHeaderProps) {
  const { colors, spacing, radius } = useTheme();
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
        const count = tasks.filter((t) => t.columnId === col.id).length;
        return (
          <Pressable
            key={col.id}
            onPress={() => onPillPress(i)}
            onLongPress={onPillLongPress ? () => onPillLongPress(col) : undefined}
            delayLongPress={400}
            accessibilityRole="button"
            accessibilityLabel={col.name}
            style={{
              height: PILL_HEIGHT,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: active ? colors.primary : "transparent",
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
            }}
          >
            {col.color ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: col.color,
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
              {col.name}
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
          </Pressable>
        );
      })}
      {onAddColumnPress ? (
        <Pressable
          onPress={onAddColumnPress}
          accessibilityRole="button"
          accessibilityLabel={onAddColumnPress.name}
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
```

- [ ] **Step 2: Add long-press support to `BoardColumn` header**

Open `apps/native/src/components/board/BoardColumn.tsx`. In the `BoardColumnProps` interface, add:

```ts
  onColumnLongPress?: (column: BoardColumnData) => void;
```

Find the destructured props of `BoardColumn` and add `onColumnLongPress`. Find the column header `<View onLayout={handleHeaderLayout} ... >` and wrap its inner content (the `View` containing color dot + name) in a `Pressable` that calls `onColumnLongPress` on long-press. Specifically replace:

```tsx
          <View
            onLayout={handleHeaderLayout}
            style={{
              paddingHorizontal: spacing.md,
              paddingTop: spacing.md,
              paddingBottom: spacing.sm,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 }}>
              {column.color ? (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: column.color,
                  }}
                />
              ) : null}
              <Text
                numberOfLines={1}
                style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", flex: 1 }}
              >
                {column.name}
              </Text>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, fontVariant: ["tabular-nums"] }}>
              {columnTasks.length}
            </Text>
          </View>
```

with:

```tsx
          <Pressable
            onLongPress={onColumnLongPress ? () => onColumnLongPress(column) : undefined}
            delayLongPress={400}
            onLayout={handleHeaderLayout}
            accessibilityRole="header"
            accessibilityLabel={column.name}
            style={{
              paddingHorizontal: spacing.md,
              paddingTop: spacing.md,
              paddingBottom: spacing.sm,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 }}>
              {column.color ? (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: column.color,
                  }}
                />
              ) : null}
              <Text
                numberOfLines={1}
                style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", flex: 1 }}
              >
                {column.name}
              </Text>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, fontVariant: ["tabular-nums"] }}>
              {columnTasks.length}
            </Text>
          </Pressable>
```

Add the `Pressable` import to the existing react-native import line:

```tsx
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
```

(It is already imported — verify it remains.)

- [ ] **Step 3: Forward `onColumnLongPress` from `BoardPager`**

Open `apps/native/src/components/board/BoardPager.tsx`. Add to `BoardPagerProps`:

```ts
  onColumnLongPress?: (column: BoardColumnData) => void;
```

Add to the destructured props in the function signature:

```ts
      onColumnLongPress,
```

Inside the `<BoardColumn ... />` element, add the prop:

```tsx
            onColumnLongPress={onColumnLongPress}
```

- [ ] **Step 4: Mount sheets and pass long-press handlers in `BoardDetailBody`**

Open `apps/native/src/app/admin/boards/[id].tsx`. Add imports near the existing component imports:

```tsx
import {
  ColumnSettingsSheet,
  type ColumnSettingsSheetHandle,
} from "@/components/board/ColumnSettingsSheet";
import { AddColumnSheet, type AddColumnSheetHandle } from "@/components/board/AddColumnSheet";
import type { BoardColumnData } from "@dragons/shared";
```

Add refs alongside the existing ones:

```tsx
  const columnSettingsRef = useRef<ColumnSettingsSheetHandle | null>(null);
  const addColumnRef = useRef<AddColumnSheetHandle | null>(null);
```

Add handlers below the `openQuickCreateFab` block:

```tsx
  const onColumnLongPress = useCallback(
    (col: BoardColumnData) => {
      columnSettingsRef.current?.open({ boardId, column: col });
    },
    [boardId],
  );

  const onAddColumnPress = useCallback(() => {
    addColumnRef.current?.open({ boardId });
  }, [boardId]);
```

Update `<BoardHeader ... />` to pass new props:

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

Update `<BoardPager ... />` to pass `onColumnLongPress`:

```tsx
            onColumnLongPress={onColumnLongPress}
```

(Insert it among the existing props.)

At the bottom, just before the existing `<BoardSettingsSheet ref={settingsSheetRef} />`, add:

```tsx
      <ColumnSettingsSheet ref={columnSettingsRef} />
      <AddColumnSheet ref={addColumnRef} />
```

- [ ] **Step 5: Empty-state for 0-column boards**

Still in `apps/native/src/app/admin/boards/[id].tsx`. Find the existing block:

```tsx
      <View style={{ flex: 1 }}>
        {tasksLoading && !rawTasks ? (
          <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md }}>
            <TaskCardSkeleton />
            <TaskCardSkeleton />
            <TaskCardSkeleton />
          </View>
        ) : (
          <BoardPager
            ...
          />
        )}
      </View>
```

Replace with:

```tsx
      <View style={{ flex: 1 }}>
        {columns.length === 0 && !boardLoading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <Text
              style={{
                color: colors.foreground,
                fontSize: 16,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              {i18n.t("board.empty.noColumns")}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              {i18n.t("board.empty.noColumnsHint")}
            </Text>
            <Pressable
              onPress={onAddColumnPress}
              accessibilityRole="button"
              style={{
                marginTop: spacing.sm,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                borderRadius: 8,
                backgroundColor: colors.primary,
              }}
            >
              <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>
                {i18n.t("board.column.newColumn")}
              </Text>
            </Pressable>
          </View>
        ) : tasksLoading && !rawTasks ? (
          <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md }}>
            <TaskCardSkeleton />
            <TaskCardSkeleton />
            <TaskCardSkeleton />
          </View>
        ) : (
          <BoardPager
            ref={pagerRef}
            columns={columns}
            tasks={tasks ?? []}
            onActiveColumnChange={(i) => {
              setActiveIndex(i);
            }}
            onTaskPress={(task: TaskCardData) => {
              taskSheetRef.current?.open(task.id);
            }}
            onTaskLongPress={handleTaskLongPress}
            onColumnLongPress={onColumnLongPress}
            onAddTask={openQuickCreate}
            draggingTaskId={dragState.active ? dragState.task.id : null}
            dropTargetColumnId={dropTargetColumnId}
            onTaskDrag={onTaskDrag}
            onTaskMeasure={onTaskMeasure}
            onColumnScrollUpdate={onColumnScrollUpdate}
            onColumnContentSizeChange={onColumnContentSizeChange}
            onColumnHeaderHeight={onColumnHeaderHeight}
            onPagerScrollUpdate={onPagerScrollUpdate}
            onPagerLayout={onPagerLayout}
            columnRefs={columnRefsMap}
            refreshing={refreshing}
            onRefresh={onPullRefresh}
          />
        )}
      </View>
```

- [ ] **Step 6: Add empty-state i18n keys**

Open `apps/native/src/i18n/en.json`. Inside the `"board": { ... }` block, add an `"empty"` sub-block (between existing `"comments"` and `"moveTo"` is fine):

```json
    "empty": {
      "noColumns": "No columns yet",
      "noColumnsHint": "Add a column to start organising tasks."
    },
```

Open `apps/native/src/i18n/de.json` and add:

```json
    "empty": {
      "noColumns": "Noch keine Spalten",
      "noColumnsHint": "Füge eine Spalte hinzu, um Aufgaben zu organisieren."
    },
```

- [ ] **Step 7: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/native/src/components/board/BoardHeader.tsx \
        apps/native/src/components/board/BoardColumn.tsx \
        apps/native/src/components/board/BoardPager.tsx \
        apps/native/src/app/admin/boards/\[id\].tsx \
        apps/native/src/i18n/en.json \
        apps/native/src/i18n/de.json
git commit -m "feat(native): column long-press settings, add-column pill, 0-column empty state"
```

---

## Task 8: Hit Targets + Drag Ghost Format Consistency

**Files:**
- Modify: `apps/native/src/components/board/FilterChips.tsx`
- Modify: `apps/native/src/components/board/TaskCard.tsx`
- Modify: `apps/native/src/components/board/TaskCardDragGhost.tsx`

- [ ] **Step 1: Bump filter-chip height + clear-button hitSlop**

Open `apps/native/src/components/board/FilterChips.tsx`. Change:

```ts
const CHIP_HEIGHT = 28;
```

to:

```ts
const CHIP_HEIGHT = 44;
```

Change the priority clear button's wrapper. Find:

```tsx
        {filters.priority != null && onClearPriority ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onClearPriority();
            }}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("common.clear")}
            hitSlop={8}
            style={{ marginLeft: 2 }}
          >
            <Text style={{ ...textStyle(true), fontSize: 14, lineHeight: 14 }}>×</Text>
          </Pressable>
        ) : null}
```

Replace with:

```tsx
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
```

Bump the chip text size from 12 → 13 for legibility at the new size:

```ts
  const textStyle = (active: boolean) => ({
    color: active ? colors.secondaryForeground : colors.mutedForeground,
    fontSize: 13,
    fontWeight: "500" as const,
  });
```

- [ ] **Step 2: Export `formatDueShort` from `TaskCard`**

Open `apps/native/src/components/board/TaskCard.tsx`. Find the function:

```ts
function formatDueShort(iso: string): string {
```

Change to an exported helper:

```ts
export function formatDueShort(iso: string): string {
```

- [ ] **Step 3: Use `formatDueShort` in the drag ghost**

Open `apps/native/src/components/board/TaskCardDragGhost.tsx`. Add the import at the top:

```tsx
import { formatDueShort } from "./TaskCard";
```

Find:

```tsx
          {task.dueDate ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {new Date(task.dueDate).toLocaleDateString()}
            </Text>
          ) : null}
```

Replace with:

```tsx
          {task.dueDate ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {formatDueShort(task.dueDate)}
            </Text>
          ) : null}
```

- [ ] **Step 4: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/components/board/FilterChips.tsx \
        apps/native/src/components/board/TaskCard.tsx \
        apps/native/src/components/board/TaskCardDragGhost.tsx
git commit -m "fix(native): bump board hit targets to 44pt, share due-date format with drag ghost"
```

---

## Task 9: Undo Helper for Destructive Actions (pure logic + tests)

**Files:**
- Create: `packages/shared/src/board-undo.ts`
- Create: `packages/shared/src/board-undo.test.ts`
- Modify: `packages/shared/src/index.ts`

The native side will compose this helper to assemble undo state for delete operations. Pure logic so it's vitest-testable.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/board-undo.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  buildUndoEntry,
  type UndoEntry,
  type UndoableTaskSnapshot,
  type UndoableChecklistSnapshot,
  type UndoableCommentSnapshot,
} from "./board-undo";

describe("buildUndoEntry", () => {
  it("captures task delete snapshot", () => {
    const snap: UndoableTaskSnapshot = {
      kind: "task",
      taskId: 5,
      columnId: 2,
      position: 3,
      title: "Foo",
    };
    const entry: UndoEntry = buildUndoEntry(snap);
    expect(entry.kind).toBe("task");
    expect(entry.snapshot).toEqual(snap);
    expect(typeof entry.expiresAtMs).toBe("number");
    expect(entry.expiresAtMs).toBeGreaterThan(Date.now());
  });

  it("captures checklist item snapshot", () => {
    const snap: UndoableChecklistSnapshot = {
      kind: "checklist",
      taskId: 1,
      itemId: 9,
      label: "Step",
      isChecked: false,
      position: 0,
    };
    const entry = buildUndoEntry(snap);
    expect(entry.kind).toBe("checklist");
    expect(entry.snapshot).toEqual(snap);
  });

  it("captures comment snapshot", () => {
    const snap: UndoableCommentSnapshot = {
      kind: "comment",
      taskId: 4,
      commentId: 22,
      body: "hi",
      createdAt: "2026-04-27T09:00:00Z",
      authorId: "u1",
    };
    const entry = buildUndoEntry(snap);
    expect(entry.kind).toBe("comment");
    expect(entry.snapshot).toEqual(snap);
  });

  it("respects custom ttl", () => {
    const before = Date.now();
    const entry = buildUndoEntry(
      {
        kind: "task",
        taskId: 1,
        columnId: 1,
        position: 0,
        title: "x",
      },
      { ttlMs: 1000 },
    );
    expect(entry.expiresAtMs - before).toBeGreaterThanOrEqual(1000);
    expect(entry.expiresAtMs - before).toBeLessThanOrEqual(1100);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pnpm --filter @dragons/shared test -- board-undo`
Expected: FAIL — "Cannot find module './board-undo'".

- [ ] **Step 3: Implement the helper**

Create `packages/shared/src/board-undo.ts` with:

```ts
/**
 * Pure helpers for assembling undo state for destructive board operations.
 * Used by the native (and eventually web) toast-undo flow: when the user
 * deletes a task / checklist item / comment, we build an UndoEntry, show
 * a toast with an "Undo" action, and on tap we re-create the entity from
 * the snapshot via the API.
 *
 * Kept pure (no React, no SWR) so it lives in @dragons/shared and runs
 * under vitest.
 */

export interface UndoableTaskSnapshot {
  kind: "task";
  taskId: number;
  columnId: number;
  position: number;
  title: string;
}

export interface UndoableChecklistSnapshot {
  kind: "checklist";
  taskId: number;
  itemId: number;
  label: string;
  isChecked: boolean;
  position: number;
}

export interface UndoableCommentSnapshot {
  kind: "comment";
  taskId: number;
  commentId: number;
  body: string;
  createdAt: string;
  authorId: string;
}

export type UndoableSnapshot =
  | UndoableTaskSnapshot
  | UndoableChecklistSnapshot
  | UndoableCommentSnapshot;

export interface UndoEntry {
  kind: UndoableSnapshot["kind"];
  snapshot: UndoableSnapshot;
  expiresAtMs: number;
}

const DEFAULT_TTL_MS = 5_000;

export function buildUndoEntry(
  snapshot: UndoableSnapshot,
  options?: { ttlMs?: number },
): UndoEntry {
  const ttl = options?.ttlMs ?? DEFAULT_TTL_MS;
  return {
    kind: snapshot.kind,
    snapshot,
    expiresAtMs: Date.now() + ttl,
  };
}
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @dragons/shared test -- board-undo`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from `@dragons/shared`**

Open `packages/shared/src/index.ts`. Add (after existing board exports near `findDropTarget`):

```ts
export { buildUndoEntry } from "./board-undo";
export type {
  UndoEntry,
  UndoableSnapshot,
  UndoableTaskSnapshot,
  UndoableChecklistSnapshot,
  UndoableCommentSnapshot,
} from "./board-undo";
```

- [ ] **Step 6: TypeScript check on shared and native**

Run: `pnpm --filter @dragons/shared typecheck && pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/board-undo.ts \
        packages/shared/src/board-undo.test.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): undo entry helper for destructive board operations"
```

---

## Task 10: Replace Alert-Delete With Toast-Undo (Tasks)

**Files:**
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

The current pattern: long-press → context menu → delete → `Alert.alert` confirm → mutation. Replace with: long-press → context menu → delete → optimistic mutation + 5s undo toast.

- [ ] **Step 1: Update `handleTaskLongPress` to use toast-undo**

Open `apps/native/src/app/admin/boards/[id].tsx`. Add imports near the top:

```tsx
import { useToast } from "@/hooks/useToast";
import { adminBoardApi } from "@/lib/api";
```

Inside `BoardDetailBody` (after `const moveTask = useMoveTask(boardId);`), add:

```tsx
  const toast = useToast();
```

Replace the existing `handleTaskLongPress` `delete` action handler. Find:

```tsx
          } else if (action === "delete") {
            haptics.warning();
            Alert.alert(
              i18n.t("board.task.deleteConfirmTitle"),
              i18n.t("board.task.deleteConfirmMessage"),
              [
                { text: i18n.t("common.cancel"), style: "cancel" },
                {
                  text: i18n.t("common.delete"),
                  style: "destructive",
                  onPress: () => {
                    void taskMutations.deleteTask(task.id);
                  },
                },
              ],
            );
          }
```

Replace with:

```tsx
          } else if (action === "delete") {
            haptics.warning();
            const snapshotTitle = task.title;
            const snapshotColumnId = task.columnId;
            const snapshotPosition = task.position;
            const snapshotDescription = task.description ?? null;
            const snapshotPriority = task.priority;
            const snapshotDueDate = task.dueDate;

            void taskMutations.deleteTask(task.id).then(() => {
              toast.show({
                title: i18n.t("toast.taskDeleted"),
                action: {
                  label: i18n.t("toast.undo"),
                  onPress: () => {
                    void (async () => {
                      try {
                        await adminBoardApi.createTask(boardId, {
                          columnId: snapshotColumnId,
                          title: snapshotTitle,
                          description: snapshotDescription,
                          priority: snapshotPriority,
                          dueDate: snapshotDueDate,
                        });
                        await revalidateTasks();
                      } catch {
                        toast.show({
                          title: i18n.t("toast.saveFailed"),
                          variant: "error",
                        });
                      }
                    })();
                  },
                },
              });
            });
          }
```

Note: the recreated task does not preserve checklist items, comments, or assignees — Phase 1 only restores the core fields. A more complete restore is deferred.

Also remove the now-unused `Alert` import in this file IF this was the only usage. The file may still use `Alert` elsewhere (BoardSettingsSheet uses it but in its own file). Check the imports: keep `Alert` if it's still referenced; remove the `Alert,` token if not.

- [ ] **Step 2: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/admin/boards/\[id\].tsx
git commit -m "feat(native): toast-undo for task delete (replaces alert confirm)"
```

---

## Task 11: Replace Alert-Delete With Toast-Undo (Checklist + Comments)

**Files:**
- Modify: `apps/native/src/components/board/ChecklistSection.tsx`
- Modify: `apps/native/src/components/board/CommentsSection.tsx`

- [ ] **Step 1: Toast-undo for checklist delete**

Open `apps/native/src/components/board/ChecklistSection.tsx`. Add imports:

```tsx
import { useToast } from "@/hooks/useToast";
import { adminBoardApi } from "@/lib/api";
```

Inside `ChecklistSection`, after the existing `const mutations = useChecklistMutations(boardId);`, add:

```tsx
  const toast = useToast();
```

Replace the `confirmDelete` function. Find:

```tsx
  const confirmDelete = (itemId: number) => {
    haptics.warning();
    Alert.alert(
      i18n.t("board.checklist.deleteTitle"),
      i18n.t("board.checklist.deleteMessage"),
      [
        { text: i18n.t("common.cancel"), style: "cancel" },
        {
          text: i18n.t("common.delete"),
          style: "destructive",
          onPress: () => {
            void mutations.deleteItem(task.id, itemId);
          },
        },
      ],
    );
  };
```

Replace with:

```tsx
  const confirmDelete = (itemId: number) => {
    const item = task.checklist.find((i) => i.id === itemId);
    if (!item) return;
    haptics.warning();
    const snapshot = {
      label: item.label,
      isChecked: item.isChecked,
    };
    void mutations.deleteItem(task.id, itemId).then(() => {
      toast.show({
        title: i18n.t("toast.checklistItemDeleted"),
        action: {
          label: i18n.t("toast.undo"),
          onPress: () => {
            void (async () => {
              try {
                const created = await adminBoardApi.addChecklistItem(
                  task.id,
                  snapshot.label,
                );
                if (snapshot.isChecked) {
                  await adminBoardApi.updateChecklistItem(
                    task.id,
                    created.id,
                    { isChecked: true },
                  );
                }
              } catch {
                toast.show({
                  title: i18n.t("toast.saveFailed"),
                  variant: "error",
                });
              }
            })();
          },
        },
      });
    });
  };
```

Also remove the `Alert` import if it's no longer used in this file — search the file for `Alert.` (no other usages remain after this change). Replace:

```tsx
import { Alert, Pressable, Text, View } from "react-native";
```

with:

```tsx
import { Pressable, Text, View } from "react-native";
```

- [ ] **Step 2: Toast-undo for comment delete**

Open `apps/native/src/components/board/CommentsSection.tsx`. Add imports:

```tsx
import { useToast } from "@/hooks/useToast";
import { adminBoardApi } from "@/lib/api";
```

Inside `CommentsSection`, after `const mutations = useCommentMutations();`, add:

```tsx
  const toast = useToast();
```

Replace the `confirmDelete` function. Find:

```tsx
  const confirmDelete = (id: number) => {
    haptics.warning();
    Alert.alert(
      i18n.t("board.comments.deleteTitle"),
      i18n.t("board.comments.deleteMessage"),
      [
        { text: i18n.t("common.cancel"), style: "cancel" },
        {
          text: i18n.t("common.delete"),
          style: "destructive",
          onPress: () => {
            void mutations.remove(task.id, id);
          },
        },
      ],
    );
  };
```

Replace with:

```tsx
  const confirmDelete = (id: number) => {
    const comment = task.comments.find((c) => c.id === id);
    if (!comment) return;
    const snapshotBody = comment.body;
    haptics.warning();
    void mutations.remove(task.id, id).then(() => {
      toast.show({
        title: i18n.t("toast.commentDeleted"),
        action: {
          label: i18n.t("toast.undo"),
          onPress: () => {
            void (async () => {
              try {
                await adminBoardApi.addComment(task.id, snapshotBody);
              } catch {
                toast.show({
                  title: i18n.t("toast.saveFailed"),
                  variant: "error",
                });
              }
            })();
          },
        },
      });
    });
  };
```

Note: the long-press menu in CommentsSection still uses `Alert.alert` to show edit/delete actions — keep that one (it's a menu, not a destructive confirmation). The `Alert` import stays.

- [ ] **Step 3: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/components/board/ChecklistSection.tsx \
        apps/native/src/components/board/CommentsSection.tsx
git commit -m "feat(native): toast-undo for checklist + comment delete"
```

---

## Task 12: Title Char-Limit Indicator + Single-Source Due Format

**Files:**
- Modify: `apps/native/src/components/board/TaskDetailBody.tsx`

- [ ] **Step 1: Add character counter and use shared due format**

Open `apps/native/src/components/board/TaskDetailBody.tsx`. Add imports near the top:

```tsx
import { formatDueShort } from "./TaskCard";
```

Find the title `<BottomSheetTextInput>` block:

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

Replace with:

```tsx
        <BottomSheetTextInput
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          maxLength={300}
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
        {title.length >= 270 ? (
          <Text
            style={{
              color: title.length >= 300 ? colors.destructive : colors.mutedForeground,
              fontSize: 11,
              fontVariant: ["tabular-nums"],
              alignSelf: "flex-end",
            }}
          >
            {title.length}/300
          </Text>
        ) : null}
```

Find the due-date property row (currently uses `new Date(task.dueDate).toLocaleDateString()`):

```tsx
        {propertyRow({
          label: i18n.t("board.task.due"),
          value: task.dueDate
            ? new Date(task.dueDate).toLocaleDateString()
            : i18n.t("board.task.noDue"),
          valueColor: task.dueDate ? dueColor : colors.mutedForeground,
          onPress: () =>
            pickers.openDue(task.dueDate, (iso) => {
              void mutations.setDueDate(task.id, iso);
            }),
        })}
```

Replace the value prop to use `formatDueShort`:

```tsx
        {propertyRow({
          label: i18n.t("board.task.due"),
          value: task.dueDate ? formatDueShort(task.dueDate) : i18n.t("board.task.noDue"),
          valueColor: task.dueDate ? dueColor : colors.mutedForeground,
          onPress: () =>
            pickers.openDue(task.dueDate, (iso) => {
              void mutations.setDueDate(task.id, iso);
            }),
        })}
```

- [ ] **Step 2: TypeScript check**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/board/TaskDetailBody.tsx
git commit -m "feat(native): task detail title char counter + shared due-date format"
```

---

## Task 13: Manual Smoke + Full Phase Verification

This phase touches many files. The native app has no automated UI tests, so the verification gate is a developer-driven smoke pass on iOS simulator + Android emulator. Capture results inline in the commit message of the final phase commit (or a CHANGELOG note).

- [ ] **Step 1: Run static checks**

Run from repo root:

```bash
pnpm --filter @dragons/shared test
pnpm --filter @dragons/shared typecheck
pnpm --filter @dragons/native typecheck
```

Expected: all PASS.

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

1. Open Boards screen → tap "+" header button → enter name "Test Board" → Create. Expect: navigated into the new board. Toast "Board created".
2. New board has 0 columns → empty state appears with "Add column" CTA. Tap it.
3. Add column "To Do" without color → submit. Expect: board now has one column. Toast "Column added".
4. Long-press the "To Do" column header pill → settings sheet opens. Pick a color, toggle "done column" off. Save.
5. Tap the "+" pill at end of header → add a second column "Doing".
6. Tap FAB on board → quick-create a task in "To Do".
7. Long-press a task card → "Delete task". Expect: card disappears, toast "Task deleted" with Undo. Tap Undo within 5s. Expect: task reappears.
8. Long-press a task card → "Delete task" → wait for toast to expire. Expect: task remains deleted.
9. Open a task → add 2 checklist items. Long-press one → toast "Item deleted" with Undo. Tap Undo. Expect: item restored.
10. Open a task → add a comment. Long-press your own comment → Delete. Expect: toast with Undo.
11. Drag a task to another column. Force a failure (turn off Wi-Fi mid-drop): toast "Couldn't move task" appears, card returns to original position.
12. Drag a card while watching the ghost — due date format must match the underlying card (not raw locale string).
13. Long-press a column header → settings → Delete. Expect: confirm Alert; on confirm column + tasks vanish, toast "Column deleted".
14. Tap "⋯" in the navigation header on the board → board settings sheet → Delete board. Expect: confirm; on confirm we navigate back to Boards list. Toast "Board deleted".
15. Filter chip heights look ≥44pt. Priority chip × clear button is easy to tap (no missed taps in 5 attempts).
16. Title field on task detail — type past 270 chars. Counter appears. Block input at 300.
17. With airplane mode on, tap a task → try to edit title. Expect: toast "Couldn't save".

- [ ] **Step 4: Final commit (any cleanup)**

If any leftover lint/typecheck issues exist, fix them. Then:

```bash
git status
```

Verify clean tree.

If working tree is clean, Phase 1 is complete.

---

## Self-Review Notes

Re-verifying the plan against the original spec:

- **Toast infrastructure** — Tasks 1, 2 ✅
- **Board CRUD** — Tasks 3, 4 ✅
- **Column CRUD** — Tasks 5, 6, 7 ✅
- **Empty states** (board list + 0-column board) — Tasks 3, 7 ✅
- **Hit targets ≥44pt** — Task 8 ✅
- **Drag ghost format consistency** — Task 8 ✅
- **Undo for destructive ops** (task, checklist, comment) — Tasks 9, 10, 11 ✅
- **Title char limit indicator** — Task 12 ✅
- **Manual verification gate** — Task 13 ✅

Type/method names verified consistent across tasks: `useToast`, `useBoardMutations`, `useColumnMutations`, `formatDueShort`, `buildUndoEntry`. All sheet handles use the `XHandle` naming convention (matches existing `TaskDetailSheetHandle`, `MoveToSheetHandle`, etc.).

No placeholders remain. Every step contains the actual content needed.
