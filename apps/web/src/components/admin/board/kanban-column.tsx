"use client";

import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@dragons/ui/components/button";
import { Plus, GripVertical } from "lucide-react";
import type { TaskCardData, BoardColumnData } from "@dragons/shared";
import { SortableTaskCard } from "./sortable-task-card";

export interface KanbanColumnProps {
  column: BoardColumnData & { wipLimit?: number | null };
  tasks: TaskCardData[];
  onOpenTask: (task: TaskCardData) => void;
  onAddTask: (columnId: number) => void;
  onEditColumn: (column: BoardColumnData) => void;
}

export function KanbanColumn({
  column,
  tasks,
  onOpenTask,
  onAddTask,
  onEditColumn,
}: KanbanColumnProps) {
  const t = useTranslations("board");

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
  } = useSortable({
    id: `col-${column.id}`,
    data: { type: "column", id: column.id, columnId: column.id },
  });

  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `col-${column.id}`,
    data: { type: "column", id: column.id, columnId: column.id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const overLimit =
    column.wipLimit != null && tasks.length > column.wipLimit;

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/50 ${
        overLimit ? "ring-2 ring-destructive" : ""
      }`}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab p-1 text-muted-foreground hover:text-foreground"
          aria-label={t("actions.editBoard")}
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onEditColumn(column)}
          className="flex flex-1 items-center gap-2 text-sm font-semibold hover:underline"
        >
          {column.color && (
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: column.color }}
            />
          )}
          <span>{column.name}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {tasks.length}
            {column.wipLimit != null && `/${column.wipLimit}`}
          </span>
          {overLimit && (
            <span className="text-[10px] text-destructive">
              {t("column.wipOver")}
            </span>
          )}
        </button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => onAddTask(column.id)}
          title={t("addTask")}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div
        ref={setDroppableRef}
        className="flex flex-1 flex-col gap-2 p-2 min-h-[50px]"
      >
        <SortableContext
          items={tasks.map((t) => `task-${t.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {t("emptyColumn")}
            </p>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                onOpen={onOpenTask}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
