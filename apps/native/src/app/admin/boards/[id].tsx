import { useCallback, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, Platform, Pressable, Text, View, ActivityIndicator, useWindowDimensions } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
// `useHeaderHeight` has no equivalent on expo-router's own surface yet, so it
// stays on the forked React Navigation re-export the SDK 56 codemod points at.
import { useHeaderHeight } from "expo-router/react-navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bottomSearchToolbarClearance } from "@/lib/ui/search-toolbar";
import { useBoard } from "@/hooks/board/useBoard";
import { useBoardTasks } from "@/hooks/board/useBoardTasks";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useBoardDrag } from "@/hooks/board/useBoardDrag";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardPager, type BoardPagerHandle } from "@/components/board/BoardPager";
import { TaskContextMenu, type TaskContextMenuHandle, type TaskContextAction } from "@/components/board/TaskContextMenu";
import { TaskCardDragGhost } from "@/components/board/TaskCardDragGhost";
import { FilterChips, type BoardFilters } from "@/components/board/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { useBoardFilterPersistence } from "@/hooks/board/useBoardFilterPersistence";
import { sortedColumns } from "@/lib/board/columns";
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
import { haptics } from "@/lib/haptics";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/hooks/useToast";
import { adminBoardApi } from "@/lib/api";
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
  const contextMenuRef = useRef<TaskContextMenuHandle | null>(null);
  const taskMutations = useTaskMutations(boardId);
  const toast = useToast();

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
  // Context menu / other interactions (unchanged)
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

  const handleTaskDelete = useCallback(
    (task: TaskCardData) => {
      haptics.warning();
      const snapshotTitle = task.title;
      const snapshotColumnId = task.columnId;
      const snapshotDescription = task.description ?? null;
      const snapshotPriority = task.priority;
      const snapshotDueDate = task.dueDate;

      taskMutations
        .deleteTask(task.id)
        .then(() => {
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
      })
      .catch(() => {
        // Delete failed: useTaskMutations.deleteTask already shows an error toast.
      });
    },
    [boardId, taskMutations, toast, revalidateTasks],
  );

  const handleTaskLongPress = useCallback(
    (task: TaskCardData) => {
      const runAction = (action: TaskContextAction) => {
        if (action === "move") {
          openMoveToSheet(boardId, task.id);
        } else if (action === "priority") {
          openPriorityPickerSheet(task.priority, (p) => {
            // Mutation hook surfaces failures via toast; swallow rejection.
            taskMutations.setPriority(task.id, p).catch(() => {});
          });
        } else if (action === "due") {
          openDuePickerSheet(task.dueDate, (iso) => {
            taskMutations.setDueDate(task.id, iso).catch(() => {});
          });
        } else if (action === "delete") {
          handleTaskDelete(task);
        }
      };

      // No haptic on the long press itself: revealing a menu is none of the
      // three HIG categories (#218). The interim ActionSheetIOS path therefore
      // goes silent; the first-party context menu that replaces it (#220)
      // brings UIKit's own menu haptic, which is the feedback this imitated.
      if (Platform.OS === "ios") {
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

  const openQuickCreateFab = useCallback(() => {
    const active = columns[activeIndex] ?? columns[0];
    if (!active) return;
    openQuickCreateSheet(boardId, active.id);
  }, [activeIndex, boardId, columns]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // NOTE: no early returns before Stack.Screen — the header options (title,
  // search bar, right buttons) must be attached from the very first render.
  // Attaching them only once board data arrives re-configures the native
  // header mid push-transition, which flashes a header overlay.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: board?.name ?? "",
          headerSearchBarOptions: {
            placeholder: i18n.t("board.search.placeholder"),
            hideWhenScrolling: false,
            // Explicit "integrated" (iOS 26 bottom toolbar). With the default
            // "automatic", UIKit reserves a stacked under-title slot during the
            // push transition and draws its bar background over the column
            // pills until the search bar settles into the bottom toolbar —
            // visible as a header overlay that flashes and disappears.
            placement: "integrated",
            onChangeText: (e) => commitSearchQuery(e.nativeEvent.text),
            // Clearing is a deliberate action, not a keystroke — apply at once.
            onCancelButtonPress: () => setSearchQuery(""),
          },
          headerRight: () => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              }}
            >
              <Pressable
                onPress={() => openSortSheet(sort, setSort)}
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
                <Icon
                  name="sort"
                  size={20}
                  color={sort === "position" ? colors.foreground : colors.primary}
                />
              </Pressable>
              <Pressable
                onPress={() => openBoardSettingsSheet(boardId)}
                accessibilityRole="button"
                accessibilityLabel={i18n.t("admin.boards.settingsTitle")}
                hitSlop={12}
                style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.sm }}
              >
                <Icon name="more" size={20} color={colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />
      {/* Pills/chips start below the header; columns and the FAB end above
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
                onTaskLongPress={handleTaskLongPress}
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
          <Pressable
            onPress={openQuickCreateFab}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("board.quickCreate.fab")}
            style={{
              position: "absolute",
              right: spacing.lg,
              bottom: spacing.lg,
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 6,
              elevation: 5,
            }}
          >
            <Icon name="add" size={28} color={colors.primaryForeground} />
          </Pressable>
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

      <TaskContextMenu ref={contextMenuRef} />
    </View>
  );
}
