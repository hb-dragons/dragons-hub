"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskCardData } from "@dragons/shared";
import { TaskCard } from "./task-card";

export interface SortableTaskCardProps {
  task: TaskCardData;
  onOpen: (task: TaskCardData) => void;
}

export function SortableTaskCard({ task, onOpen }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `task-${task.id}`,
      data: { type: "task", id: task.id, columnId: task.columnId },
    });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={task}
        onOpen={onOpen}
        dragHandle={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
