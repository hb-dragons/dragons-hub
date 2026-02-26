"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@dragons/ui/components/badge";
import { Calendar, CheckSquare, Link as LinkIcon } from "lucide-react";
import type { TaskCardData } from "./types";

const priorityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  normal: "outline",
  high: "default",
  urgent: "destructive",
};

interface TaskCardProps {
  task: TaskCardData;
  onDragStart: (e: React.DragEvent, taskId: number) => void;
  onClick: (task: TaskCardData) => void;
}

export function TaskCard({ task, onDragStart, onClick }: TaskCardProps) {
  const t = useTranslations("board");
  const variant = priorityVariant[task.priority] ?? priorityVariant.normal;
  const priorityKey = (["low", "normal", "high", "urgent"] as const).includes(
    task.priority as "low" | "normal" | "high" | "urgent",
  )
    ? (task.priority as "low" | "normal" | "high" | "urgent")
    : "normal";
  const hasChecklist = task.checklistTotal > 0;
  const hasLink = task.matchId !== null || task.venueBookingId !== null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onClick={() => onClick(task)}
      className="cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{task.title}</p>
        <Badge variant={variant} className="shrink-0">
          {t(`priority.${priorityKey}`)}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {task.dueDate && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {task.dueDate}
          </span>
        )}
        {hasChecklist && (
          <span className="inline-flex items-center gap-1">
            <CheckSquare className="h-3 w-3" />
            {task.checklistChecked}/{task.checklistTotal}
          </span>
        )}
        {hasLink && (
          <span className="inline-flex items-center gap-1">
            <LinkIcon className="h-3 w-3" />
          </span>
        )}
      </div>

      {hasChecklist && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${Math.round((task.checklistChecked / task.checklistTotal) * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
