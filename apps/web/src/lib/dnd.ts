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
