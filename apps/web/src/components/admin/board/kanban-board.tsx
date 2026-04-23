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

  function describeLocation(taskId: number): {
    column: string;
    position: number;
    total: number;
  } {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return { column: "", position: 0, total: 0 };
    const columnName =
      sortedColumns.find((c) => c.id === task.columnId)?.name ?? "";
    const colTasks = tasksByColumn.get(task.columnId) ?? [];
    const index = colTasks.findIndex((t) => t.id === taskId);
    return {
      column: columnName,
      position: index + 1,
      total: colTasks.length,
    };
  }

  function describeDropTarget(
    activeIdNum: number,
    overData: { type: "task" | "column"; id: number; columnId: number },
  ): { column: string; position: number; total: number } {
    const columnId =
      overData.type === "column" ? overData.id : overData.columnId;
    const columnName =
      sortedColumns.find((c) => c.id === columnId)?.name ?? "";
    const colTasks = tasksByColumn.get(columnId) ?? [];
    const total =
      activeTask && activeTask.columnId !== columnId
        ? colTasks.length + 1
        : colTasks.length;
    let position = colTasks.length;
    if (overData.type === "task") {
      const idx = colTasks.findIndex((t) => t.id === overData.id);
      position = (idx === -1 ? colTasks.length : idx) + 1;
    }
    void activeIdNum;
    return { column: columnName, position, total };
  }

  const announcements = {
    onDragStart({ active }: { active: { id: string | number } }) {
      const idStr = String(active.id);
      if (idStr.startsWith("task-")) {
        const taskId = Number(idStr.slice(5));
        const task = tasks.find((x) => x.id === taskId);
        const loc = describeLocation(taskId);
        return t("dnd.pickUp", {
          title: task?.title ?? idStr,
          column: loc.column,
          position: loc.position,
          total: loc.total,
        });
      }
      if (idStr.startsWith("col-")) {
        const colId = Number(idStr.slice(4));
        const column = sortedColumns.find((c) => c.id === colId);
        return t("dnd.pickUp", {
          title: column?.name ?? idStr,
          column: column?.name ?? "",
          position:
            sortedColumns.findIndex((c) => c.id === colId) + 1,
          total: sortedColumns.length,
        });
      }
      return t("dnd.cancel");
    },
    onDragOver({
      active,
      over,
    }: {
      active: { id: string | number };
      over: { id: string | number; data: { current?: unknown } } | null;
    }) {
      if (!over) return t("dnd.cancel");
      const activeIdStr = String(active.id);
      if (activeIdStr.startsWith("col-")) {
        const overId = String(over.id);
        if (!overId.startsWith("col-")) return t("dnd.cancel");
        const colId = Number(overId.slice(4));
        const column = sortedColumns.find((c) => c.id === colId);
        return t("dnd.move", {
          column: column?.name ?? "",
          position: sortedColumns.findIndex((c) => c.id === colId) + 1,
          total: sortedColumns.length,
        });
      }
      const overData = over.data.current as
        | { type: "task" | "column"; id: number; columnId: number }
        | undefined;
      if (!overData) return t("dnd.cancel");
      const loc = describeDropTarget(Number(activeIdStr.slice(5)), overData);
      return t("dnd.move", loc);
    },
    onDragEnd({
      active,
      over,
    }: {
      active: { id: string | number };
      over: { id: string | number; data: { current?: unknown } } | null;
    }) {
      if (!over) return t("dnd.cancel");
      const activeIdStr = String(active.id);
      if (activeIdStr.startsWith("col-")) {
        const colId = Number(String(over.id).slice(4));
        const column = sortedColumns.find((c) => c.id === colId);
        return t("dnd.drop", {
          column: column?.name ?? "",
          position: sortedColumns.findIndex((c) => c.id === colId) + 1,
        });
      }
      const overData = over.data.current as
        | { type: "task" | "column"; id: number; columnId: number }
        | undefined;
      if (!overData) return t("dnd.cancel");
      const loc = describeDropTarget(Number(activeIdStr.slice(5)), overData);
      return t("dnd.drop", { column: loc.column, position: loc.position });
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
