import { useCallback, useEffect, useRef, useState } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { computeDropTarget } from "@dragons/shared";
import type { BoardColumnHandle } from "@/components/board/BoardColumn";
import type { BoardPagerHandle, PagerLayout } from "@/components/board/BoardPager";
import type { TaskCardLayout, TaskContentRect } from "@/components/board/TaskCard";
import { haptics } from "@/lib/haptics";
import { useMoveTask } from "./useMoveTask";
import { spacing } from "@/theme/spacing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActiveDragState = {
  active: true;
  task: TaskCardData;
  cardWidth: number;
  cardHeight: number;
  /** Column ID currently highlighted as drop target (null = none) */
  dropTargetColumnId: number | null;
};

export type DragState =
  | { active: false }
  | ActiveDragState;

interface UseBoardDragArgs {
  boardId: number;
  columns: BoardColumnData[];
  tasks: TaskCardData[] | undefined;
  windowWidth: number;
  pagerRef: React.RefObject<BoardPagerHandle | null>;
  columnHandlesRef: React.RefObject<Map<number, BoardColumnHandle>>;
}

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
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBoardDrag({
  boardId,
  columns,
  tasks,
  windowWidth,
  pagerRef,
  columnHandlesRef,
}: UseBoardDragArgs): UseBoardDragReturn {
  const moveTask = useMoveTask(boardId);

  // Reanimated shared values for the ghost overlay (UI-thread updates).
  const pointerX = useSharedValue(0);
  const pointerY = useSharedValue(0);

  // React state for render (task identity, sizes, drop highlight).
  const [dragState, setDragState] = useState<DragState>({ active: false });

  // Ref that mirrors dragState so gesture callbacks can read without stale closures.
  const dragStateRef = useRef<DragState>({ active: false });

  // Plain JS pointer coords — read by autoscroll interval.
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Flag the interval reads to bail early if drag ended.
  const dragActiveRef = useRef(false);

  // Stable refs to columns / tasks (avoids stale closure in callbacks).
  const columnsRef = useRef<BoardColumnData[]>([]);
  columnsRef.current = columns;
  const tasksRef = useRef<TaskCardData[]>([]);
  tasksRef.current = tasks ?? [];

  // ---------------------------------------------------------------------------
  // Measurement maps
  // ---------------------------------------------------------------------------

  /** Card rects in column-content-local coords. */
  const taskContentRects = useRef<Map<number, TaskContentRect>>(new Map());

  /** Per-column scroll offsets. */
  const columnScrollOffsets = useRef<Record<number, number>>({});

  /** Per-column visible viewport heights (from onScroll layoutMeasurement). */
  const columnViewportHeights = useRef<Record<number, number>>({});

  /** Per-column content heights (from onContentSizeChange). */
  const columnContentHeights = useRef<Record<number, number>>({});

  /** Per-column header heights (pixels above the ScrollView). */
  const columnHeaderHeights = useRef<Record<number, number>>({});

  /** Pager screen layout: origin + dimensions. */
  const pagerLayoutRef = useRef<PagerLayout | null>(null);

  /** Pager horizontal scroll offset, kept in sync via onPagerScrollUpdate. */
  const pagerScrollXRef = useRef(0);

  // Throttle for horizontal pager snaps.
  const lastHorizontalScrollAt = useRef(0);

  // Track active column index so we can snap prev/next.
  const activeIndexRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Callbacks for children
  // ---------------------------------------------------------------------------

  const onPagerLayout = useCallback((layout: PagerLayout) => {
    pagerLayoutRef.current = layout;
  }, []);

  const onPagerScrollUpdate = useCallback((scrollX: number) => {
    pagerScrollXRef.current = scrollX;
  }, []);

  const onColumnScrollUpdate = useCallback(
    (columnId: number, scrollY: number, viewportHeight: number) => {
      columnScrollOffsets.current[columnId] = scrollY;
      columnViewportHeights.current[columnId] = viewportHeight;
    },
    [],
  );

  const onColumnContentSizeChange = useCallback((columnId: number, contentHeight: number) => {
    columnContentHeights.current[columnId] = contentHeight;
  }, []);

  const onTaskMeasure = useCallback((taskId: number, rect: TaskContentRect) => {
    taskContentRects.current.set(taskId, rect);
  }, []);

  const onColumnHeaderHeight = useCallback((columnId: number, headerHeight: number) => {
    columnHeaderHeights.current[columnId] = headerHeight;
  }, []);

  // ---------------------------------------------------------------------------
  // Drop-target computation (geometric column x, content-local task coords)
  // ---------------------------------------------------------------------------

  const findDropTarget = useCallback(
    (pageX: number, pageY: number, draggedTask: TaskCardData) => {
      const allColumns = columnsRef.current;
      const allTasks = tasksRef.current;
      const pagerLayout = pagerLayoutRef.current;

      if (!pagerLayout || allColumns.length === 0) return null;

      const { pageX: pagerOriginX, pageY: pagerOriginY, width: pagerWidth } = pagerLayout;
      const scrollX = pagerScrollXRef.current;

      // Each column slot is columnWidth wide inside the pager.
      // The column component adds paddingHorizontal: spacing.sm inside the slot.
      const columnWidth = Math.round(pagerWidth * 0.88);

      // Determine which column index the pointer is over.
      // Column i occupies pager x range: [i * columnWidth, (i+1) * columnWidth)
      // Screen x of that range: pagerOriginX + i * columnWidth - scrollX
      let overColumnIndex = -1;
      for (let i = 0; i < allColumns.length; i++) {
        const colScreenLeft = pagerOriginX + i * columnWidth - scrollX;
        const colScreenRight = colScreenLeft + columnWidth;
        if (pageX >= colScreenLeft && pageX <= colScreenRight) {
          overColumnIndex = i;
          break;
        }
      }

      // Fall back to the dragged task's column.
      if (overColumnIndex === -1) {
        overColumnIndex = allColumns.findIndex((c) => c.id === draggedTask.columnId);
        if (overColumnIndex === -1) return null;
      }

      const overColumn = allColumns[overColumnIndex];
      if (!overColumn) return null;
      const overColumnId = overColumn.id;

      // Convert pointer to column-content coords.
      const colScreenLeft = pagerOriginX + overColumnIndex * columnWidth - scrollX;
      // spacing.sm is the horizontal padding of the column wrapper.
      const columnContentX = pageX - colScreenLeft - spacing.sm;
      const headerHeight = columnHeaderHeights.current[overColumnId] ?? 0;
      const scrollY = columnScrollOffsets.current[overColumnId] ?? 0;
      const columnContentY = pageY - pagerOriginY - headerHeight + scrollY;

      // Find which task in that column the pointer overlaps in content-local coords.
      let overTask: TaskCardData | null = null;
      for (const t of allTasks) {
        if (t.columnId !== overColumnId) continue;
        if (t.id === draggedTask.id) continue;
        const rect = taskContentRects.current.get(t.id);
        if (!rect) continue;
        // The ScrollView has padding: spacing.sm on all sides; cards are laid
        // out inside that padding. onLayout reports coords relative to the
        // ScrollView's content origin (including that padding).
        if (
          columnContentX >= rect.contentX &&
          columnContentX <= rect.contentX + rect.width &&
          columnContentY >= rect.contentY &&
          columnContentY <= rect.contentY + rect.height
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
  // Drag callbacks
  // ---------------------------------------------------------------------------

  const handleDragStart = useCallback(
    (task: TaskCardData, layout: TaskCardLayout) => {
      haptics.medium();
      const cx = layout.x + layout.width / 2;
      const cy = layout.y + layout.height / 2;
      pointerX.value = cx;
      pointerY.value = cy;
      pointerRef.current = { x: cx, y: cy };
      dragActiveRef.current = true;
      const next: DragState = {
        active: true,
        task,
        cardWidth: layout.width,
        cardHeight: layout.height,
        dropTargetColumnId: task.columnId,
      };
      dragStateRef.current = next;
      setDragState(next);
    },
    [pointerX, pointerY],
  );

  const handleDragMove = useCallback(
    (pageX: number, pageY: number) => {
      pointerX.value = pageX;
      pointerY.value = pageY;
      pointerRef.current = { x: pageX, y: pageY };

      const prev = dragStateRef.current;
      if (!prev.active) return;

      const result = findDropTarget(pageX, pageY, prev.task);
      const dropTargetColumnId = result?.overColumnId ?? prev.task.columnId;

      if (prev.dropTargetColumnId === dropTargetColumnId) return;

      const next: DragState = { ...prev, dropTargetColumnId };
      dragStateRef.current = next;
      setDragState(next);
    },
    [pointerX, pointerY, findDropTarget],
  );

  const handleDragEnd = useCallback(() => {
    dragActiveRef.current = false;

    // Snapshot drag state before clearing it.
    const snapshot = dragStateRef.current;
    dragStateRef.current = { active: false };
    setDragState({ active: false });

    if (!snapshot.active) return;

    const { x, y } = pointerRef.current;
    const result = findDropTarget(x, y, snapshot.task);
    const dropTarget = result?.dropTarget ?? null;

    if (
      dropTarget &&
      (dropTarget.columnId !== snapshot.task.columnId ||
        dropTarget.position !== snapshot.task.position)
    ) {
      haptics.success();
      void moveTask(snapshot.task.id, dropTarget.columnId, dropTarget.position);
    }
  }, [findDropTarget, moveTask]);

  const onTaskDrag = {
    start: handleDragStart,
    move: handleDragMove,
    end: handleDragEnd,
  };

  // ---------------------------------------------------------------------------
  // Autoscroll interval
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!dragState.active) return;

    const EDGE_BAND_VERTICAL = 80;   // px from top/bottom of column to trigger
    const SCROLL_SPEED = 8;          // px per tick (32 ms → ~250 px/s)
    const HORIZONTAL_EDGE = 48;      // px from screen left/right
    const HORIZONTAL_THROTTLE = 500; // ms between horizontal snaps

    const tick = setInterval(() => {
      if (!dragActiveRef.current) return;

      const { x: pageX, y: pageY } = pointerRef.current;
      const allColumns = columnsRef.current;
      const pagerLayout = pagerLayoutRef.current;

      if (!pagerLayout) return;

      const { pageX: pagerOriginX, pageY: pagerOriginY, width: pagerWidth } = pagerLayout;
      const scrollX = pagerScrollXRef.current;
      const columnWidth = Math.round(pagerWidth * 0.88);

      // --- Vertical autoscroll ---
      // Determine which column the pointer is over (geometric).
      let overColumnIndex = -1;
      for (let i = 0; i < allColumns.length; i++) {
        const left = pagerOriginX + i * columnWidth - scrollX;
        const right = left + columnWidth;
        if (pageX >= left && pageX <= right) {
          overColumnIndex = i;
          break;
        }
      }

      if (overColumnIndex >= 0) {
        const overColumn = allColumns[overColumnIndex];
        if (overColumn) {
          const columnHandle = columnHandlesRef.current.get(overColumn.id);
          if (columnHandle) {
            const currentScroll = columnScrollOffsets.current[overColumn.id] ?? 0;
            const viewportHeight = columnViewportHeights.current[overColumn.id] ?? 0;
            const contentHeight = columnContentHeights.current[overColumn.id] ?? 0;
            const headerHeight = columnHeaderHeights.current[overColumn.id] ?? 0;

            const colTop = pagerOriginY + headerHeight;
            const colBottom = pagerOriginY + (viewportHeight > 0 ? viewportHeight + headerHeight : pagerLayout.height);

            const topEdge = colTop + EDGE_BAND_VERTICAL;
            const bottomEdge = colBottom - EDGE_BAND_VERTICAL;

            if (pageY < topEdge && currentScroll > 0) {
              const nextY = Math.max(0, currentScroll - SCROLL_SPEED);
              columnHandle.scrollTo(nextY);
              columnScrollOffsets.current[overColumn.id] = nextY;
            } else if (pageY > bottomEdge) {
              // Clamp to avoid over-scrolling past content.
              const maxScroll = Math.max(0, contentHeight - (viewportHeight || pagerLayout.height));
              const nextY = Math.min(maxScroll, currentScroll + SCROLL_SPEED);
              if (nextY !== currentScroll) {
                columnHandle.scrollTo(nextY);
                columnScrollOffsets.current[overColumn.id] = nextY;
              }
            }
          }
        }
      }

      // --- Horizontal autoscroll ---
      const now = Date.now();
      const idx = activeIndexRef.current;
      if (now - lastHorizontalScrollAt.current > HORIZONTAL_THROTTLE) {
        if (pageX < HORIZONTAL_EDGE && idx > 0) {
          const nextIdx = idx - 1;
          activeIndexRef.current = nextIdx;
          pagerRef.current?.scrollToIndex(nextIdx, true);
          haptics.light();
          lastHorizontalScrollAt.current = now;
        } else if (pageX > windowWidth - HORIZONTAL_EDGE && idx < allColumns.length - 1) {
          const nextIdx = idx + 1;
          activeIndexRef.current = nextIdx;
          pagerRef.current?.scrollToIndex(nextIdx, true);
          haptics.light();
          lastHorizontalScrollAt.current = now;
        }
      }
    }, 32);

    return () => clearInterval(tick);
  }, [dragState.active, windowWidth, pagerRef, columnHandlesRef]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

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
  };
}
