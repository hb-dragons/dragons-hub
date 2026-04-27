import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Pressable, Text, View, ActivityIndicator, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBoard } from "@/hooks/board/useBoard";
import { useBoardTasks } from "@/hooks/board/useBoardTasks";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useMoveTask } from "@/hooks/board/useMoveTask";
import { useBoardDrag } from "@/hooks/board/useBoardDrag";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardPager, type BoardPagerHandle } from "@/components/board/BoardPager";
import { TaskDetailSheet, type TaskDetailSheetHandle } from "@/components/board/TaskDetailSheet";
import { TaskContextMenu, type TaskContextMenuHandle } from "@/components/board/TaskContextMenu";
import { MoveToSheet, type MoveToSheetHandle } from "@/components/board/MoveToSheet";
import { useBoardPickers } from "@/components/board/BoardPickersProvider";
import { QuickCreateSheet, type QuickCreateSheetHandle } from "@/components/board/QuickCreateSheet";
import { TaskCardDragGhost } from "@/components/board/TaskCardDragGhost";
import { FilterChips, type BoardFilters } from "@/components/board/FilterChips";
import { BoardSearchInput } from "@/components/board/BoardSearchInput";
import {
  AssigneeFilterSheet,
  type AssigneeFilterSheetHandle,
} from "@/components/board/AssigneeFilterSheet";
import { TaskCardSkeleton } from "@/components/board/TaskCardSkeleton";
import { BoardSettingsSheet, type BoardSettingsSheetHandle } from "@/components/board/BoardSettingsSheet";
import { ColumnSettingsSheet, type ColumnSettingsSheetHandle } from "@/components/board/ColumnSettingsSheet";
import { AddColumnSheet, type AddColumnSheetHandle } from "@/components/board/AddColumnSheet";
import type { BoardColumnHandle } from "@/components/board/BoardColumn";
import type { BoardColumnData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/hooks/useToast";
import { adminBoardApi } from "@/lib/api";
import type { TaskCardData, TaskPriority } from "@dragons/shared";
import type { TaskListFilters } from "@dragons/api-client";

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

  const [filters, setFilters] = useState<BoardFilters>({
    mine: false,
    priority: null,
    dueSoon: false,
    unassigned: false,
    assigneeIds: new Set<string>(),
  });
  const [searchQuery, setSearchQuery] = useState("");

  const currentUserId = authClient.useSession().data?.user?.id ?? null;

  const apiFilters = useMemo<TaskListFilters | undefined>(() => {
    const f: TaskListFilters = {};
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
      if (filters.assigneeIds.size > 0) {
        if (!t.assignees.some((a) => filters.assigneeIds.has(a.userId))) return false;
      }
      return true;
    });
  }, [rawTasks, filters, currentUserId, searchQuery]);

  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const pickers = useBoardPickers();
  const lastPriorityRef = useRef<TaskPriority>("normal");
  const pagerRef = useRef<BoardPagerHandle | null>(null);
  const taskSheetRef = useRef<TaskDetailSheetHandle | null>(null);
  const contextMenuRef = useRef<TaskContextMenuHandle | null>(null);
  const moveToSheetRef = useRef<MoveToSheetHandle | null>(null);
  const quickCreateRef = useRef<QuickCreateSheetHandle | null>(null);
  const settingsSheetRef = useRef<BoardSettingsSheetHandle | null>(null);
  const columnSettingsRef = useRef<ColumnSettingsSheetHandle | null>(null);
  const addColumnRef = useRef<AddColumnSheetHandle | null>(null);
  const assigneeFilterRef = useRef<AssigneeFilterSheetHandle | null>(null);
  const taskMutations = useTaskMutations(boardId);
  const moveTask = useMoveTask(boardId);
  const toast = useToast();

  // Per-column ScrollView handles for imperatively scrolling (autoscroll).
  const columnRefsMap = useRef<Map<number, BoardColumnHandle>>(new Map());

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const columns = useMemo(
    () => (board ? [...board.columns].sort((a, b) => a.position - b.position) : []),
    [board],
  );

  const countsByColumn = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of tasks ?? []) m.set(t.columnId, (m.get(t.columnId) ?? 0) + 1);
    return m;
  }, [tasks]);

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

  const onPillPress = useCallback((i: number) => {
    setActiveIndex(i);
    pagerRef.current?.scrollToIndex(i, true);
  }, []);

  const handleTaskLongPress = useCallback(
    (task: TaskCardData) => {
      contextMenuRef.current?.open({
        task,
        onAction: (action) => {
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
              void taskMutations.setPriority(task.id, p);
            });
          } else if (action === "due") {
            pickers.openDue(task.dueDate, (iso) => {
              void taskMutations.setDueDate(task.id, iso);
            });
          } else if (action === "delete") {
            haptics.warning();
            const snapshotTitle = task.title;
            const snapshotColumnId = task.columnId;
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
        },
      });
    },
    [columns, countsByColumn, moveTask, taskMutations, pickers],
  );

  const onPressPriorityChip = useCallback(() => {
    const starting = filters.priority ?? lastPriorityRef.current;
    pickers.openPriority(starting, (p) => {
      lastPriorityRef.current = p;
      setFilters((f) => ({ ...f, priority: p }));
    });
  }, [filters.priority, pickers]);

  const onClearPriorityFilter = useCallback(() => {
    setFilters((f) => ({ ...f, priority: null }));
  }, []);

  const onPressAssignees = useCallback(() => {
    assigneeFilterRef.current?.open(filters.assigneeIds, (next) => {
      setFilters((f) => ({ ...f, assigneeIds: next }));
    });
  }, [filters.assigneeIds]);

  const onClearAssignees = useCallback(() => {
    setFilters((f) => ({ ...f, assigneeIds: new Set<string>() }));
  }, []);

  const openQuickCreate = useCallback(
    (columnId: number) => {
      quickCreateRef.current?.open({
        boardId,
        columns,
        initialColumnId: columnId,
      });
    },
    [boardId, columns],
  );

  const onColumnLongPress = useCallback(
    (col: BoardColumnData) => {
      columnSettingsRef.current?.open({ boardId, column: col });
    },
    [boardId],
  );

  const onAddColumnPress = useCallback(() => {
    addColumnRef.current?.open({ boardId });
  }, [boardId]);

  const openQuickCreateFab = useCallback(() => {
    const active = columns[activeIndex] ?? columns[0];
    if (!active) return;
    quickCreateRef.current?.open({
      boardId,
      columns,
      initialColumnId: active.id,
    });
  }, [activeIndex, boardId, columns]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (boardLoading && !board) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }
  if (!board) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
        <Text style={{ color: colors.foreground }}>Not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
      <BoardHeader
        columns={columns}
        tasks={rawTasks ?? []}
        activeColumnIndex={activeIndex}
        onPillPress={onPillPress}
        onPillLongPress={onColumnLongPress}
        onAddColumnPress={onAddColumnPress}
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
      <Pressable
        onPress={openQuickCreateFab}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("board.quickCreate.fab")}
        style={{
          position: "absolute",
          right: spacing.lg,
          bottom: insets.bottom + spacing.lg,
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
        <Text style={{ color: colors.primaryForeground, fontSize: 28, fontWeight: "700", marginTop: -2 }}>
          +
        </Text>
      </Pressable>

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

      <TaskDetailSheet ref={taskSheetRef} boardId={boardId} />
      <TaskContextMenu ref={contextMenuRef} />
      <MoveToSheet ref={moveToSheetRef} />
      <QuickCreateSheet ref={quickCreateRef} />
      <BoardSettingsSheet ref={settingsSheetRef} />
      <ColumnSettingsSheet ref={columnSettingsRef} />
      <AddColumnSheet ref={addColumnRef} />
      <AssigneeFilterSheet ref={assigneeFilterRef} />
    </View>
  );
}
