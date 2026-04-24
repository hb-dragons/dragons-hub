import type { TaskCardData, BoardColumnData } from "@dragons/shared";

export type DragItem =
  | { type: "task"; id: number; columnId: number }
  | { type: "column"; id: number; columnId: number };

export interface DropTarget {
  columnId: number;
  position: number;
}

export function computeDropTarget(
  active: DragItem,
  over: DragItem,
  tasks: TaskCardData[],
): DropTarget | null {
  if (active.type !== "task") return null;
  if (over.type === "task" && active.id === over.id) return null;

  if (over.type === "column") {
    const siblings = tasks.filter(
      (t) => t.columnId === over.id && t.id !== active.id,
    );
    return { columnId: over.id, position: siblings.length };
  }

  const overTask = tasks.find((t) => t.id === over.id);
  if (!overTask) return null;
  return { columnId: overTask.columnId, position: overTask.position };
}

export function buildColumnReorder(
  columns: BoardColumnData[],
  activeId: string,
  overId: string,
): { id: number; position: number }[] | null {
  if (!activeId.startsWith("col-") || !overId.startsWith("col-")) return null;
  if (activeId === overId) return null;

  const activeNum = Number(activeId.slice(4));
  const overNum = Number(overId.slice(4));

  const sorted = [...columns].sort((a, b) => a.position - b.position);
  const fromIndex = sorted.findIndex((c) => c.id === activeNum);
  const toIndex = sorted.findIndex((c) => c.id === overNum);
  if (fromIndex === -1 || toIndex === -1) return null;

  const moved = sorted.splice(fromIndex, 1)[0]!;
  sorted.splice(toIndex, 0, moved);

  return sorted.map((c, index) => ({ id: c.id, position: index }));
}

// Mirrors the server-side moveTask reorder in task.service.ts so the UI can
// settle into its final layout before the PATCH returns, avoiding the
// drop-animation fly-back on the dragged card.
export function applyTaskMove(
  tasks: TaskCardData[],
  taskId: number,
  targetColumnId: number,
  targetPosition: number,
): TaskCardData[] {
  const moving = tasks.find((t) => t.id === taskId);
  if (!moving) return tasks;

  const fromColumnId = moving.columnId;
  const fromPosition = moving.position;

  const targetSiblings = tasks.filter(
    (t) => t.columnId === targetColumnId && t.id !== taskId,
  );
  const clamped = Math.max(
    0,
    Math.min(targetPosition, targetSiblings.length),
  );

  if (fromColumnId === targetColumnId && clamped === fromPosition) {
    return tasks;
  }

  return tasks.map((t) => {
    if (t.id === taskId) {
      return { ...t, columnId: targetColumnId, position: clamped };
    }
    if (fromColumnId === targetColumnId) {
      if (t.columnId !== targetColumnId) return t;
      if (clamped < fromPosition) {
        if (t.position >= clamped && t.position < fromPosition) {
          return { ...t, position: t.position + 1 };
        }
      } else if (t.position > fromPosition && t.position <= clamped) {
        return { ...t, position: t.position - 1 };
      }
      return t;
    }
    if (t.columnId === fromColumnId && t.position > fromPosition) {
      return { ...t, position: t.position - 1 };
    }
    if (t.columnId === targetColumnId && t.position >= clamped) {
      return { ...t, position: t.position + 1 };
    }
    return t;
  });
}

export function applyColumnReorder(
  columns: BoardColumnData[],
  reorder: { id: number; position: number }[],
): BoardColumnData[] {
  const posMap = new Map(reorder.map((r) => [r.id, r.position]));
  return columns
    .map((c) => {
      const next = posMap.get(c.id);
      return next === undefined ? c : { ...c, position: next };
    })
    .sort((a, b) => a.position - b.position);
}
