# Native Kanban Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Trello-style kanban board inside the Expo/React Native app that talks to the existing `/admin/boards` + `/admin/tasks` API, feels native on iOS and Android, and mirrors the web feature set (multi-column, multi-assignee, priority, due date, checklist, comments).

**Architecture:** Horizontally paged columns (one column per screen with peek of next, snap), bottom-sheet task detail (`@gorhom/bottom-sheet`), two-path reordering — long-press drag with Reanimated 4 + Gesture Handler autoscroll, PLUS a "Move to…" action sheet as an accessibility fallback. Reorder math extracted to `@dragons/shared` so web + native share one algorithm and one test suite. Data via SWR with optimistic local state that mirrors the server's gap-shift logic exactly. No realtime — revalidate on focus + after mutations.

**Tech Stack:** Expo SDK 55, React Native 0.83, Reanimated 4.3, React Native Gesture Handler (new dep), `@gorhom/bottom-sheet` (new dep), `expo-haptics` (new dep), SWR 2.4, expo-router, `@dragons/api-client`, `@dragons/shared`, `react-native-keyboard-controller` (already installed).

**Context to read before starting:**
- Existing web plan: `docs/superpowers/plans/2026-04-23-kanban-base-multi-assignee.md` and `docs/superpowers/plans/2026-04-23-kanban-ui.md`
- Web reorder algo: `apps/web/src/lib/dnd.ts` + `apps/web/src/lib/dnd.test.ts`
- Server move logic: `apps/api/src/services/admin/task.service.ts` (`moveTask`, ~L471-584)
- Existing native modal pattern: `apps/native/src/components/AssignRefereeModal.tsx` (floating keyboard-synced sheet, SectionList, search UX)
- API client pattern: `packages/api-client/src/endpoints/referee.ts`
- Native wiring: `apps/native/src/app/_layout.tsx`, `apps/native/src/lib/api.ts`

---

## File Structure Overview

**Shared (new/modified):**
- Create: `packages/shared/src/board-dnd.ts` — pure reorder fns (moved from web)
- Create: `packages/shared/src/board-dnd.test.ts` — shared tests
- Modify: `packages/shared/src/index.ts` — export board-dnd
- Modify: `apps/web/src/lib/dnd.ts` — re-export from shared
- Modify: `apps/web/src/lib/dnd.test.ts` — import from shared (or delete, keep only shared copy)

**API client (new):**
- Create: `packages/api-client/src/endpoints/admin-board.ts`
- Create: `packages/api-client/src/endpoints/admin-board.test.ts`
- Modify: `packages/api-client/src/endpoints/index.ts` — export
- Modify: `apps/native/src/lib/api.ts` — add `adminBoardApi`

**Native screens (new):**
- Create: `apps/native/src/app/admin/_layout.tsx`
- Create: `apps/native/src/app/admin/boards/index.tsx`
- Create: `apps/native/src/app/admin/boards/[id].tsx`
- Modify: `apps/native/src/app/_layout.tsx` — wrap root with `GestureHandlerRootView`, add admin stack entry
- Modify: `apps/native/src/app/profile.tsx` — add "Admin" navigation button (admin-gated)

**Native components (new, under `apps/native/src/components/board/`):**
- `BoardHeader.tsx` — title + filter chips + column pill nav
- `BoardPager.tsx` — horizontal paged scroll container, emits active column index
- `BoardColumn.tsx` — one column: header, card list, sticky "+" footer
- `TaskCard.tsx` — compact card (title, assignee stack, due chip, priority dot, checklist progress)
- `TaskCardDragGhost.tsx` — floating clone used during drag
- `TaskDetailSheet.tsx` — root bottom sheet for task detail
- `TaskDetailBody.tsx` — scrollable content: title, description, priority, due, assignees, checklist, comments
- `AssigneePickerSheet.tsx` — nested sheet, clones AssignRefereeModal search UX
- `PriorityPickerSheet.tsx` — nested sheet with 4 options
- `DuePickerSheet.tsx` — nested sheet with native date picker
- `MoveToSheet.tsx` — action sheet: pick target column + top/bottom
- `TaskContextMenu.tsx` — long-press context menu (iOS ContextMenu / Android modal fallback)
- `QuickCreateSheet.tsx` — FAB-triggered composer
- `FilterChips.tsx` — sticky chip row (Mine / Priority / Due soon / Unassigned)

**Native hooks (new, under `apps/native/src/hooks/board/`):**
- `useBoardList.ts` — SWR list of boards
- `useBoard.ts` — SWR single board (columns)
- `useBoardTasks.ts` — SWR tasks-for-board with optimistic apply
- `useTaskDetail.ts` — SWR single task detail
- `useMoveTask.ts` — optimistic + server mutation, reconciles with server response
- `useColumnReorder.ts` — optimistic column reorder
- `useTaskMutations.ts` — create/update/delete/priority/due/title
- `useAssigneeMutations.ts` — add/remove assignee
- `useChecklistMutations.ts` — add/toggle/delete item
- `useCommentMutations.ts` — add/edit/delete
- `useDragAutoscroll.ts` — Reanimated worklet that drives horizontal pager + column scrollview during drag

**Native lib:**
- Create: `apps/native/src/lib/haptics.ts` — thin wrapper over `expo-haptics`
- Create: `apps/native/src/lib/admin.ts` — `canAdmin(user)` helper (mirror `canViewOpenGames`)

**i18n:**
- Modify: `apps/native/src/i18n/en.json`, `de.json` — board/task strings

---

## Phase 0 — Preparation

### Task 0.1: Add native dependencies

**Files:**
- Modify: `apps/native/package.json`

- [ ] **Step 1: Add dependencies**

```bash
cd apps/native
pnpm add react-native-gesture-handler @gorhom/bottom-sheet expo-haptics
```

Expected: Packages added, `pnpm-lock.yaml` updated. Pin to versions compatible with Expo SDK 55 / React Native 0.83 / Reanimated 4.3. At time of writing: `react-native-gesture-handler@^2.23`, `@gorhom/bottom-sheet@^5.3`, `expo-haptics@~15.0`.

- [ ] **Step 2: Run lint/typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/package.json pnpm-lock.yaml
git commit -m "chore(native): add gesture-handler, bottom-sheet, haptics for kanban"
```

### Task 0.2: Wire `GestureHandlerRootView`

**Files:**
- Modify: `apps/native/src/app/_layout.tsx`

- [ ] **Step 1: Import and wrap root tree**

Find the `return (` block in `RootLayout` that renders `<ErrorBoundary>…</ErrorBoundary>`. Wrap it in `GestureHandlerRootView`:

```tsx
import { GestureHandlerRootView } from "react-native-gesture-handler";

// inside RootLayout return:
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <ErrorBoundary>
      <KeyboardProvider>
        <SWRConfig value={swrConfig}>
          <LocaleProvider>
            <ThemeProvider>
              <RootNavigator />
            </ThemeProvider>
          </LocaleProvider>
        </SWRConfig>
      </KeyboardProvider>
    </ErrorBoundary>
  </GestureHandlerRootView>
);
```

- [ ] **Step 2: Sanity build**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Manual test**

Start the app (`pnpm --filter @dragons/native start`). Navigate tabs. Expected: app still renders as before, no visual regression.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/app/_layout.tsx
git commit -m "feat(native): mount GestureHandlerRootView at app root"
```

### Task 0.3: Extract reorder algorithm to `@dragons/shared`

**Files:**
- Create: `packages/shared/src/board-dnd.ts`
- Create: `packages/shared/src/board-dnd.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/src/board-dnd.ts` with the full exported API**

Copy the contents of `apps/web/src/lib/dnd.ts` verbatim into `packages/shared/src/board-dnd.ts`. The imports already point at `@dragons/shared`; change them to relative: `import type { TaskCardData, BoardColumnData } from "./tasks"` and `"./boards"` respectively. Export the same four functions (`computeDropTarget`, `buildColumnReorder`, `applyTaskMove`, `applyColumnReorder`) and the `DragItem`/`DropTarget` types.

- [ ] **Step 2: Create `packages/shared/src/board-dnd.test.ts`**

Copy the contents of `apps/web/src/lib/dnd.test.ts` verbatim, but change the import line `from "./dnd"` to `from "./board-dnd"`.

- [ ] **Step 3: Export from `packages/shared/src/index.ts`**

Add to the existing exports block:

```ts
export {
  computeDropTarget,
  buildColumnReorder,
  applyTaskMove,
  applyColumnReorder,
} from "./board-dnd";
export type { DragItem, DropTarget } from "./board-dnd";
```

- [ ] **Step 4: Run shared tests**

Run: `pnpm --filter @dragons/shared test`
Expected: PASS (all 14+ test cases from the copied file).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/board-dnd.ts packages/shared/src/board-dnd.test.ts packages/shared/src/index.ts
git commit -m "refactor(shared): extract kanban reorder algorithm for web+native reuse"
```

### Task 0.4: Make web re-export from shared, delete duplicate

**Files:**
- Modify: `apps/web/src/lib/dnd.ts`
- Delete: `apps/web/src/lib/dnd.test.ts`

- [ ] **Step 1: Replace web `dnd.ts` with a thin re-export**

Overwrite `apps/web/src/lib/dnd.ts`:

```ts
export {
  computeDropTarget,
  buildColumnReorder,
  applyTaskMove,
  applyColumnReorder,
} from "@dragons/shared";
export type { DragItem, DropTarget } from "@dragons/shared";
```

- [ ] **Step 2: Delete the web-local test (now duplicated in shared)**

```bash
rm apps/web/src/lib/dnd.test.ts
```

- [ ] **Step 3: Run web typecheck + relevant tests**

Run: `pnpm --filter @dragons/web typecheck && pnpm --filter @dragons/web test --run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/dnd.ts apps/web/src/lib/dnd.test.ts
git commit -m "refactor(web): re-export kanban dnd helpers from @dragons/shared"
```

---

## Phase 1 — API Client

### Task 1.1: Write failing test for `adminBoardEndpoints`

**Files:**
- Create: `packages/api-client/src/endpoints/admin-board.test.ts`

- [ ] **Step 1: Write the test**

Model after `packages/api-client/src/endpoints/referee.test.ts`. Test coverage: `listBoards()`, `getBoard(id)`, `createBoard({name,description})`, `updateBoard(id, body)`, `deleteBoard(id)`, `addColumn`, `updateColumn`, `deleteColumn`, `reorderColumns(boardId, list)`, `listTasks(boardId, filters)`, `createTask(boardId, body)`, `getTask(id)`, `updateTask(id, body)`, `moveTask(id, {columnId, position})`, `deleteTask(id)`, checklist CRUD, comment CRUD, assignee add/remove.

Example shape (one per CRUD group, pattern applies across):

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../client";
import { adminBoardEndpoints } from "./admin-board";

function makeClient() {
  const fetchMock = vi.fn();
  const client = new ApiClient({ baseUrl: "http://x", fetch: fetchMock });
  return { client, fetchMock };
}

describe("adminBoardEndpoints", () => {
  it("listBoards GETs /admin/boards", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => [], headers: new Headers(),
    });
    const api = adminBoardEndpoints(client);
    await api.listBoards();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x/admin/boards",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("moveTask PATCHes /admin/tasks/:id/move", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({}), headers: new Headers(),
    });
    const api = adminBoardEndpoints(client);
    await api.moveTask(42, { columnId: 7, position: 2 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://x/admin/tasks/42/move");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ columnId: 7, position: 2 });
  });
});
```

Write one test per endpoint method. Use `packages/api-client/src/client.test.ts` to understand the mock pattern already in use (if `ApiClient` doesn't support a `fetch` option, use `vi.stubGlobal("fetch", fetchMock)` instead — match existing test file style).

- [ ] **Step 2: Run test, confirm it fails**

Run: `pnpm --filter @dragons/api-client test`
Expected: FAIL — `adminBoardEndpoints` not defined.

### Task 1.2: Implement `adminBoardEndpoints`

**Files:**
- Create: `packages/api-client/src/endpoints/admin-board.ts`
- Modify: `packages/api-client/src/endpoints/index.ts`

- [ ] **Step 1: Create the endpoints file**

```ts
import type {
  BoardSummary,
  BoardData,
  BoardColumnData,
  TaskCardData,
  TaskDetail,
  TaskPriority,
  ChecklistItem,
  TaskComment,
  TaskAssignee,
} from "@dragons/shared";
import type { ApiClient } from "../client";

export interface TaskListFilters {
  columnId?: number;
  assigneeId?: string;
  priority?: TaskPriority;
}

export interface CreateBoardBody {
  name: string;
  description?: string | null;
}

export interface CreateTaskBody {
  columnId: number;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
}

export interface UpdateTaskBody {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
}

export interface MoveTaskBody {
  columnId: number;
  position: number;
}

export interface AddColumnBody {
  name: string;
  color?: string | null;
  isDoneColumn?: boolean;
}

export interface UpdateColumnBody {
  name?: string;
  color?: string | null;
  isDoneColumn?: boolean;
}

export function adminBoardEndpoints(client: ApiClient) {
  return {
    // Boards
    listBoards(): Promise<BoardSummary[]> {
      return client.get("/admin/boards");
    },
    getBoard(id: number): Promise<BoardData> {
      return client.get(`/admin/boards/${id}`);
    },
    createBoard(body: CreateBoardBody): Promise<BoardData> {
      return client.post("/admin/boards", body);
    },
    updateBoard(
      id: number,
      body: { name?: string; description?: string | null },
    ): Promise<BoardData> {
      return client.patch(`/admin/boards/${id}`, body);
    },
    deleteBoard(id: number): Promise<void> {
      return client.delete(`/admin/boards/${id}`);
    },

    // Columns
    addColumn(boardId: number, body: AddColumnBody): Promise<BoardColumnData> {
      return client.post(`/admin/boards/${boardId}/columns`, body);
    },
    updateColumn(
      boardId: number,
      colId: number,
      body: UpdateColumnBody,
    ): Promise<BoardColumnData> {
      return client.patch(`/admin/boards/${boardId}/columns/${colId}`, body);
    },
    deleteColumn(boardId: number, colId: number): Promise<void> {
      return client.delete(`/admin/boards/${boardId}/columns/${colId}`);
    },
    reorderColumns(
      boardId: number,
      order: { id: number; position: number }[],
    ): Promise<void> {
      return client.patch(`/admin/boards/${boardId}/columns/reorder`, { order });
    },

    // Tasks
    listTasks(
      boardId: number,
      filters?: TaskListFilters,
    ): Promise<TaskCardData[]> {
      return client.get(
        `/admin/boards/${boardId}/tasks`,
        filters as Record<string, string | number | boolean | undefined>,
      );
    },
    createTask(boardId: number, body: CreateTaskBody): Promise<TaskCardData> {
      return client.post(`/admin/boards/${boardId}/tasks`, body);
    },
    getTask(id: number): Promise<TaskDetail> {
      return client.get(`/admin/tasks/${id}`);
    },
    updateTask(id: number, body: UpdateTaskBody): Promise<TaskDetail> {
      return client.patch(`/admin/tasks/${id}`, body);
    },
    moveTask(id: number, body: MoveTaskBody): Promise<TaskDetail> {
      return client.patch(`/admin/tasks/${id}/move`, body);
    },
    deleteTask(id: number): Promise<void> {
      return client.delete(`/admin/tasks/${id}`);
    },

    // Checklist
    addChecklistItem(taskId: number, label: string): Promise<ChecklistItem> {
      return client.post(`/admin/tasks/${taskId}/checklist`, { label });
    },
    updateChecklistItem(
      taskId: number,
      itemId: number,
      body: { label?: string; isChecked?: boolean },
    ): Promise<ChecklistItem> {
      return client.patch(`/admin/tasks/${taskId}/checklist/${itemId}`, body);
    },
    deleteChecklistItem(taskId: number, itemId: number): Promise<void> {
      return client.delete(`/admin/tasks/${taskId}/checklist/${itemId}`);
    },

    // Comments
    addComment(taskId: number, body: string): Promise<TaskComment> {
      return client.post(`/admin/tasks/${taskId}/comments`, { body });
    },
    updateComment(
      taskId: number,
      commentId: number,
      body: string,
    ): Promise<TaskComment> {
      return client.patch(`/admin/tasks/${taskId}/comments/${commentId}`, { body });
    },
    deleteComment(taskId: number, commentId: number): Promise<void> {
      return client.delete(`/admin/tasks/${taskId}/comments/${commentId}`);
    },

    // Assignees
    addAssignee(taskId: number, userId: string): Promise<TaskAssignee> {
      return client.post(`/admin/tasks/${taskId}/assignees/${userId}`, {});
    },
    removeAssignee(taskId: number, userId: string): Promise<void> {
      return client.delete(`/admin/tasks/${taskId}/assignees/${userId}`);
    },
  };
}
```

Note: if `ApiClient` doesn't already have a `patch` method, check `packages/api-client/src/client.ts` — it almost certainly does (referee endpoints use DELETE/POST/GET). If PATCH is missing, add it there in this same commit.

- [ ] **Step 2: Export from index**

Add to `packages/api-client/src/endpoints/index.ts`:

```ts
export { adminBoardEndpoints } from "./admin-board";
export type {
  TaskListFilters,
  CreateBoardBody,
  CreateTaskBody,
  UpdateTaskBody,
  MoveTaskBody,
  AddColumnBody,
  UpdateColumnBody,
} from "./admin-board";
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @dragons/api-client test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/src/endpoints/admin-board.ts packages/api-client/src/endpoints/admin-board.test.ts packages/api-client/src/endpoints/index.ts packages/api-client/src/client.ts
git commit -m "feat(api-client): add admin board + task endpoints"
```

### Task 1.3: Wire `adminBoardApi` into native

**Files:**
- Modify: `apps/native/src/lib/api.ts`

- [ ] **Step 1: Add the export**

Append to `apps/native/src/lib/api.ts`:

```ts
import { adminBoardEndpoints } from "@dragons/api-client";
export const adminBoardApi = adminBoardEndpoints(apiClient);
```

Update the existing `import { ... } from "@dragons/api-client"` statement near the top to include `adminBoardEndpoints` (don't duplicate the import).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/lib/api.ts
git commit -m "feat(native): wire adminBoardApi"
```

---

## Phase 2 — Admin Gate + Board List Screen

### Task 2.1: Add `canAdmin` helper

**Files:**
- Create: `apps/native/src/lib/admin.ts`
- Create: `apps/native/src/lib/admin.test.ts` (if a test harness exists for native lib — check `apps/native/vitest.config.ts`; if no native test runner, skip the test file and note it in the commit message)

- [ ] **Step 1: Write the helper**

```ts
// apps/native/src/lib/admin.ts
export function canAdmin(
  user: { role?: string | null } | null | undefined,
): boolean {
  return user?.role === "admin";
}
```

If `@dragons/shared` already has a `canAdmin` helper (grep for it first), re-export instead of redefining.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/lib/admin.ts
git commit -m "feat(native): add canAdmin role helper"
```

### Task 2.2: Add admin stack to the router

**Files:**
- Create: `apps/native/src/app/admin/_layout.tsx`
- Modify: `apps/native/src/app/_layout.tsx`

- [ ] **Step 1: Create `apps/native/src/app/admin/_layout.tsx`**

```tsx
import { Stack, Redirect } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { canAdmin } from "@/lib/admin";
import { useTheme } from "@/hooks/useTheme";

export default function AdminLayout() {
  const { data: session } = authClient.useSession();
  const { colors } = useTheme();

  if (!canAdmin(session?.user)) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="boards/index" options={{ title: "Boards" }} />
      <Stack.Screen name="boards/[id]" options={{ title: "" }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Register admin route in root `Stack`**

In `apps/native/src/app/_layout.tsx`, inside `RootNavigator`, add:

```tsx
<Stack.Screen name="admin" options={{ headerShown: false }} />
```

Place it after `(tabs)` and before the other detail screens.

- [ ] **Step 3: Manual test**

Launch app, log in as admin. Navigate to `/admin/boards` via `router.push` from dev tools or a temporary button. Expected: empty shell renders with "Boards" title, no crash. Non-admin user: redirect to `/`.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/app/_layout.tsx apps/native/src/app/admin/_layout.tsx
git commit -m "feat(native): scaffold admin route stack with role gate"
```

### Task 2.3: `useBoardList` hook + test

**Files:**
- Create: `apps/native/src/hooks/board/useBoardList.ts`

- [ ] **Step 1: Write the hook**

```ts
// apps/native/src/hooks/board/useBoardList.ts
import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { BoardSummary } from "@dragons/shared";

export const BOARD_LIST_KEY = "admin/boards";

export function useBoardList() {
  return useSWR<BoardSummary[]>(BOARD_LIST_KEY, () => adminBoardApi.listBoards());
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/hooks/board/useBoardList.ts
git commit -m "feat(native): useBoardList SWR hook"
```

### Task 2.4: Board list screen

**Files:**
- Create: `apps/native/src/app/admin/boards/index.tsx`
- Modify: `apps/native/src/i18n/en.json`, `de.json` (add `admin.boards.*` keys)

- [ ] **Step 1: Create the screen**

```tsx
import { FlatList, Pressable, Text, View, ActivityIndicator, RefreshControl } from "react-native";
import { router } from "expo-router";
import { useBoardList } from "@/hooks/board/useBoardList";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function BoardListScreen() {
  const { colors, spacing, radius, textStyles } = useTheme();
  const { data, isLoading, mutate } = useBoardList();

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(b) => String(b.id)}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => { void mutate(); }}
          tintColor={colors.foreground}
        />
      }
      ListEmptyComponent={
        <Text style={[textStyles.body, { color: colors.mutedForeground, textAlign: "center" }]}>
          {i18n.t("admin.boards.empty")}
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/admin/boards/${item.id}`)}
          style={{
            padding: spacing.lg,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={[textStyles.titleSm, { color: colors.foreground }]}>
            {item.name}
          </Text>
          {item.description ? (
            <Text
              style={[textStyles.bodySm, { color: colors.mutedForeground, marginTop: spacing.xs }]}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          ) : null}
        </Pressable>
      )}
    />
  );
}
```

If `textStyles.titleSm` / `textStyles.bodySm` don't exist, use whichever names are in `apps/native/src/theme/typography.ts` (check before writing). Do not invent new theme tokens in this task.

- [ ] **Step 2: Add i18n keys**

Append to `apps/native/src/i18n/en.json`:

```json
"admin": {
  "boards": {
    "title": "Boards",
    "empty": "No boards yet.",
    "new": "New board"
  }
}
```

Mirror in `de.json` with German translations ("Boards", "Noch keine Boards.", "Neues Board").

- [ ] **Step 3: Add entry point on profile screen**

In `apps/native/src/app/profile.tsx`, gate by `canAdmin(user)` (match the existing section style) and add a navigation row:

```tsx
{canAdmin(user) ? (
  <Pressable onPress={() => router.push("/admin/boards")} /* existing row styling */>
    <Text>{i18n.t("admin.boards.title")}</Text>
  </Pressable>
) : null}
```

Find the right place in profile.tsx to add it — should match existing row component style.

- [ ] **Step 4: Manual test**

Run app. As admin, navigate profile → Boards. Expected: list renders, pull-to-refresh works, empty state shows when no boards.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/app/admin/boards/index.tsx apps/native/src/app/profile.tsx apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): admin boards list screen with profile entry"
```

---

## Phase 3 — Board Detail (Static, No Drag Yet)

### Task 3.1: `useBoard` + `useBoardTasks` hooks

**Files:**
- Create: `apps/native/src/hooks/board/useBoard.ts`
- Create: `apps/native/src/hooks/board/useBoardTasks.ts`

- [ ] **Step 1: Write `useBoard.ts`**

```ts
import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { BoardData } from "@dragons/shared";

export const boardKey = (id: number) => `admin/boards/${id}`;

export function useBoard(id: number) {
  return useSWR<BoardData>(boardKey(id), () => adminBoardApi.getBoard(id));
}
```

- [ ] **Step 2: Write `useBoardTasks.ts`**

```ts
import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskCardData } from "@dragons/shared";
import type { TaskListFilters } from "@dragons/api-client";

export const tasksKey = (boardId: number, filters?: TaskListFilters) =>
  [`admin/boards/${boardId}/tasks`, filters ?? null] as const;

export function useBoardTasks(boardId: number, filters?: TaskListFilters) {
  return useSWR<TaskCardData[]>(tasksKey(boardId, filters), () =>
    adminBoardApi.listTasks(boardId, filters),
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @dragons/native typecheck
git add apps/native/src/hooks/board/useBoard.ts apps/native/src/hooks/board/useBoardTasks.ts
git commit -m "feat(native): useBoard + useBoardTasks SWR hooks"
```

### Task 3.2: `TaskCard` component (static)

**Files:**
- Create: `apps/native/src/components/board/TaskCard.tsx`

- [ ] **Step 1: Implement the card**

```tsx
import { View, Text, Pressable } from "react-native";
import type { TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

const PRIORITY_DOT: Record<TaskCardData["priority"], string | null> = {
  low: null,
  normal: null,
  high: "#f59e0b",      // amber
  critical: "#ef4444",  // red
};

interface TaskCardProps {
  task: TaskCardData;
  onPress: (task: TaskCardData) => void;
  onLongPress?: (task: TaskCardData) => void;
}

export function TaskCard({ task, onPress, onLongPress }: TaskCardProps) {
  const { colors, spacing, radius } = useTheme();
  const dot = PRIORITY_DOT[task.priority];
  const hasChecklist = task.checklistTotal > 0;

  return (
    <Pressable
      onPress={() => onPress(task)}
      onLongPress={onLongPress ? () => onLongPress(task) : undefined}
      delayLongPress={350}
      style={({ pressed }) => ({
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.surfaceHigh : colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.xs,
        minHeight: 72,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
        {dot ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        ) : null}
        <Text
          style={{ flex: 1, color: colors.foreground, fontSize: 15, fontWeight: "600" }}
          numberOfLines={2}
        >
          {task.title}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {task.dueDate ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {new Date(task.dueDate).toLocaleDateString()}
          </Text>
        ) : null}
        {hasChecklist ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {task.checklistChecked}/{task.checklistTotal}
          </Text>
        ) : null}
        {task.assignees.length > 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {task.assignees.length === 1
              ? task.assignees[0]?.name ?? i18n.t("board.task.unnamedUser")
              : i18n.t("board.task.assigneeCount", { count: task.assignees.length })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
```

Add i18n keys `board.task.unnamedUser`, `board.task.assigneeCount` (with `{count}` placeholder). Replace inline `#f59e0b`/`#ef4444` with the nearest equivalents from the app's theme tokens (`colors.heat`, `colors.destructive`) — grep `apps/native/src/theme/colors.ts` first.

- [ ] **Step 2: Commit**

```bash
git add apps/native/src/components/board/TaskCard.tsx apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): TaskCard component"
```

### Task 3.3: `BoardColumn` component (static)

**Files:**
- Create: `apps/native/src/components/board/BoardColumn.tsx`

- [ ] **Step 1: Implement**

```tsx
import { View, Text, ScrollView, Pressable } from "react-native";
import type { TaskCardData, BoardColumnData } from "@dragons/shared";
import { TaskCard } from "./TaskCard";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface BoardColumnProps {
  column: BoardColumnData;
  tasks: TaskCardData[];
  width: number;
  onTaskPress: (task: TaskCardData) => void;
  onTaskLongPress?: (task: TaskCardData) => void;
  onAddTask: (columnId: number) => void;
}

export function BoardColumn({
  column,
  tasks,
  width,
  onTaskPress,
  onTaskLongPress,
  onAddTask,
}: BoardColumnProps) {
  const { colors, spacing, radius } = useTheme();
  const columnTasks = tasks
    .filter((t) => t.columnId === column.id)
    .sort((a, b) => a.position - b.position);

  return (
    <View style={{ width, paddingHorizontal: spacing.sm }}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surfaceLow,
          borderRadius: radius.lg,
          overflow: "hidden",
        }}
      >
        <View
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
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            {columnTasks.length}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: spacing.sm,
            gap: spacing.sm,
            paddingBottom: spacing.xxl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {columnTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onPress={onTaskPress}
              onLongPress={onTaskLongPress}
            />
          ))}
          <Pressable
            onPress={() => onAddTask(column.id)}
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.mutedForeground }}>
              {i18n.t("board.column.addCard")}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Add i18n `board.column.addCard`**

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/board/BoardColumn.tsx apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): BoardColumn component"
```

### Task 3.4: `BoardHeader` + column pill nav

**Files:**
- Create: `apps/native/src/components/board/BoardHeader.tsx`

- [ ] **Step 1: Implement**

```tsx
import { ScrollView, Pressable, Text, View } from "react-native";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";

interface BoardHeaderProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  activeColumnIndex: number;
  onPillPress: (index: number) => void;
}

export function BoardHeader({
  columns,
  tasks,
  activeColumnIndex,
  onPillPress,
}: BoardHeaderProps) {
  const { colors, spacing, radius } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.xs,
      }}
    >
      {columns.map((col, i) => {
        const active = i === activeColumnIndex;
        const count = tasks.filter((t) => t.columnId === col.id).length;
        return (
          <Pressable
            key={col.id}
            onPress={() => onPillPress(i)}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill ?? 999,
              backgroundColor: active ? colors.primary : colors.surface,
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
                fontSize: 13,
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
              }}
            >
              {count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/native/src/components/board/BoardHeader.tsx
git commit -m "feat(native): BoardHeader pill nav"
```

### Task 3.5: `BoardPager` — paged horizontal scroll

**Files:**
- Create: `apps/native/src/components/board/BoardPager.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useCallback, useMemo, useRef } from "react";
import {
  ScrollView,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { BoardColumn } from "./BoardColumn";

interface BoardPagerProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  activeColumnIndex: number;
  onActiveColumnChange: (i: number) => void;
  onTaskPress: (task: TaskCardData) => void;
  onTaskLongPress?: (task: TaskCardData) => void;
  onAddTask: (columnId: number) => void;
  scrollRef?: React.RefObject<ScrollView | null>;
}

export function BoardPager({
  columns,
  tasks,
  activeColumnIndex,
  onActiveColumnChange,
  onTaskPress,
  onTaskLongPress,
  onAddTask,
  scrollRef: externalRef,
}: BoardPagerProps) {
  const internalRef = useRef<ScrollView | null>(null);
  const scrollRef = externalRef ?? internalRef;
  const { width: winWidth } = useWindowDimensions();
  const columnWidth = useMemo(() => Math.round(winWidth * 0.88), [winWidth]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / columnWidth);
      if (i !== activeColumnIndex) onActiveColumnChange(i);
    },
    [columnWidth, activeColumnIndex, onActiveColumnChange],
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled={false}
      decelerationRate="fast"
      snapToInterval={columnWidth}
      snapToAlignment="start"
      showsHorizontalScrollIndicator={false}
      onMomentumScrollEnd={handleMomentumEnd}
      contentContainerStyle={{ paddingVertical: 4 }}
    >
      {columns.map((col) => (
        <BoardColumn
          key={col.id}
          column={col}
          tasks={tasks}
          width={columnWidth}
          onTaskPress={onTaskPress}
          onTaskLongPress={onTaskLongPress}
          onAddTask={onAddTask}
        />
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/native/src/components/board/BoardPager.tsx
git commit -m "feat(native): BoardPager horizontal snap scroll"
```

### Task 3.6: Board detail screen — wire all three

**Files:**
- Create: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState, useCallback, useRef } from "react";
import { View, Text, ActivityIndicator, ScrollView } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useBoard } from "@/hooks/board/useBoard";
import { useBoardTasks } from "@/hooks/board/useBoardTasks";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardPager } from "@/components/board/BoardPager";
import { useTheme } from "@/hooks/useTheme";
import type { TaskCardData } from "@dragons/shared";

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const boardId = Number(id);
  const { data: board, isLoading: boardLoading } = useBoard(boardId);
  const { data: tasks, isLoading: tasksLoading } = useBoardTasks(boardId);
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const pagerRef = useRef<ScrollView | null>(null);

  const onPillPress = useCallback((i: number) => {
    setActiveIndex(i);
    // Scroll pager to index. Column width is 88% of window - compute on the fly.
    // BoardPager manages its own width; we rely on the ScrollView ref to scrollTo.
    // Window.width is not in scope here; easier to expose a scrollToIndex API on BoardPager.
  }, []);

  if (boardLoading && !board) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }
  if (!board) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.foreground }}>Not found</Text>
      </View>
    );
  }

  const columns = [...board.columns].sort((a, b) => a.position - b.position);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: board.name }} />
      <BoardHeader
        columns={columns}
        tasks={tasks ?? []}
        activeColumnIndex={activeIndex}
        onPillPress={onPillPress}
      />
      <View style={{ flex: 1 }}>
        {tasksLoading && !tasks ? (
          <ActivityIndicator color={colors.foreground} style={{ marginTop: 40 }} />
        ) : (
          <BoardPager
            columns={columns}
            tasks={tasks ?? []}
            activeColumnIndex={activeIndex}
            onActiveColumnChange={setActiveIndex}
            onTaskPress={() => {/* wired in Phase 4 */}}
            onAddTask={() => {/* wired in Phase 10 */}}
            scrollRef={pagerRef}
          />
        )}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Wire `onPillPress` to actually scroll the pager**

Update `BoardPager` to accept an `onReady: (api: { scrollToIndex: (i: number) => void }) => void` prop, OR expose a `scrollToIndex` imperative handle via `React.forwardRef`. Pick one pattern consistent with the codebase — grep existing native components for `forwardRef` / `useImperativeHandle` usage to match. Update the board detail screen to call `scrollToIndex(i)` when a pill is pressed.

- [ ] **Step 3: Manual test**

Log in as admin, open a board. Expected: columns render, horizontal snap scroll works, pill highlights active column, tapping pill jumps to it, pull-to-refresh on list is intact. Tasks visible under each column.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/app/admin/boards/\[id\].tsx apps/native/src/components/board/BoardPager.tsx
git commit -m "feat(native): board detail screen with paged columns + pill nav"
```

---

## Phase 4 — Task Detail Bottom Sheet (Read + Inline Edits)

### Task 4.1: `useTaskDetail` hook

**Files:**
- Create: `apps/native/src/hooks/board/useTaskDetail.ts`

- [ ] **Step 1: Write the hook**

```ts
import useSWR from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskDetail } from "@dragons/shared";

export const taskKey = (id: number) => `admin/tasks/${id}`;

export function useTaskDetail(id: number | null) {
  return useSWR<TaskDetail | null>(
    id == null ? null : taskKey(id),
    async () => (id == null ? null : adminBoardApi.getTask(id)),
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/native/src/hooks/board/useTaskDetail.ts
git commit -m "feat(native): useTaskDetail hook"
```

### Task 4.2: `useTaskMutations` hook

**Files:**
- Create: `apps/native/src/hooks/board/useTaskMutations.ts`

- [ ] **Step 1: Write**

```ts
import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskDetail, TaskPriority } from "@dragons/shared";
import type { UpdateTaskBody } from "@dragons/api-client";
import { taskKey } from "./useTaskDetail";
import { tasksKey } from "./useBoardTasks";

export function useTaskMutations(boardId: number) {
  const { mutate } = useSWRConfig();

  async function patch(taskId: number, body: UpdateTaskBody): Promise<TaskDetail> {
    const next = await adminBoardApi.updateTask(taskId, body);
    await Promise.all([
      mutate(taskKey(taskId), next, { revalidate: false }),
      // Revalidate all filter variants of this board's task list.
      mutate(
        (key) => Array.isArray(key) && typeof key[0] === "string" && key[0] === `admin/boards/${boardId}/tasks`,
      ),
    ]);
    return next;
  }

  return {
    setTitle: (id: number, title: string) => patch(id, { title }),
    setDescription: (id: number, description: string | null) => patch(id, { description }),
    setPriority: (id: number, priority: TaskPriority) => patch(id, { priority }),
    setDueDate: (id: number, dueDate: string | null) => patch(id, { dueDate }),
    deleteTask: async (id: number) => {
      await adminBoardApi.deleteTask(id);
      await Promise.all([
        mutate(taskKey(id), undefined, { revalidate: false }),
        mutate(
          (key) => Array.isArray(key) && typeof key[0] === "string" && key[0] === `admin/boards/${boardId}/tasks`,
        ),
      ]);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/native/src/hooks/board/useTaskMutations.ts
git commit -m "feat(native): useTaskMutations (title/description/priority/due/delete)"
```

### Task 4.3: Bottom sheet root + task detail shell

**Files:**
- Create: `apps/native/src/components/board/TaskDetailSheet.tsx`

- [ ] **Step 1: Install `@gorhom/bottom-sheet` provider at app root**

In `apps/native/src/app/_layout.tsx`, wrap `<KeyboardProvider>` with `<BottomSheetModalProvider>`:

```tsx
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

// inside RootLayout's return, inside GestureHandlerRootView:
<BottomSheetModalProvider>
  <KeyboardProvider>
    ...
  </KeyboardProvider>
</BottomSheetModalProvider>
```

- [ ] **Step 2: Implement `TaskDetailSheet.tsx`**

```tsx
import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useMemo } from "react";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { ActivityIndicator, View } from "react-native";
import { useTaskDetail } from "@/hooks/board/useTaskDetail";
import { TaskDetailBody } from "./TaskDetailBody";
import { useTheme } from "@/hooks/useTheme";

export interface TaskDetailSheetHandle {
  open: (taskId: number) => void;
  close: () => void;
}

interface Props {
  boardId: number;
}

export const TaskDetailSheet = forwardRef<TaskDetailSheetHandle, Props>(
  function TaskDetailSheet({ boardId }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [taskId, setTaskId] = useState<number | null>(null);
    const { colors } = useTheme();
    const snapPoints = useMemo(() => ["55%", "92%"], []);

    useImperativeHandle(ref, () => ({
      open: (id) => {
        setTaskId(id);
        sheetRef.current?.present();
      },
      close: () => sheetRef.current?.dismiss(),
    }), []);

    const { data: task, isLoading } = useTaskDetail(taskId);

    const renderBackdrop = useCallback(
      (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        onDismiss={() => setTaskId(null)}
        enablePanDownToClose
      >
        <BottomSheetView style={{ flex: 1 }}>
          {isLoading || !task ? (
            <View style={{ padding: 32, alignItems: "center" }}>
              <ActivityIndicator color={colors.foreground} />
            </View>
          ) : (
            <TaskDetailBody task={task} boardId={boardId} />
          )}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/_layout.tsx apps/native/src/components/board/TaskDetailSheet.tsx
git commit -m "feat(native): TaskDetailSheet shell + BottomSheetModalProvider at root"
```

### Task 4.4: `TaskDetailBody` — title, description, metadata strip

**Files:**
- Create: `apps/native/src/components/board/TaskDetailBody.tsx`

- [ ] **Step 1: Implement read + inline edit for title and description**

```tsx
import { useState } from "react";
import { View, Text, TextInput, ScrollView } from "react-native";
import type { TaskDetail } from "@dragons/shared";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface Props {
  task: TaskDetail;
  boardId: number;
}

export function TaskDetailBody({ task, boardId }: Props) {
  const { colors, spacing, textStyles } = useTheme();
  const mutations = useTaskMutations(boardId);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");

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

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        onBlur={saveTitle}
        style={{
          color: colors.foreground,
          fontSize: 20,
          fontWeight: "700",
          paddingVertical: spacing.xs,
        }}
        placeholder={i18n.t("board.task.titlePlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        multiline
      />

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
          #{task.id}
        </Text>
      </View>

      <TextInput
        value={description}
        onChangeText={setDescription}
        onBlur={saveDescription}
        multiline
        style={{
          color: colors.foreground,
          fontSize: 15,
          minHeight: 80,
          paddingVertical: spacing.xs,
        }}
        placeholder={i18n.t("board.task.descriptionPlaceholder")}
        placeholderTextColor={colors.mutedForeground}
      />

      {/* Priority / Due / Assignees / Checklist / Comments slots wired in later tasks */}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Wire sheet from board detail screen**

In `apps/native/src/app/admin/boards/[id].tsx`, add a ref to `TaskDetailSheet`, render the sheet at the bottom of the screen, and set the `onTaskPress` in `BoardPager` to `(task) => sheetRef.current?.open(task.id)`.

- [ ] **Step 3: Manual test**

Tap a card → sheet opens at 55%. Swipe up → expands to 92%. Edit title, swipe down to dismiss. Reopen → title persists. Repeat for description.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/components/board/TaskDetailBody.tsx apps/native/src/app/admin/boards/\[id\].tsx apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): task detail body with inline title+description edit"
```

---

## Phase 5 — Priority + Due Date Pickers

### Task 5.1: `PriorityPickerSheet` component

**Files:**
- Create: `apps/native/src/components/board/PriorityPickerSheet.tsx`

- [ ] **Step 1: Implement nested sheet**

```tsx
import { forwardRef, useImperativeHandle, useRef, useMemo } from "react";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { View, Text, Pressable } from "react-native";
import type { TaskPriority } from "@dragons/shared";
import { TASK_PRIORITIES } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface PriorityPickerHandle {
  open: (current: TaskPriority, onPick: (p: TaskPriority) => void) => void;
}

export const PriorityPickerSheet = forwardRef<PriorityPickerHandle>(
  function PriorityPickerSheet(_props, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const onPickRef = useRef<(p: TaskPriority) => void>(() => {});
    const snapPoints = useMemo(() => ["30%"], []);
    const { colors, spacing, radius } = useTheme();

    useImperativeHandle(ref, () => ({
      open: (_current, onPick) => {
        onPickRef.current = onPick;
        sheetRef.current?.present();
      },
    }), []);

    return (
      <BottomSheetModal ref={sheetRef} snapPoints={snapPoints} backgroundStyle={{ backgroundColor: colors.background }}>
        <BottomSheetView style={{ padding: spacing.lg, gap: spacing.sm }}>
          {TASK_PRIORITIES.map((p) => (
            <Pressable
              key={p}
              onPress={() => {
                onPickRef.current(p);
                sheetRef.current?.dismiss();
              }}
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 16 }}>
                {i18n.t(`board.priority.${p}`)}
              </Text>
            </Pressable>
          ))}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
```

- [ ] **Step 2: Add i18n keys**

`board.priority.low`, `board.priority.normal`, `board.priority.high`, `board.priority.critical` in both en.json and de.json.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/board/PriorityPickerSheet.tsx apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): PriorityPickerSheet"
```

### Task 5.2: `DuePickerSheet` component

**Files:**
- Create: `apps/native/src/components/board/DuePickerSheet.tsx`

- [ ] **Step 1: Install `@react-native-community/datetimepicker`**

```bash
cd apps/native
pnpm add @react-native-community/datetimepicker
```

Expected: Compatible with Expo SDK 55.

- [ ] **Step 2: Implement**

```tsx
import { forwardRef, useImperativeHandle, useRef, useState, useMemo } from "react";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface DuePickerHandle {
  open: (current: string | null, onPick: (iso: string | null) => void) => void;
}

export const DuePickerSheet = forwardRef<DuePickerHandle>(function DuePickerSheet(_p, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const onPickRef = useRef<(iso: string | null) => void>(() => {});
  const [value, setValue] = useState<Date>(new Date());
  const snapPoints = useMemo(() => ["45%"], []);
  const { colors, spacing, radius } = useTheme();

  useImperativeHandle(ref, () => ({
    open: (current, onPick) => {
      setValue(current ? new Date(current) : new Date());
      onPickRef.current = onPick;
      sheetRef.current?.present();
    },
  }), []);

  return (
    <BottomSheetModal ref={sheetRef} snapPoints={snapPoints} backgroundStyle={{ backgroundColor: colors.background }}>
      <BottomSheetView style={{ padding: spacing.lg, gap: spacing.lg }}>
        <DateTimePicker
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          value={value}
          onChange={(_, d) => d && setValue(d)}
          themeVariant="dark"
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Pressable
            onPress={() => {
              onPickRef.current(null);
              sheetRef.current?.dismiss();
            }}
            style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center" }}
          >
            <Text style={{ color: colors.foreground }}>{i18n.t("board.due.clear")}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onPickRef.current(value.toISOString());
              sheetRef.current?.dismiss();
            }}
            style={{ flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center" }}
          >
            <Text style={{ color: colors.primaryForeground }}>{i18n.t("board.due.set")}</Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
```

- [ ] **Step 3: Add i18n `board.due.clear`, `board.due.set`**

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/components/board/DuePickerSheet.tsx apps/native/package.json pnpm-lock.yaml apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): DuePickerSheet with native date picker"
```

### Task 5.3: Wire priority + due into `TaskDetailBody`

**Files:**
- Modify: `apps/native/src/components/board/TaskDetailBody.tsx`

- [ ] **Step 1: Add picker refs and trigger rows**

Inside `TaskDetailBody`, create `priorityRef` and `dueRef`. Render both pickers inline and add two rows in the scroll view:

```tsx
const priorityRef = useRef<PriorityPickerHandle>(null);
const dueRef = useRef<DuePickerHandle>(null);

// inside the ScrollView after description input:
<Pressable
  onPress={() => priorityRef.current?.open(task.priority, (p) => mutations.setPriority(task.id, p))}
  style={/* row style */}
>
  <Text style={{ color: colors.mutedForeground }}>{i18n.t("board.task.priority")}</Text>
  <Text style={{ color: colors.foreground }}>{i18n.t(`board.priority.${task.priority}`)}</Text>
</Pressable>

<Pressable
  onPress={() => dueRef.current?.open(task.dueDate, (iso) => mutations.setDueDate(task.id, iso))}
  style={/* row style */}
>
  <Text style={{ color: colors.mutedForeground }}>{i18n.t("board.task.due")}</Text>
  <Text style={{ color: colors.foreground }}>
    {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : i18n.t("board.task.noDue")}
  </Text>
</Pressable>

<PriorityPickerSheet ref={priorityRef} />
<DuePickerSheet ref={dueRef} />
```

- [ ] **Step 2: Manual test**

Open task sheet. Tap Priority row → picker sheet. Select Critical → sheet dismisses, row updates. Reopen task → value persists. Same for Due.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/board/TaskDetailBody.tsx apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): priority + due rows in task detail"
```

---

## Phase 6 — Assignee Picker

### Task 6.1: `useAssigneeMutations` + candidate search

**Files:**
- Create: `apps/native/src/hooks/board/useAssigneeMutations.ts`
- Check: does the API have an endpoint to search users for the assignee picker? If only `POST /admin/tasks/:id/assignees/:userId` exists and no user-search endpoint is exposed, verify whether an existing endpoint returns admins/users (e.g. `GET /admin/users`). If missing, add it to `apps/api/src/routes/admin/` + `packages/api-client/src/endpoints/admin-board.ts` as part of this task.

- [ ] **Step 1: Add a user-search API endpoint if absent**

Grep `apps/api/src/routes/admin/` for `users.routes.ts`. If one exists with a list/search endpoint, add `searchAdminUsers` to `adminBoardEndpoints`. If none, add `GET /admin/users?q=` returning `{ id, name, email }[]` limited to 50, in a new `apps/api/src/routes/admin/user.routes.ts` (mirror the pattern of `board.routes.ts`). Write tests for the new endpoint. Mount it in `apps/api/src/app.ts` alongside other admin routes.

- [ ] **Step 2: Add mutations hook**

```ts
// apps/native/src/hooks/board/useAssigneeMutations.ts
import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { taskKey } from "./useTaskDetail";

export function useAssigneeMutations(boardId: number) {
  const { mutate } = useSWRConfig();
  return {
    add: async (taskId: number, userId: string) => {
      await adminBoardApi.addAssignee(taskId, userId);
      await Promise.all([
        mutate(taskKey(taskId)),
        mutate(
          (key) => Array.isArray(key) && key[0] === `admin/boards/${boardId}/tasks`,
        ),
      ]);
    },
    remove: async (taskId: number, userId: string) => {
      await adminBoardApi.removeAssignee(taskId, userId);
      await Promise.all([
        mutate(taskKey(taskId)),
        mutate(
          (key) => Array.isArray(key) && key[0] === `admin/boards/${boardId}/tasks`,
        ),
      ]);
    },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/hooks/board/useAssigneeMutations.ts apps/api/src/routes/admin/ packages/api-client/src/endpoints/admin-board.ts
git commit -m "feat(native): useAssigneeMutations + admin user search endpoint if needed"
```

### Task 6.2: `AssigneePickerSheet` component

**Files:**
- Create: `apps/native/src/components/board/AssigneePickerSheet.tsx`

- [ ] **Step 1: Clone the AssignRefereeModal pattern at 92% snap**

Reuse the search + keyboard-synced floating bar UX from `apps/native/src/components/AssignRefereeModal.tsx`. Render as a `BottomSheetModal` (not a RN `Modal`) with a search `TextInput` pinned to the bottom (use `useReanimatedKeyboardAnimation` for the keyboard offset, identical to the existing modal). Render a `BottomSheetFlatList` (from `@gorhom/bottom-sheet`) above the search bar showing users. Tap to toggle assignee (call `add`/`remove`).

Indicate currently assigned users with a checkmark circle. Show assigned users at top of list. Expose via `useImperativeHandle` an `open(taskId, currentAssignees)` method.

- [ ] **Step 2: Wire into `TaskDetailBody`**

Add an "Assignees" row that shows avatar stack + count. Tap opens picker. Render `<AssigneePickerSheet ref={...} />` at the end of the body.

- [ ] **Step 3: Manual test**

Open task → tap Assignees → picker opens. Search a name → list filters. Tap a user → assignment toggles, sheet updates live. Close and reopen the task detail sheet — assignment persisted.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/components/board/AssigneePickerSheet.tsx apps/native/src/components/board/TaskDetailBody.tsx
git commit -m "feat(native): assignee picker sheet with search"
```

---

## Phase 7 — Checklist

### Task 7.1: `useChecklistMutations`

**Files:**
- Create: `apps/native/src/hooks/board/useChecklistMutations.ts`

- [ ] **Step 1: Implement optimistic add/toggle/delete**

```ts
import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskDetail } from "@dragons/shared";
import { taskKey } from "./useTaskDetail";

export function useChecklistMutations(boardId: number) {
  const { mutate } = useSWRConfig();

  async function refreshTaskAndBoard(taskId: number) {
    await Promise.all([
      mutate(taskKey(taskId)),
      mutate((key) => Array.isArray(key) && key[0] === `admin/boards/${boardId}/tasks`),
    ]);
  }

  return {
    addItem: async (taskId: number, label: string) => {
      await adminBoardApi.addChecklistItem(taskId, label);
      await refreshTaskAndBoard(taskId);
    },
    toggle: async (taskId: number, itemId: number, isChecked: boolean) => {
      // Optimistic toggle on task detail cache.
      await mutate(
        taskKey(taskId),
        (prev: TaskDetail | undefined) =>
          prev
            ? {
                ...prev,
                checklist: prev.checklist.map((i) =>
                  i.id === itemId ? { ...i, isChecked } : i,
                ),
                checklistChecked: prev.checklist.reduce(
                  (acc, i) => acc + ((i.id === itemId ? isChecked : i.isChecked) ? 1 : 0),
                  0,
                ),
              }
            : prev,
        { revalidate: false },
      );
      await adminBoardApi.updateChecklistItem(taskId, itemId, { isChecked });
      await refreshTaskAndBoard(taskId);
    },
    deleteItem: async (taskId: number, itemId: number) => {
      await adminBoardApi.deleteChecklistItem(taskId, itemId);
      await refreshTaskAndBoard(taskId);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/native/src/hooks/board/useChecklistMutations.ts
git commit -m "feat(native): useChecklistMutations with optimistic toggle"
```

### Task 7.2: Checklist section in `TaskDetailBody`

**Files:**
- Modify: `apps/native/src/components/board/TaskDetailBody.tsx`

- [ ] **Step 1: Render section**

Below the assignees row, render a `Checklist` section:
- Header: "Checklist" + progress "3/5"
- Progress bar (Reanimated or plain `View` with width %)
- List of items: each is `<Pressable>` with checkbox (filled when `isChecked`) + label, long-press to delete (prompt confirm via `Alert`)
- Add-item row at bottom: `TextInput` + "+" button; on submit, call `addItem` then clear input

Component code follows the same theme + i18n pattern as earlier components. No new theme tokens needed; use `colors.primary`, `colors.border`, etc.

- [ ] **Step 2: Manual test**

Open a task. Add "Buy milk" → appears. Check it → bar fills. Long-press → delete confirmation → removed.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/board/TaskDetailBody.tsx
git commit -m "feat(native): checklist UI in task detail"
```

---

## Phase 8 — Comments

### Task 8.1: `useCommentMutations` + inline section

**Files:**
- Create: `apps/native/src/hooks/board/useCommentMutations.ts`
- Modify: `apps/native/src/components/board/TaskDetailBody.tsx`

- [ ] **Step 1: Write mutations hook (same pattern as checklist)**

Implement `add`, `update`, `delete`. Revalidate `taskKey(taskId)` after each.

- [ ] **Step 2: Render comments section**

Below checklist: list of comments (author name if available, relative timestamp, body). Inline input at bottom of the sheet — use `react-native-keyboard-controller`'s `KeyboardStickyView` (already in the tree) to keep the input above the keyboard. Submit → `add` → input clears.

Own comments: long-press shows Edit / Delete actions.

- [ ] **Step 3: Manual test**

Add a comment. Appears in thread. Long-press own comment → edit / delete works.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/hooks/board/useCommentMutations.ts apps/native/src/components/board/TaskDetailBody.tsx
git commit -m "feat(native): comments in task detail"
```

---

## Phase 9 — Move-to Action Sheet (Accessibility Path)

This ships the movement UX *before* drag so reordering works on day one — and it stays as the accessibility-friendly fallback forever.

### Task 9.1: `useMoveTask` hook with optimistic apply

**Files:**
- Create: `apps/native/src/hooks/board/useMoveTask.ts`

- [ ] **Step 1: Write hook**

```ts
import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { applyTaskMove } from "@dragons/shared";
import type { TaskCardData } from "@dragons/shared";
import { tasksKey } from "./useBoardTasks";

export function useMoveTask(boardId: number) {
  const { mutate } = useSWRConfig();

  return async function moveTask(
    taskId: number,
    targetColumnId: number,
    targetPosition: number,
  ) {
    // Optimistic apply on every filter variant of the tasks list cache.
    await mutate(
      (key) => Array.isArray(key) && key[0] === `admin/boards/${boardId}/tasks`,
      (prev: TaskCardData[] | undefined) =>
        prev ? applyTaskMove(prev, taskId, targetColumnId, targetPosition) : prev,
      { revalidate: false },
    );

    try {
      await adminBoardApi.moveTask(taskId, {
        columnId: targetColumnId,
        position: targetPosition,
      });
    } finally {
      // Always revalidate to reconcile with server truth.
      await mutate(
        (key) => Array.isArray(key) && key[0] === `admin/boards/${boardId}/tasks`,
      );
    }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/native/src/hooks/board/useMoveTask.ts
git commit -m "feat(native): useMoveTask with optimistic applyTaskMove"
```

### Task 9.2: `MoveToSheet` component

**Files:**
- Create: `apps/native/src/components/board/MoveToSheet.tsx`

- [ ] **Step 1: Implement**

Bottom sheet with snap `["50%"]`. Props: `boardColumns: BoardColumnData[]`, `ref` exposes `open(task: TaskCardData)`.

Contents:
- Title "Move to…"
- List of columns (Pressable rows with color dot + name)
- Two position-placement buttons "Top" / "Bottom" (radio style, default Top)
- Primary action "Move" → calls `useMoveTask(boardId)(taskId, column.id, position)`

Position:
- Top → `0`
- Bottom → number of tasks currently in that column (computed at open time from cache)

- [ ] **Step 2: Commit**

```bash
git add apps/native/src/components/board/MoveToSheet.tsx
git commit -m "feat(native): MoveToSheet for accessible task movement"
```

### Task 9.3: `TaskContextMenu` (long-press card menu)

**Files:**
- Create: `apps/native/src/components/board/TaskContextMenu.tsx`

- [ ] **Step 1: Implement platform split**

- iOS: use `ContextMenu` from `react-native-context-menu-view` (add as dep) wrapping the card, OR a simple bottom-sheet-action-list (same visual on both platforms, simpler). For v1, go with bottom-sheet-action-list — consistency across platforms beats platform-native polish here.
- Actions: "Move to…", "Set priority", "Set due date", "Delete" (destructive, red).
- Long-press on card opens this. Tap "Move to…" dismisses this sheet and opens `MoveToSheet`. Priority / due routes to the existing pickers. Delete shows `Alert.alert` confirm.

- [ ] **Step 2: Wire into board detail screen**

Add `onTaskLongPress` to `BoardPager` → opens `TaskContextMenu`.

- [ ] **Step 3: Manual test**

Long-press a card → context menu. Tap "Move to…" → column picker → select target → card animates to new column (optimistic). Revalidation confirms with server.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/components/board/TaskContextMenu.tsx apps/native/src/app/admin/boards/\[id\].tsx
git commit -m "feat(native): long-press context menu + move-to flow"
```

---

## Phase 10 — Quick Create FAB

### Task 10.1: `QuickCreateSheet` + FAB button

**Files:**
- Create: `apps/native/src/components/board/QuickCreateSheet.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: FAB**

Add a round `Pressable` at bottom-right absolute-positioned (respect safe area) on the board detail screen. Icon "+". On press, opens `QuickCreateSheet` with the current active column preselected.

- [ ] **Step 2: Sheet**

Bottom sheet snap `["35%", "75%"]`. Contents:
- Column selector chip row (horizontal scroll; default = active column from pager)
- Title `TextInput` (autofocus)
- Optional description `TextInput` (multiline, shown when expanded to 75%)
- "Create" button → calls `adminBoardApi.createTask(boardId, { columnId, title, description })`, revalidates tasks cache, dismisses.
- Keyboard-synced using `react-native-keyboard-controller`.

- [ ] **Step 3: Manual test**

Tap FAB → sheet opens with active column preselected → type title → Enter → card appears at bottom of selected column.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/components/board/QuickCreateSheet.tsx apps/native/src/app/admin/boards/\[id\].tsx
git commit -m "feat(native): quick create FAB + composer sheet"
```

Also wire the per-column "+ Add card" button (from `BoardColumn`) to open the same sheet preselected to that column.

---

## Phase 11 — Drag Gesture + Autoscroll (The Hard Part)

This phase is the centerpiece. Implement iteratively — each task ships a visible improvement.

### Task 11.1: Long-press pickup with floating ghost

**Files:**
- Create: `apps/native/src/components/board/TaskCardDragGhost.tsx`
- Modify: `apps/native/src/components/board/TaskCard.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: Create drag-context state in the board detail screen**

```tsx
type DragState =
  | { active: false }
  | {
      active: true;
      task: TaskCardData;
      pointerX: number;
      pointerY: number;
      sourceColumnId: number;
    };
const [drag, setDrag] = useState<DragState>({ active: false });
```

- [ ] **Step 2: Wrap `TaskCard` in `LongPressGestureHandler`**

Use `react-native-gesture-handler` `Gesture.LongPress().minDuration(350)` composed with `Gesture.Pan()`. On long-press activate → call `haptics.impact("medium")`, start drag state with initial touch, hide the original card (opacity 0 or translateY offscreen) while a `TaskCardDragGhost` floats at the finger.

The composed gesture: long-press → pan continues from the same touch. GH `Gesture.Simultaneous(longPress, pan)` with the pan only taking effect after longPress succeeds.

- [ ] **Step 3: Implement `TaskCardDragGhost`**

A `<Animated.View>` positioned absolutely on the screen, using Reanimated shared values for `translationX`/`translationY`. Renders a `TaskCard` clone with scale 1.04 and shadow elevated. Tracks the pan gesture's translation.

- [ ] **Step 4: Manual test**

Long-press a card → haptic fires, card lifts at finger. Drag around — ghost follows. Release → ghost disappears (no drop logic yet; card returns to origin).

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/components/board/TaskCardDragGhost.tsx apps/native/src/components/board/TaskCard.tsx apps/native/src/app/admin/boards/\[id\].tsx apps/native/src/lib/haptics.ts
git commit -m "feat(native): long-press pickup + floating drag ghost"
```

### Task 11.2: Measure card positions + detect drop target

**Files:**
- Modify: `apps/native/src/components/board/TaskCard.tsx`
- Modify: `apps/native/src/components/board/BoardColumn.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: Maintain a measurement map**

Create `Map<number, { x: number; y: number; width: number; height: number; columnId: number }>` keyed by task id in the board screen. On `TaskCard` mount / layout, call `measureInWindow` and bubble up via a registration callback. Same for column rects (use `BoardColumn`'s outer view).

- [ ] **Step 2: During drag, compute drop target on the UI thread**

Use Reanimated `useAnimatedReaction` to watch pointer shared values. Translate pointer into a `DragItem`/`over` pair:
- If pointer is inside a task's rect → `over = { type: "task", id, columnId }`
- Else if pointer is inside a column's rect (below last card) → `over = { type: "column", id: columnId, columnId }`

Call `computeDropTarget` from `@dragons/shared` on the JS thread via `runOnJS` when the target changes — or compute on JS thread only in response to gesture updates throttled to ~16ms (simpler and correct; drag accuracy comes from the ghost, not realtime prediction).

- [ ] **Step 3: Visualize target**

Highlight the drop target: if over a task, render a 2px insertion line above/below it; if over a column, highlight the column outline. Use Reanimated to animate the highlight smoothly.

- [ ] **Step 4: Manual test**

Drag a card over another card — insertion line appears. Drag over empty column — column outline highlights. Drag off-screen — no target shown. Release does nothing yet.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(native): drop target detection + insertion line"
```

### Task 11.3: Drop + server call

**Files:**
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: On gesture end**

If a drop target is set, call `useMoveTask(boardId)(task.id, target.columnId, target.position)`. Fire `haptics.impact("light")` and animate the ghost into the final card position (use Reanimated `withSpring` on the translation values mapped to the destination cell's measured position) before unmounting.

If no target, spring ghost back to origin.

- [ ] **Step 2: Manual test**

Drag a card from column A to column B → drop on empty area → card appears at bottom of B. Drag to mid-column → lands at the insertion line. Server round-trip: wait for revalidation — card stays in new spot (server agrees).

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/admin/boards/\[id\].tsx
git commit -m "feat(native): commit drop via moveTask + spring ghost"
```

### Task 11.4: Vertical autoscroll within column

**Files:**
- Modify: `apps/native/src/components/board/BoardColumn.tsx`

- [ ] **Step 1: Expose ScrollView ref via forwardRef**

Make `BoardColumn` forwardRef-capable; parent (board screen) stores refs per column id.

- [ ] **Step 2: Autoscroll worklet**

Create `apps/native/src/hooks/board/useDragAutoscroll.ts`. Runs on UI thread via Reanimated `useFrameCallback`. Each frame:
- If drag is active and pointer is in the active column's rect
- If pointer within 80pt of top → scroll column up by a speed proportional to distance
- If within 80pt of bottom → scroll down
- Use `scrollTo(ref, x, y, false)` from `react-native-reanimated` (imperative scroll on animated ref)

- [ ] **Step 3: Manual test**

Drag a card to the top/bottom edge of a column — column scrolls. Drop into the newly revealed area — position correct.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/components/board/BoardColumn.tsx apps/native/src/hooks/board/useDragAutoscroll.ts apps/native/src/app/admin/boards/\[id\].tsx
git commit -m "feat(native): vertical autoscroll within column during drag"
```

### Task 11.5: Horizontal autoscroll across columns

**Files:**
- Modify: `apps/native/src/components/board/BoardPager.tsx`
- Modify: `apps/native/src/hooks/board/useDragAutoscroll.ts`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: Expose BoardPager's ScrollView as animated ref**

Use `useAnimatedRef` and expose via `useImperativeHandle` or simply accept `pagerRef` as prop and expect an animated ref.

- [ ] **Step 2: Horizontal autoscroll logic**

In `useDragAutoscroll`:
- When pointer is within 40pt of left screen edge → scroll pager left by one column with snap (`scrollTo(pagerRef, (activeIndex - 1) * colWidth, 0, true)`)
- Within 40pt of right → scroll right by one column
- Throttle: only trigger once per 600ms to avoid runaway. Fire `haptics.impact("light")` on each cross.
- Update `activeColumnIndex` state via `runOnJS`.

- [ ] **Step 3: Manual test**

Drag a card to the right edge of the screen → pager snaps to the next column. Continue dragging → drop in that new column. Drag to left edge works the same.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(native): horizontal autoscroll across columns during drag"
```

---

## Phase 12 — Polish

### Task 12.1: Filter chip row

**Files:**
- Create: `apps/native/src/components/board/FilterChips.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: Chips**

Sticky below header: `Mine`, `Priority ▾`, `Due soon`, `Unassigned`. Local state `filters: TaskListFilters` passed to `useBoardTasks(boardId, filters)`.

- `Mine` → set `assigneeId` to current user's id from `authClient.useSession()`
- `Priority` → opens `PriorityPickerSheet` with special behavior: select priority to filter, select "Clear" to remove
- `Due soon` → client-side post-filter (tasks with `dueDate` within 7 days) — pass all via SWR, filter in a `useMemo` in the screen
- `Unassigned` → client-side filter (tasks with `assignees.length === 0`)

- [ ] **Step 2: Commit**

```bash
git add apps/native/src/components/board/FilterChips.tsx apps/native/src/app/admin/boards/\[id\].tsx
git commit -m "feat(native): board filter chips"
```

### Task 12.2: Empty states + skeleton loaders

**Files:**
- Modify: `apps/native/src/components/board/BoardColumn.tsx`
- Modify: `apps/native/src/app/admin/boards/index.tsx`
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: Empty column**

When `columnTasks.length === 0`, render an inline illustration + "Drop tasks here" text above the add button.

- [ ] **Step 2: Skeleton cards while loading**

Create `apps/native/src/components/board/TaskCardSkeleton.tsx` — shimmering rect with Reanimated. Render 3 per column while `isLoading && !tasks`.

- [ ] **Step 3: Empty boards list**

Already covered in 2.4, but polish: add a subdued icon and "Create a board" CTA that opens a minimal create-board sheet.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(native): empty states + skeleton loaders"
```

### Task 12.3: Haptics + accessibility polish

**Files:**
- Modify: `apps/native/src/lib/haptics.ts`
- Modify: task/column components

- [ ] **Step 1: Wire haptics**

- Pickup drag: `impact("medium")`
- Column cross during drag: `impact("light")`
- Drop commit: `notification("success")`
- Delete confirm: `notification("warning")`
- Checkbox toggle: `selection()`

`haptics.ts` wraps `expo-haptics` and is safe to no-op when module unavailable (web build).

- [ ] **Step 2: Accessibility labels**

Every `Pressable`: `accessibilityLabel`, `accessibilityRole="button"`. Cards: `accessibilityLabel={title + ", " + column.name + ", priority " + priority}`. Drag handle: make the whole card draggable — long-press gesture is discoverable via iOS VoiceOver "Actions" rotor (document this behavior in a code comment inside `TaskCard.tsx` — this is the one non-obvious-enough-for-a-comment case).

- [ ] **Step 3: Dark mode sanity**

Toggle system dark mode — every screen still legible (theme already handles it, just verify).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(native): haptics + accessibility labels across board UI"
```

### Task 12.4: Pull-to-refresh on board detail

**Files:**
- Modify: `apps/native/src/app/admin/boards/[id].tsx`

- [ ] **Step 1: Wrap pager or add a pull-to-refresh shell**

`ScrollView`-based pager can't natively host a `RefreshControl` because its scroll is horizontal. Solution: put a small "Updated Xs ago • Pull to refresh" row below the filter chips; tap to revalidate via `mutate`. For gesture-based refresh on a horizontal board, the standard is an explicit refresh button rather than a swipe gesture.

- [ ] **Step 2: Also revalidate on focus**

Use `useFocusEffect` to call `mutate` on both `useBoard(boardId)` and `useBoardTasks(boardId, filters)` when the screen regains focus.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/app/admin/boards/\[id\].tsx
git commit -m "feat(native): focus-based revalidation + manual refresh button"
```

---

## Phase 13 — Verification

### Task 13.1: Full typecheck + lint + test

- [ ] **Step 1:** `pnpm typecheck` — PASS
- [ ] **Step 2:** `pnpm lint` — PASS
- [ ] **Step 3:** `pnpm test` — PASS (shared board-dnd tests + api-client admin-board tests + any API routes added)
- [ ] **Step 4:** `pnpm --filter @dragons/api coverage` — thresholds maintained (any new server code needs tests)
- [ ] **Step 5:** `pnpm check:ai-slop` — PASS (all new i18n + markdown clean)

### Task 13.2: Manual QA script

Run through on a physical iOS device AND an Android device (or emulators):

- [ ] Log in as admin → profile → Boards → open a board
- [ ] Horizontal snap scroll between columns
- [ ] Tap pill → jumps to column
- [ ] Tap card → sheet opens; edit title/desc; change priority; set due; add assignee; toggle checklist; add comment
- [ ] Dismiss sheet via swipe down
- [ ] FAB → quick create in active column
- [ ] "+ Add card" in a column → composer preselects that column
- [ ] Long-press card → context menu → Move to… → pick column + top/bottom → card moves
- [ ] Long-press card → drag to next column → autoscroll horizontally → drop
- [ ] Drag within column → autoscroll vertically → drop
- [ ] Drop on empty column → card lands at bottom
- [ ] Filter: Mine / Priority / Due soon / Unassigned — each filters correctly
- [ ] Pull-to-refresh (or manual refresh button) → revalidates
- [ ] Background app 5min → reopen → board still valid, revalidates on focus
- [ ] Log in as non-admin → profile has no Admin entry; direct-navigate `/admin/boards` → redirects home
- [ ] Run all of above with system Dark Mode toggled

### Task 13.3: Final commit / PR

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```
Expected: clean or only the plan doc left.

- [ ] **Step 2: Open PR**

Title: `feat(native): kanban board with drag+move UX parity to web`. Body: list phases completed, screenshots of board list / board detail / task sheet / drag in progress.

---

## Notes for the implementing engineer

- **You do not need to port web drag UX literally.** dnd-kit is desktop-first; this plan uses a mobile-native pattern (long-press + floating ghost + paged columns + "Move to…" sheet fallback). The algorithm under the hood (`applyTaskMove`, `computeDropTarget`) is shared via `@dragons/shared` so the two UIs stay in sync at the data layer.
- **Reorder math is authoritative only on the server.** The client runs `applyTaskMove` for optimism; the server runs its own transaction-safe version and returns truth. SWR's revalidation reconciles after every mutation — trust it.
- **The "Move to…" sheet is load-bearing.** It ships before drag for a reason: it works on tiny phones, works under VoiceOver, works one-handed, and works if the drag gesture regresses on some Android OEM. Drag is polish, not primary.
- **Don't add a WebSocket.** The web version doesn't have one; matching the web revalidation pattern keeps the two UIs consistent and avoids a large infra decision on the mobile-only milestone.
- **One engineer should be able to execute Phases 0–4 in a first session** and have a usable (read-only + simple edit) board. Drag (Phase 11) is the last thing to enable — everything before it must work without drag.
