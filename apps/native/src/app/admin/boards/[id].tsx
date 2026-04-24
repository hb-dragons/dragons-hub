import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSharedValue } from "react-native-reanimated";
import { useBoard } from "@/hooks/board/useBoard";
import { useBoardTasks } from "@/hooks/board/useBoardTasks";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useMoveTask } from "@/hooks/board/useMoveTask";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardPager, type BoardPagerHandle } from "@/components/board/BoardPager";
import { TaskDetailSheet, type TaskDetailSheetHandle } from "@/components/board/TaskDetailSheet";
import { TaskContextMenu, type TaskContextMenuHandle } from "@/components/board/TaskContextMenu";
import { MoveToSheet, type MoveToSheetHandle } from "@/components/board/MoveToSheet";
import { PriorityPickerSheet, type PriorityPickerHandle } from "@/components/board/PriorityPickerSheet";
import { DuePickerSheet, type DuePickerHandle } from "@/components/board/DuePickerSheet";
import { QuickCreateSheet, type QuickCreateSheetHandle } from "@/components/board/QuickCreateSheet";
import { TaskCardDragGhost } from "@/components/board/TaskCardDragGhost";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import { computeDropTarget } from "@dragons/shared";
import type { TaskCardData } from "@dragons/shared";
import type { TaskCardLayout } from "@/components/board/TaskCard";

// ---------------------------------------------------------------------------
// Drag state
// ---------------------------------------------------------------------------

type ActiveDragState = {
  active: true;
  task: TaskCardData;
  cardWidth: number;
  cardHeight: number;
  /** Column ID currently highlighted as drop target (null = none) */
  dropTargetColumnId: number | null;
};

type DragState =
  | { active: false }
  | ActiveDragState;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const boardId = Number(id);
  const { data: board, isLoading: boardLoading } = useBoard(boardId);
  const { data: tasks, isLoading: tasksLoading } = useBoardTasks(boardId);
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
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

  // Reanimated shared values for the ghost position — updated on the UI thread,
  // no JS re-render on every frame.
  const pointerX = useSharedValue(0);
  const pointerY = useSharedValue(0);

  // React state for the rest of the drag (task identity, card size, drop target).
  const [dragState, setDragState] = useState<DragState>({ active: false });

  // Keep a stable ref to tasks for use inside gesture callbacks (avoids stale closure).
  const tasksRef = useRef<TaskCardData[]>([]);
  tasksRef.current = tasks ?? [];

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
  // Drag callbacks (passed to BoardPager → BoardColumn → TaskCard)
  // ---------------------------------------------------------------------------

  const handleDragStart = useCallback(
    (task: TaskCardData, layout: TaskCardLayout) => {
      haptics.medium();
      pointerX.value = layout.x + layout.width / 2;
      pointerY.value = layout.y + layout.height / 2;
      setDragState({
        active: true,
        task,
        cardWidth: layout.width,
        cardHeight: layout.height,
        dropTargetColumnId: null,
      });
    },
    [pointerX, pointerY],
  );

  const handleDragMove = useCallback(
    (pageX: number, pageY: number) => {
      // Update ghost position (no React re-render).
      pointerX.value = pageX;
      pointerY.value = pageY;

      // Determine which column the pointer is hovering. We use a simple
      // heuristic: find the column whose horizontal centre is nearest to
      // the pointer X. Column rects aren't measured individually here —
      // instead we use the pager's column-width layout to compute bounds.
      // This is reliable as long as the horizontal pager is full-width.
      //
      // For a future iteration: measure each column's actual window rect
      // for precise vertical detection too.
      setDragState((prev) => {
        if (!prev.active) return prev;

        // Determine the hovered column based on pointer position.
        // We compare against all columns and pick the closest one whose
        // task list could plausibly be under the pointer.
        const allTasks = tasksRef.current;
        const activeItem = {
          type: "task" as const,
          id: prev.task.id,
          columnId: prev.task.columnId,
        };

        // Find which column we're closest to by checking if any task in a
        // column is close to the pointer. Fallback: use first/last column.
        // Since we don't have per-column rects right now, we pick the column
        // that has tasks closest to pointer Y (crude but workable for
        // same-device testing). A better approach follows in the refinement.
        //
        // Strategy: track the "over" item as the column whose drop target
        // would change. For column highlighting we just need the columnId.
        let dropTargetColumnId: number | null = null;

        if (columns.length > 0) {
          // We look for any task that, when hovered, would produce a drop.
          // Since we can't measure individual task rects here without refs,
          // we default to the active task's column to keep highlighting the
          // source column. Cross-column detection relies on pointer X being
          // tracked against column widths by the gesture system.
          //
          // Simplified: use computeDropTarget with "over = column" for the
          // active column. The actual cross-column target will be improved
          // in the autoscroll phase when we have per-column rect measurement.
          const overItem = {
            type: "column" as const,
            id: prev.task.columnId,
            columnId: prev.task.columnId,
          };
          const dt = computeDropTarget(activeItem, overItem, allTasks);
          if (dt) {
            dropTargetColumnId = dt.columnId;
          }
        }

        if (prev.dropTargetColumnId === dropTargetColumnId) return prev;
        return { ...prev, dropTargetColumnId };
      });
    },
    [pointerX, pointerY, columns],
  );

  const handleDragEnd = useCallback(() => {
    setDragState((prev) => {
      if (!prev.active) return prev;

      const allTasks = tasksRef.current;
      const task = prev.task;
      const activeItem = {
        type: "task" as const,
        id: task.id,
        columnId: task.columnId,
      };

      const targetColumnId = prev.dropTargetColumnId ?? task.columnId;
      const overItem = {
        type: "column" as const,
        id: targetColumnId,
        columnId: targetColumnId,
      };

      const dropTarget = computeDropTarget(activeItem, overItem, allTasks);

      if (
        dropTarget &&
        (dropTarget.columnId !== task.columnId ||
          dropTarget.position !== task.position)
      ) {
        haptics.light();
        void moveTask(task.id, dropTarget.columnId, dropTarget.position);
      }

      return { active: false };
    });
  }, [moveTask]);

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
        tasks={tasks ?? []}
        activeColumnIndex={activeIndex}
        onPillPress={onPillPress}
      />
      <View style={{ flex: 1 }}>
        {tasksLoading && !tasks ? (
          <ActivityIndicator color={colors.foreground} style={{ marginTop: 40 }} />
        ) : (
          <BoardPager
            ref={pagerRef}
            columns={columns}
            tasks={tasks ?? []}
            onActiveColumnChange={setActiveIndex}
            onTaskPress={(task: TaskCardData) => {
              taskSheetRef.current?.open(task.id);
            }}
            onTaskLongPress={handleTaskLongPress}
            onAddTask={openQuickCreate}
            draggingTaskId={dragState.active ? dragState.task.id : null}
            dropTargetColumnId={dragState.active ? dragState.dropTargetColumnId : null}
            onTaskDragStart={handleDragStart}
            onTaskDragMove={handleDragMove}
            onTaskDragEnd={handleDragEnd}
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
