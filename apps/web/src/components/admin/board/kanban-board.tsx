"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
import { GripVertical, Plus } from "lucide-react";
import { Button } from "@dragons/ui/components/button";
import type { TaskCardData, BoardColumnData, BoardData } from "@dragons/shared";
import { KanbanColumn } from "./kanban-column";
import { TaskCard } from "./task-card";
import {
  computeDropTarget,
  buildColumnReorder,
  applyTaskMove,
  applyColumnReorder,
} from "@/lib/dnd";
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
  // Captured at drag start so the column overlay matches the source's
  // stretched height (flex-row stretches all columns to the tallest sibling,
  // but the DragOverlay floats outside that container and would otherwise
  // only be as tall as its own content).
  const [activeSize, setActiveSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const sortedColumns = useMemo(
    () => [...board.columns].sort((a, b) => a.position - b.position),
    [board.columns],
  );

  // Local mirrors used as the visual source of truth during drag + optimistic
  // window. Props ← server via SWR; local is reseeded from props when no
  // mutation is in flight and no drag is active. Without this, dnd-kit's drop
  // animation (and the column's own CSS transition) would play against stale
  // props and fly the card/column back to its original position before the
  // SWR revalidation lands.
  const [localTasks, setLocalTasks] = useState<TaskCardData[]>(tasks);
  const [localColumns, setLocalColumns] =
    useState<BoardColumnData[]>(sortedColumns);
  const inflightRef = useRef(0);

  useEffect(() => {
    if (inflightRef.current === 0 && activeId === null) setLocalTasks(tasks);
  }, [tasks, activeId]);

  useEffect(() => {
    if (inflightRef.current === 0 && activeId === null) {
      setLocalColumns(sortedColumns);
    }
  }, [sortedColumns, activeId]);

  const tasksByColumn = useMemo(() => {
    const map = new Map<number, TaskCardData[]>();
    for (const col of localColumns) map.set(col.id, []);
    for (const task of localTasks) {
      const list = map.get(task.columnId) ?? [];
      list.push(task);
      map.set(task.columnId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [localColumns, localTasks]);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id.toString());
    const initial = e.active.rect.current.initial;
    if (initial) {
      setActiveSize({ width: initial.width, height: initial.height });
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    setActiveSize(null);
    if (!e.over) return;

    const activeIdStr = e.active.id.toString();
    const overIdStr = e.over.id.toString();

    if (activeIdStr.startsWith("col-")) {
      const reorder = buildColumnReorder(localColumns, activeIdStr, overIdStr);
      if (!reorder) return;
      setLocalColumns((prev) => applyColumnReorder(prev, reorder));
      inflightRef.current++;
      try {
        await reorderColumns(reorder);
      } finally {
        inflightRef.current--;
      }
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

      const target = computeDropTarget(activeData, overData, localTasks);
      if (!target) return;

      setLocalTasks((prev) =>
        applyTaskMove(prev, activeData.id, target.columnId, target.position),
      );
      inflightRef.current++;
      try {
        await moveTask(activeData.id, target.columnId, target.position);
      } finally {
        inflightRef.current--;
      }
    }
  }

  const activeTask = activeId?.startsWith("task-")
    ? localTasks.find((x) => x.id === Number(activeId.slice(5))) ?? null
    : null;

  const activeColumn = activeId?.startsWith("col-")
    ? localColumns.find((c) => c.id === Number(activeId.slice(4))) ?? null
    : null;
  const activeColumnTasks = activeColumn
    ? tasksByColumn.get(activeColumn.id) ?? []
    : [];

  function describeLocation(taskId: number): {
    column: string;
    position: string;
    total: string;
  } {
    const task = localTasks.find((t) => t.id === taskId);
    if (!task) return { column: "", position: "0", total: "0" };
    const columnName =
      localColumns.find((c) => c.id === task.columnId)?.name ?? "";
    const colTasks = tasksByColumn.get(task.columnId) ?? [];
    const index = colTasks.findIndex((t) => t.id === taskId);
    return {
      column: columnName,
      position: String(index + 1),
      total: String(colTasks.length),
    };
  }

  function describeDropTarget(
    overData: { type: "task" | "column"; id: number; columnId: number },
  ): { column: string; position: string; total: string } {
    const columnId =
      overData.type === "column" ? overData.id : overData.columnId;
    const columnName =
      localColumns.find((c) => c.id === columnId)?.name ?? "";
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
    return {
      column: columnName,
      position: String(position),
      total: String(total),
    };
  }

  const announcements = {
    onDragStart({ active }: { active: { id: string | number } }) {
      const idStr = String(active.id);
      if (idStr.startsWith("task-")) {
        const taskId = Number(idStr.slice(5));
        const task = localTasks.find((x) => x.id === taskId);
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
        const column = localColumns.find((c) => c.id === colId);
        return t("dnd.pickUp", {
          title: column?.name ?? idStr,
          column: column?.name ?? "",
          position: String(
            localColumns.findIndex((c) => c.id === colId) + 1,
          ),
          total: String(localColumns.length),
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
        const column = localColumns.find((c) => c.id === colId);
        return t("dnd.move", {
          column: column?.name ?? "",
          position: String(
            localColumns.findIndex((c) => c.id === colId) + 1,
          ),
          total: String(localColumns.length),
        });
      }
      const overData = over.data.current as
        | { type: "task" | "column"; id: number; columnId: number }
        | undefined;
      if (!overData) return t("dnd.cancel");
      const loc = describeDropTarget(overData);
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
        const column = localColumns.find((c) => c.id === colId);
        return t("dnd.drop", {
          column: column?.name ?? "",
          position: String(
            localColumns.findIndex((c) => c.id === colId) + 1,
          ),
        });
      }
      const overData = over.data.current as
        | { type: "task" | "column"; id: number; columnId: number }
        | undefined;
      if (!overData) return t("dnd.cancel");
      const loc = describeDropTarget(overData);
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
      onDragCancel={() => {
        setActiveId(null);
        setActiveSize(null);
      }}
      accessibility={{ announcements }}
    >
      <SortableContext
        items={localColumns.map((c) => `col-${c.id}`)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {localColumns.map((col) => (
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
        {activeColumn && (
          <div
            className="flex shrink-0 flex-col rounded-lg border bg-muted/50 shadow-lg"
            style={{
              width: activeSize?.width,
              height: activeSize?.height,
            }}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="p-1 text-muted-foreground">
                <GripVertical className="h-4 w-4" />
              </span>
              <div className="flex flex-1 items-center gap-2 text-sm font-semibold">
                {activeColumn.color && (
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: activeColumn.color }}
                  />
                )}
                <span>{activeColumn.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {activeColumnTasks.length}
                </span>
              </div>
              <Button size="icon-sm" variant="ghost" tabIndex={-1}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2 min-h-[50px]">
              {activeColumnTasks.map((task) => (
                <TaskCard key={task.id} task={task} onOpen={() => {}} />
              ))}
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
