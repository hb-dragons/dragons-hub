import type { TaskCardData } from "./tasks";
import type { BoardColumnData } from "./boards";
import type { DropTarget, DragItem } from "./board-dnd";
import { computeDropTarget } from "./board-dnd";

export interface TaskContentRect {
  contentX: number;
  contentY: number;
  width: number;
  height: number;
  columnId: number;
}

export interface PagerLayout {
  /** Screen x of the pager's left edge. */
  pageX: number;
  /** Screen y of the pager's top edge. */
  pageY: number;
  /** Total rendered width of the pager. */
  width: number;
  /** Visible height of the pager. */
  height: number;
}

export interface ColumnScrollState {
  scrollY: number;
  viewportHeight: number;
  contentHeight: number;
  headerHeight: number;
}

export interface FindDropTargetArgs {
  pointerX: number;
  pointerY: number;
  draggedTask: TaskCardData;
  tasks: TaskCardData[];
  /** Columns sorted by position (ascending). */
  columns: BoardColumnData[];
  pagerLayout: PagerLayout | null;
  pagerScrollX: number;
  /** Horizontal padding (px) inside each column slot — subtracted when converting to content-local coords. */
  columnPaddingX: number;
  taskContentRects: Map<number, TaskContentRect>;
  columnScrollStates: Map<number, ColumnScrollState>;
}

export interface FindDropTargetResult {
  dropTarget: DropTarget | null;
  overColumnId: number;
}

/**
 * Pure function: given pointer coordinates and all layout measurements, return
 * the target column/position for a drag-and-drop operation, or null if the
 * pointer is outside the board.
 *
 * All inputs are plain values — no React, no refs, no hook state.
 */
export function findDropTarget(args: FindDropTargetArgs): FindDropTargetResult | null {
  const {
    pointerX,
    pointerY,
    draggedTask,
    tasks,
    columns,
    pagerLayout,
    pagerScrollX,
    columnPaddingX,
    taskContentRects,
    columnScrollStates,
  } = args;

  if (!pagerLayout || columns.length === 0) return null;

  const { pageX: pagerOriginX, pageY: pagerOriginY, width: pagerWidth } = pagerLayout;

  // Each column slot is columnWidth wide inside the pager.
  const columnWidth = Math.round(pagerWidth * 0.88);

  // Determine which column index the pointer is over.
  // Column i occupies screen x range: [pagerOriginX + i*columnWidth - pagerScrollX, ...)
  let overColumnIndex = -1;
  for (let i = 0; i < columns.length; i++) {
    const colScreenLeft = pagerOriginX + i * columnWidth - pagerScrollX;
    const colScreenRight = colScreenLeft + columnWidth;
    if (pointerX >= colScreenLeft && pointerX <= colScreenRight) {
      overColumnIndex = i;
      break;
    }
  }

  // Fall back to the dragged task's column.
  if (overColumnIndex === -1) {
    overColumnIndex = columns.findIndex((c) => c.id === draggedTask.columnId);
    if (overColumnIndex === -1) return null;
  }

  const overColumn = columns[overColumnIndex];
  if (!overColumn) return null;
  const overColumnId = overColumn.id;

  // Convert pointer to column-content coords.
  const colScreenLeft = pagerOriginX + overColumnIndex * columnWidth - pagerScrollX;
  const columnContentX = pointerX - colScreenLeft - columnPaddingX;

  const scrollState = columnScrollStates.get(overColumnId);
  const headerHeight = scrollState?.headerHeight ?? 0;
  const scrollY = scrollState?.scrollY ?? 0;
  const columnContentY = pointerY - pagerOriginY - headerHeight + scrollY;

  // Find which task in that column the pointer overlaps in content-local coords.
  let overTask: TaskCardData | null = null;
  for (const t of tasks) {
    if (t.columnId !== overColumnId) continue;
    if (t.id === draggedTask.id) continue;
    const rect = taskContentRects.get(t.id);
    if (!rect) continue;
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

  const active: DragItem = {
    type: "task",
    id: draggedTask.id,
    columnId: draggedTask.columnId,
  };

  const over: DragItem = overTask
    ? { type: "task", id: overTask.id, columnId: overTask.columnId }
    : { type: "column", id: overColumnId, columnId: overColumnId };

  return { dropTarget: computeDropTarget(active, over, tasks), overColumnId };
}
