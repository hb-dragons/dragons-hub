import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View, ActivityIndicator, useWindowDimensions } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
// `useHeaderHeight` has no equivalent on expo-router's own surface yet, so it
// stays on the forked React Navigation re-export the SDK 56 codemod points at.
import { useHeaderHeight } from "expo-router/react-navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bottomSearchToolbarClearance } from "@/lib/ui/search-toolbar";
import { searchFieldOptions } from "@/lib/nav/search-bar";
import { useBoard } from "@/hooks/board/useBoard";
import { useBoardTasks } from "@/hooks/board/useBoardTasks";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useDeleteTaskWithUndo } from "@/hooks/board/useDeleteTaskWithUndo";
import { useBoardDrag } from "@/hooks/board/useBoardDrag";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardPager, type BoardPagerHandle } from "@/components/board/BoardPager";
import { TaskCardDragGhost } from "@/components/board/TaskCardDragGhost";
import { FilterChips, type BoardFilters } from "@/components/board/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { HeaderActions } from "@/components/nav/HeaderActions";
import { useBoardFilterPersistence } from "@/hooks/board/useBoardFilterPersistence";
import { sortedColumns } from "@/lib/board/columns";
import type { TaskActionKey } from "@/lib/board/task-actions";
import {
  BOARD_OVERFLOW_ACTIONS,
  BOARD_TOOLBAR_ACTIONS,
  type BoardActionKey,
} from "@/lib/board/board-actions";
import {
  openAddColumnSheet,
  openAssigneeFilterSheet,
  openBoardSettingsSheet,
  openColumnSettingsSheet,
  openDuePickerSheet,
  openMoveToSheet,
  openPriorityPickerSheet,
  openQuickCreateSheet,
  openSortSheet,
  openTaskDetailSheet,
} from "@/lib/nav/board-sheets";
import { boardTaskComparator } from "@dragons/shared";
import { useColumnDrag } from "@/hooks/board/useColumnDrag";
import { TaskCardSkeleton } from "@/components/board/TaskCardSkeleton";
import type { BoardColumnHandle } from "@/components/board/BoardColumn";
import type { BoardColumnData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { useDebouncedCallback } from "@/hooks/useDebounce";
import { i18n } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import type { TaskCardData, TaskPriority } from "@dragons/shared";
import type { TaskListQuery } from "@dragons/api-client";

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BoardDetailScreen() {
  return <BoardDetailBody />;
}

function BoardDetailBody() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const boardId = Number(id);
  const { data: board, isLoading: boardLoading, mutate: revalidateBoard } = useBoard(boardId);

  const persistence = useBoardFilterPersistence(boardId);
  const filters = persistence.filters as BoardFilters;
  const setFilters = persistence.setFilters as (
    next: BoardFilters | ((prev: BoardFilters) => BoardFilters),
  ) => void;
  const sort = persistence.sort;
  const setSort = persistence.setSort;
  // The header search bar is a *native* (uncontrolled) field, so there is no
  // per-keystroke state to keep in sync — pushing every character into screen
  // state re-rendered the whole pager, and with it every TaskCard. Commit the
  // query once typing pauses instead.
  const [searchQuery, setSearchQuery] = useState("");
  const commitSearchQuery = useDebouncedCallback(setSearchQuery);

  const currentUserId = authClient.useSession().data?.user?.id ?? null;

  const apiFilters = useMemo<TaskListQuery | undefined>(() => {
    const f: TaskListQuery = {};
    if (filters.priority) f.priority = filters.priority;
    return Object.keys(f).length ? f : undefined;
  }, [filters.priority]);

  const {
    data: rawTasks,
    isLoading: tasksLoading,
    mutate: revalidateTasks,
  } = useBoardTasks(boardId, apiFilters);

  const [refreshing, setRefreshing] = useState(false);
  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([revalidateBoard(), revalidateTasks()]);
    } finally {
      setRefreshing(false);
    }
  }, [revalidateBoard, revalidateTasks]);

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

  const { colors, spacing } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  // The native stack lays this screen out edge-to-edge: the iOS 26 header and
  // bottom search toolbar overlay the content without extending its safe-area
  // insets (measured: safe area reports status bar + home indicator only).
  // headerHeight is the real native-measured header height, updated via the
  // header-height-change event.
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const contentBottomInset =
    insets.bottom +
    bottomSearchToolbarClearance({
      os: Platform.OS,
      isPad: (Platform as { isPad?: boolean }).isPad ?? false,
    });
  const [activeIndex, setActiveIndex] = useState(0);
  const lastPriorityRef = useRef<TaskPriority>("normal");
  const pagerRef = useRef<BoardPagerHandle | null>(null);
  const taskMutations = useTaskMutations(boardId);

  // Per-column ScrollView handles for imperatively scrolling (autoscroll).
  const columnRefsMap = useRef<Map<number, BoardColumnHandle>>(new Map());

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const columns = useMemo(() => sortedColumns(board), [board]);

  const columnDrag = useColumnDrag(boardId, columns);

  // ---------------------------------------------------------------------------
  // Focus-based revalidation
  // ---------------------------------------------------------------------------

  useFocusEffect(
    useCallback(() => {
      void revalidateBoard();
      void revalidateTasks();
    }, [revalidateBoard, revalidateTasks]),
  );

  // ---------------------------------------------------------------------------
  // Drag state machine
  // ---------------------------------------------------------------------------

  const {
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
    dropTargetColumnId,
    recentlyDroppedTaskId,
  } = useBoardDrag({
    boardId,
    columns,
    tasks,
    windowWidth,
    pagerRef,
    columnHandlesRef: columnRefsMap,
  });

  // ---------------------------------------------------------------------------
  // Task and column interactions
  // ---------------------------------------------------------------------------

  // BoardPager is memoised; inline arrow props would defeat that on every
  // screen re-render (search, filters, refresh flag, drag frames).
  const onTaskPress = useCallback(
    (task: TaskCardData) => {
      openTaskDetailSheet(boardId, task.id);
    },
    [boardId],
  );

  const onRefreshPager = useCallback(() => {
    void onPullRefresh();
  }, [onPullRefresh]);

  const onPillPress = useCallback((i: number) => {
    setActiveIndex(i);
    pagerRef.current?.scrollToIndex(i, true);
  }, []);

  const handleTaskDelete = useDeleteTaskWithUndo(boardId);

  /**
   * What the card's context menu picked (#220).
   *
   * The menu itself is declared on the card — this only runs the action, and
   * every branch is the same call the matching control on the task sheet
   * makes. No haptic for opening the menu: UIKit plays its own, and revealing
   * a menu is none of the three HIG feedback categories (#218).
   */
  const handleTaskAction = useCallback(
    (task: TaskCardData, action: TaskActionKey) => {
      // A switch rather than an if/else chain ending in `else`: a fifth action
      // added to `TASK_ACTIONS` would have fallen into the delete branch.
      switch (action) {
        case "move":
          openMoveToSheet(boardId, task.id);
          break;
        case "priority":
          openPriorityPickerSheet(task.priority, (p) => {
            // Mutation hook surfaces failures via toast; swallow rejection.
            taskMutations.setPriority(task.id, p).catch(() => {});
          });
          break;
        case "due":
          openDuePickerSheet(task.dueDate, (iso) => {
            taskMutations.setDueDate(task.id, iso).catch(() => {});
          });
          break;
        case "delete":
          handleTaskDelete(task);
          break;
      }
    },
    [boardId, taskMutations, handleTaskDelete],
  );

  const onPressPriorityChip = useCallback(() => {
    const starting = filters.priority ?? lastPriorityRef.current;
    openPriorityPickerSheet(starting, (p) => {
      lastPriorityRef.current = p;
      setFilters((f) => ({ ...f, priority: p }));
    });
  }, [filters.priority]);

  const onClearPriorityFilter = useCallback(() => {
    setFilters((f) => ({ ...f, priority: null }));
  }, []);

  const onPressAssignees = useCallback(() => {
    openAssigneeFilterSheet(filters.assigneeIds, (next) => {
      setFilters((f) => ({ ...f, assigneeIds: next }));
    });
  }, [filters.assigneeIds]);

  const onClearAssignees = useCallback(() => {
    setFilters((f) => ({ ...f, assigneeIds: new Set<string>() }));
  }, []);

  const openQuickCreate = useCallback(
    (columnId: number) => {
      openQuickCreateSheet(boardId, columnId);
    },
    [boardId],
  );

  const onColumnLongPress = useCallback(
    (col: BoardColumnData) => {
      openColumnSettingsSheet(boardId, col.id);
    },
    [boardId],
  );

  const onAddColumnPress = useCallback(() => {
    openAddColumnSheet(boardId);
  }, [boardId]);

  /**
   * What the header toolbar picked (#224).
   *
   * Same shape as `handleTaskAction`: a switch over the vocabulary's keys, so a
   * fifth entry in `BOARD_ACTIONS` is a compile error here rather than a button
   * that silently does nothing. Creating a task lands in the column the pager
   * is showing — the toolbar has no column of its own, and the visible one is
   * the one the user is looking at.
   */
  const handleBoardAction = useCallback(
    (action: BoardActionKey) => {
      switch (action) {
        case "create": {
          const active = columns[activeIndex] ?? columns[0];
          if (active) openQuickCreateSheet(boardId, active.id);
          break;
        }
        case "sort":
          openSortSheet(sort, setSort);
          break;
        case "addColumn":
          openAddColumnSheet(boardId);
          break;
        case "settings":
          openBoardSettingsSheet(boardId);
          break;
      }
    },
    [activeIndex, boardId, columns, sort, setSort],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // NOTE: no early returns before Stack.Screen and HeaderActions — the header
  // options (title, search bar, bar button items) must be attached from the
  // very first render. Attaching them only once board data arrives
  // re-configures the native header mid push-transition, which flashes a
  // header overlay.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: board?.name ?? "",
          headerSearchBarOptions: searchFieldOptions({
            placeholder: i18n.t("board.search.placeholder"),
            // The iOS 26 bottom toolbar; `bottomSearchToolbarClearance` above
            // is what keeps the columns clear of it.
            placement: "integrated",
            onChangeText: commitSearchQuery,
            // Clearing is a deliberate action, not a keystroke — apply at once.
            onCancel: () => setSearchQuery(""),
          }),
        }}
      />
      {/* The header's own buttons (#224). Declared beside `Stack.Screen` and
          ahead of every state branch below, for the same reason it is: bar
          items compose into the same native header options, and a header
          reconfigured mid push-transition flashes. */}
      <HeaderActions
        items={BOARD_TOOLBAR_ACTIONS}
        overflow={BOARD_OVERFLOW_ACTIONS}
        onAction={handleBoardAction}
      />
      {/* Pills/chips start below the header; the columns end above
          the bottom search toolbar. The drag ghost stays OUTSIDE this
          container: it is positioned in window-absolute coordinates, which
          only line up with the unpadded root. */}
      <View style={{ flex: 1, paddingTop: headerHeight, paddingBottom: contentBottomInset }}>
        {/* Also gate on persistence.hydrating: without it, the board renders
            with default (empty) filters for a frame or two before the
            persisted filters land, which briefly shows the wrong task set. */}
        {(boardLoading && !board) || persistence.hydrating ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.foreground} />
          </View>
        ) : !board ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
            <Text style={{ color: colors.foreground }}>Not found</Text>
          </View>
        ) : (
        <View style={{ flex: 1 }}>
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
            onReorderCommit={() => { void columnDrag.commit(); }}
            onReorderCancel={columnDrag.cancel}
          />
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
                    flexDirection: "row",
                    gap: spacing.xs,
                    alignItems: "center",
                  }}
                >
                  <Icon name="add" size={15} color={colors.primaryForeground} />
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
                onActiveColumnChange={setActiveIndex}
                onTaskPress={onTaskPress}
                onTaskAction={handleTaskAction}
                onTaskDelete={handleTaskDelete}
                onColumnLongPress={onColumnLongPress}
                onAddTask={openQuickCreate}
                draggingTaskId={dragState.active ? dragState.task.id : null}
                dropTargetColumnId={dropTargetColumnId}
                recentlyDroppedTaskId={recentlyDroppedTaskId}
                onTaskDrag={onTaskDrag}
                onTaskMeasure={onTaskMeasure}
                onColumnScrollUpdate={onColumnScrollUpdate}
                onColumnContentSizeChange={onColumnContentSizeChange}
                onColumnHeaderHeight={onColumnHeaderHeight}
                onPagerScrollUpdate={onPagerScrollUpdate}
                onPagerLayout={onPagerLayout}
                columnRefs={columnRefsMap}
                refreshing={refreshing}
                onRefresh={onRefreshPager}
                scrollEnabled={!columnDrag.reordering}
              />
            )}
          </View>
        </View>
        )}
      </View>

      {/* Drag ghost — rendered above everything, pointer-events disabled */}
      {dragState.active ? (
        <TaskCardDragGhost
          task={dragState.task}
          pointerX={pointerX}
          pointerY={pointerY}
          cardWidth={dragState.cardWidth}
          cardHeight={dragState.cardHeight}
        />
      ) : null}
    </View>
  );
}
