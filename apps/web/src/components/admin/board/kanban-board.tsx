"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type { TaskCardData, BoardColumnData, BoardData } from "@dragons/shared";
import { KanbanColumn } from "./kanban-column";
import { TaskCard } from "./task-card";
import { computeDropTarget, buildColumnReorder } from "@/lib/dnd";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import { useColumnMutations } from "@/hooks/use-column-mutations";

export interface KanbanBoardProps {
  board: BoardData;
  tasks: TaskCardData[];
  onOpenTask: (task: TaskCardData) => void;
  onAddTask: (columnId: number) => void;
  onEditColumn: (column: BoardColumnData) => void;
}

export function KanbanBoard({
  board,
  tasks,
  onOpenTask,
  onAddTask,
  onEditColumn,
}: KanbanBoardProps) {
  const t = useTranslations("board");
  const { moveTask } = useTaskMutations(board.id);
  const { reorderColumns } = useColumnMutations(board.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const sortedColumns = useMemo(
    () => [...board.columns].sort((a, b) => a.position - b.position),
    [board.columns],
  );

  const tasksByColumn = useMemo(() => {
    const map = new Map<number, TaskCardData[]>();
    for (const col of sortedColumns) map.set(col.id, []);
    for (const task of tasks) {
      const list = map.get(task.columnId) ?? [];
      list.push(task);
      map.set(task.columnId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [sortedColumns, tasks]);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id.toString());
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;

    const activeIdStr = e.active.id.toString();
    const overIdStr = e.over.id.toString();

    if (activeIdStr.startsWith("col-")) {
      const reorder = buildColumnReorder(sortedColumns, activeIdStr, overIdStr);
      if (reorder) await reorderColumns(reorder);
      return;
    }

    if (activeIdStr.startsWith("task-")) {
      const activeData = e.active.data.current as
        | { type: "task"; id: number; columnId: number }
        | undefined;
      const overData = e.over.data.current as
        | { type: "task" | "column"; id: number; columnId: number }
        | undefined;
      if (!activeData || !overData) return;

      const target = computeDropTarget(activeData, overData, tasks);
      if (!target) return;

      await moveTask(activeData.id, target.columnId, target.position);
    }
  }

  const activeTask = activeId?.startsWith("task-")
    ? tasks.find((x) => x.id === Number(activeId.slice(5))) ?? null
    : null;

  const announcements = {
    onDragStart({ active }: { active: { id: string | number } }) {
      return t("dnd.pickUp", {
        title: String(active.id),
        column: "",
        position: 0,
        total: tasks.length,
      });
    },
    onDragOver() {
      return t("dnd.move", { column: "", position: 0, total: tasks.length });
    },
    onDragEnd() {
      return t("dnd.drop", { column: "", position: 0 });
    },
    onDragCancel() {
      return t("dnd.cancel");
    },
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ announcements }}
    >
      <SortableContext
        items={sortedColumns.map((c) => `col-${c.id}`)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {sortedColumns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={tasksByColumn.get(col.id) ?? []}
              onOpenTask={onOpenTask}
              onAddTask={onAddTask}
              onEditColumn={onEditColumn}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} onOpen={() => {}} />}
      </DragOverlay>
    </DndContext>
  );
}
