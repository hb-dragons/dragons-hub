import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View, ActivityIndicator, useWindowDimensions } from "react-native";
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
import type { BoardColumnHandle, ColumnRect } from "@/components/board/BoardColumn";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import { computeDropTarget } from "@dragons/shared";
import type { TaskCardData } from "@dragons/shared";
import type { TaskCardLayout, TaskRect } from "@/components/board/TaskCard";

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
  // Measurement maps for drop-target detection
  // ---------------------------------------------------------------------------

  const taskRects = useRef<Map<number, TaskRect>>(new Map());
  const columnRects = useRef<Map<number, ColumnRect>>(new Map());

  // Plain JS pointer coords for the autoscroll interval to read.
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Scroll offset per column (to track current position for autoscroll).
  const columnScrollOffsets = useRef<Record<number, number>>({});

  // Per-column ScrollView handles for imperatively scrolling.
  const columnRefsMap = useRef<Map<number, BoardColumnHandle>>(new Map());

  // Throttle horizontal pager snaps.
  const lastHorizontalScrollAt = useRef<number>(0);

  // Track drag active state in a ref so the interval can read it synchronously.
  const dragActiveRef = useRef<boolean>(false);

  // Keep columns stable ref.
  const columnsRef = useRef<typeof columns>([]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const columns = useMemo(
    () => (board ? [...board.columns].sort((a, b) => a.position - b.position) : []),
    [board],
  );
  columnsRef.current = columns;

  const countsByColumn = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of tasks ?? []) m.set(t.columnId, (m.get(t.columnId) ?? 0) + 1);
    return m;
  }, [tasks]);

  // ---------------------------------------------------------------------------
  // Drop target computation using measured rects
  // ---------------------------------------------------------------------------

  const findDropTarget = useCallback(
    (pageX: number, pageY: number, draggedTask: TaskCardData) => {
      const allColumns = columnsRef.current;
      const allTasks = tasksRef.current;

      // Find which column the pointer is over.
      let overColumn: (typeof allColumns)[0] | null = null;
      for (const col of allColumns) {
        const rect = columnRects.current.get(col.id);
        if (!rect) continue;
        if (
          pageX >= rect.x &&
          pageX <= rect.x + rect.width &&
          pageY >= rect.y &&
          pageY <= rect.y + rect.height
        ) {
          overColumn = col;
          break;
        }
      }

      if (!overColumn) {
        // Fall back: use the dragged task's own column.
        overColumn = allColumns.find((c) => c.id === draggedTask.columnId) ?? null;
      }
      if (!overColumn) return null;

      const overColumnId = overColumn.id;

      // Find which task in that column the pointer is over.
      let overTask: TaskCardData | null = null;
      for (const t of allTasks) {
        if (t.columnId !== overColumnId) continue;
        if (t.id === draggedTask.id) continue;
        const rect = taskRects.current.get(t.id);
        if (!rect) continue;
        if (
          pageX >= rect.x &&
          pageX <= rect.x + rect.width &&
          pageY >= rect.y &&
          pageY <= rect.y + rect.height
        ) {
          overTask = t;
          break;
        }
      }

      const active = {
        type: "task" as const,
        id: draggedTask.id,
        columnId: draggedTask.columnId,
      };

      const over = overTask
        ? { type: "task" as const, id: overTask.id, columnId: overTask.columnId }
        : { type: "column" as const, id: overColumnId, columnId: overColumnId };

      return { dropTarget: computeDropTarget(active, over, allTasks), overColumnId };
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Drag callbacks (passed to BoardPager → BoardColumn → TaskCard)
  // ---------------------------------------------------------------------------

  const handleDragStart = useCallback(
    (task: TaskCardData, layout: TaskCardLayout) => {
      haptics.medium();
      pointerX.value = layout.x + layout.width / 2;
      pointerY.value = layout.y + layout.height / 2;
      pointerRef.current = { x: layout.x + layout.width / 2, y: layout.y + layout.height / 2 };
      dragActiveRef.current = true;
      setDragState({
        active: true,
        task,
        cardWidth: layout.width,
        cardHeight: layout.height,
        dropTargetColumnId: task.columnId,
      });
    },
    [pointerX, pointerY],
  );

  const handleDragMove = useCallback(
    (pageX: number, pageY: number) => {
      // Update ghost position (no React re-render).
      pointerX.value = pageX;
      pointerY.value = pageY;
      pointerRef.current = { x: pageX, y: pageY };

      setDragState((prev) => {
        if (!prev.active) return prev;

        const result = findDropTarget(pageX, pageY, prev.task);
        const dropTargetColumnId = result?.overColumnId ?? prev.task.columnId;

        if (prev.dropTargetColumnId === dropTargetColumnId) return prev;
        return { ...prev, dropTargetColumnId };
      });
    },
    [pointerX, pointerY, findDropTarget],
  );

  const handleDragEnd = useCallback(() => {
    dragActiveRef.current = false;
    setDragState((prev) => {
      if (!prev.active) return prev;

      const { x, y } = pointerRef.current;
      const result = findDropTarget(x, y, prev.task);
      const dropTarget = result?.dropTarget ?? null;

      if (
        dropTarget &&
        (dropTarget.columnId !== prev.task.columnId ||
          dropTarget.position !== prev.task.position)
      ) {
        haptics.light();
        void moveTask(prev.task.id, dropTarget.columnId, dropTarget.position);
      }

      return { active: false };
    });
  }, [findDropTarget, moveTask]);

  // ---------------------------------------------------------------------------
  // Autoscroll interval — runs while drag is active
  // ---------------------------------------------------------------------------

  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    if (!dragState.active) return;

    const EDGE_BAND_VERTICAL = 80; // px from top/bottom of column to trigger vertical scroll
    const SCROLL_SPEED = 8;         // px per tick (32ms → ~250 px/s)
    const HORIZONTAL_EDGE = 48;     // px from screen left/right to trigger column snap
    const HORIZONTAL_THROTTLE = 500; // ms between horizontal snaps

    const tick = setInterval(() => {
      if (!dragActiveRef.current) return;

      const { x: pageX, y: pageY } = pointerRef.current;
      const allColumns = columnsRef.current;

      // --- Vertical autoscroll ---
      // Find the column the pointer is currently over.
      let activeColumn: (typeof allColumns)[0] | null = null;
      for (const col of allColumns) {
        const rect = columnRects.current.get(col.id);
        if (!rect) continue;
        if (
          pageX >= rect.x &&
          pageX <= rect.x + rect.width &&
          pageY >= rect.y &&
          pageY <= rect.y + rect.height
        ) {
          activeColumn = col;
          break;
        }
      }

      if (activeColumn) {
        const rect = columnRects.current.get(activeColumn.id);
        const columnHandle = columnRefsMap.current.get(activeColumn.id);
        if (rect && columnHandle) {
          const currentScroll = columnScrollOffsets.current[activeColumn.id] ?? 0;
          const topEdge = rect.y + EDGE_BAND_VERTICAL;
          const bottomEdge = rect.y + rect.height - EDGE_BAND_VERTICAL;

          if (pageY < topEdge && currentScroll > 0) {
            const nextY = Math.max(0, currentScroll - SCROLL_SPEED);
            columnHandle.scrollTo(nextY);
            columnScrollOffsets.current[activeColumn.id] = nextY;
          } else if (pageY > bottomEdge) {
            const nextY = currentScroll + SCROLL_SPEED;
            columnHandle.scrollTo(nextY);
            columnScrollOffsets.current[activeColumn.id] = nextY;
          }
        }
      }

      // --- Horizontal autoscroll ---
      const now = Date.now();
      const idx = activeIndexRef.current;
      if (now - lastHorizontalScrollAt.current > HORIZONTAL_THROTTLE) {
        if (pageX < HORIZONTAL_EDGE && idx > 0) {
          const nextIdx = idx - 1;
          pagerRef.current?.scrollToIndex(nextIdx, true);
          setActiveIndex(nextIdx);
          haptics.light();
          lastHorizontalScrollAt.current = now;
        } else if (pageX > windowWidth - HORIZONTAL_EDGE && idx < allColumns.length - 1) {
          const nextIdx = idx + 1;
          pagerRef.current?.scrollToIndex(nextIdx, true);
          setActiveIndex(nextIdx);
          haptics.light();
          lastHorizontalScrollAt.current = now;
        }
      }
    }, 32);

    return () => clearInterval(tick);
  }, [dragState.active, windowWidth]);

  // ---------------------------------------------------------------------------
  // Measurement callbacks
  // ---------------------------------------------------------------------------

  const handleColumnMeasure = useCallback((columnId: number, rect: ColumnRect) => {
    columnRects.current.set(columnId, rect);
  }, []);

  const handleTaskMeasure = useCallback((taskId: number, rect: TaskRect) => {
    taskRects.current.set(taskId, rect);
  }, []);

  const handleScrollUpdate = useCallback((columnId: number, y: number) => {
    columnScrollOffsets.current[columnId] = y;
  }, []);

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
            onColumnMeasure={handleColumnMeasure}
            onTaskMeasure={handleTaskMeasure}
            onScrollUpdate={handleScrollUpdate}
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
