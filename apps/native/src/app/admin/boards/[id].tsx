import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, Pressable, Text, View, ActivityIndicator, useWindowDimensions } from "react-native";
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
import { PriorityPickerSheet, type PriorityPickerHandle } from "@/components/board/PriorityPickerSheet";
import { DuePickerSheet, type DuePickerHandle } from "@/components/board/DuePickerSheet";
import { QuickCreateSheet, type QuickCreateSheetHandle } from "@/components/board/QuickCreateSheet";
import { TaskCardDragGhost } from "@/components/board/TaskCardDragGhost";
import { FilterChips, type BoardFilters } from "@/components/board/FilterChips";
import { TaskCardSkeleton } from "@/components/board/TaskCardSkeleton";
import type { BoardColumnHandle } from "@/components/board/BoardColumn";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import { authClient } from "@/lib/auth-client";
import type { TaskCardData } from "@dragons/shared";
import type { TaskListFilters } from "@dragons/api-client";

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const boardId = Number(id);
  const { data: board, isLoading: boardLoading, mutate: revalidateBoard } = useBoard(boardId);

  const [filters, setFilters] = useState<BoardFilters>({
    mine: false,
    priority: null,
    dueSoon: false,
    unassigned: false,
  });

  const currentUserId = authClient.useSession().data?.user?.id ?? null;

  const apiFilters = useMemo<TaskListFilters | undefined>(() => {
    const f: TaskListFilters = {};
    if (filters.priority) f.priority = filters.priority;
    return Object.keys(f).length ? f : undefined;
  }, [filters.priority]);

  const {
    data: rawTasks,
    isLoading: tasksLoading,
    isValidating: validatingTasks,
    mutate: revalidateTasks,
  } = useBoardTasks(boardId, apiFilters);

  const tasks = useMemo(() => {
    if (!rawTasks) return rawTasks;
    return rawTasks.filter((t) => {
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
  }, [rawTasks, filters, currentUserId]);

  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const pagerRef = useRef<BoardPagerHandle | null>(null);
  const taskSheetRef = useRef<TaskDetailSheetHandle | null>(null);
  const contextMenuRef = useRef<TaskContextMenuHandle | null>(null);
  const moveToSheetRef = useRef<MoveToSheetHandle | null>(null);
  const priorityPickerRef = useRef<PriorityPickerHandle | null>(null);
  const duePickerRef = useRef<DuePickerHandle | null>(null);
  const quickCreateRef = useRef<QuickCreateSheetHandle | null>(null);
  const taskMutations = useTaskMutations(boardId);
  const moveTask = useMoveTask(boardId);

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
            priorityPickerRef.current?.open(task.priority, (p) => {
              void taskMutations.setPriority(task.id, p);
            });
          } else if (action === "due") {
            duePickerRef.current?.open(task.dueDate, (iso) => {
              void taskMutations.setDueDate(task.id, iso);
            });
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
        },
      });
    },
    [columns, countsByColumn, moveTask, taskMutations],
  );

  const onPressPriorityChip = useCallback(() => {
    if (filters.priority != null) {
      setFilters((f) => ({ ...f, priority: null }));
      return;
    }
    priorityPickerRef.current?.open("normal", (p) => {
      setFilters((f) => ({ ...f, priority: p }));
    });
  }, [filters.priority]);

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
      <Stack.Screen options={{ title: board.name }} />
      <BoardHeader
        columns={columns}
        tasks={rawTasks ?? []}
        activeColumnIndex={activeIndex}
        onPillPress={onPillPress}
      />
      <FilterChips
        filters={filters}
        onToggleMine={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
        onPressPriority={onPressPriorityChip}
        onToggleDueSoon={() => setFilters((f) => ({ ...f, dueSoon: !f.dueSoon }))}
        onToggleUnassigned={() => setFilters((f) => ({ ...f, unassigned: !f.unassigned }))}
      />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
        <Pressable
          onPress={() => { void revalidateTasks(); void revalidateBoard(); }}
          accessibilityRole="button"
          accessibilityLabel={i18n.t("board.refresh")}
          style={{ flexDirection: "row", gap: spacing.xs, alignItems: "center", padding: spacing.xs }}
        >
          {validatingTasks ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : null}
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {i18n.t("board.refresh")}
          </Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        {tasksLoading && !rawTasks ? (
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
      <PriorityPickerSheet ref={priorityPickerRef} />
      <DuePickerSheet ref={duePickerRef} />
      <QuickCreateSheet ref={quickCreateRef} />
    </View>
  );
}
