"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@dragons/ui/components/badge";
import {
  Calendar,
  CheckSquare,
  Paperclip,
  MessageSquare,
  GripVertical,
} from "lucide-react";
import type { TaskCardData, TaskPriority } from "@dragons/shared";
import { AssigneeStack } from "./assignee-stack";
import { LabelsBar } from "./labels-bar.stub";

const priorityVariant: Record<
  TaskPriority,
  "default" | "secondary" | "destructive" | "outline"
> = {
  low: "secondary",
  normal: "outline",
  high: "default",
  urgent: "destructive",
};

interface TaskCardProps {
  task: TaskCardData & {
    labels?: { id: number; color: string; name?: string | null }[];
    attachmentCount?: number;
    commentCount?: number;
  };
  onOpen: (task: TaskCardData) => void;
  /** dnd-kit sortable attributes + listeners, spread onto the card's grip. */
  dragHandle?: React.HTMLAttributes<HTMLButtonElement>;
}

export function TaskCard({ task, onOpen, dragHandle }: TaskCardProps) {
  const t = useTranslations("board");
  const variant = priorityVariant[task.priority];
  const hasChecklist = task.checklistTotal > 0;

  // The sortable listeners live on a dedicated grip, not on the card. Spread
  // onto the card they fought its own Enter/Space handler — whichever was
  // declared last won, and dnd-kit's KeyboardSensor became unreachable. Keeping
  // them separate gives keyboard users both journeys: Enter/Space on the card
  // opens it, Enter/Space on the grip picks it up.
  const { onClick: onHandleClick, ...handleProps } = dragHandle ?? {};

  return (
    <div
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        // Only react to keys pressed while the card itself holds focus. The
        // grip is a child; its keystrokes belong to dnd-kit, and swallowing
        // them here (or calling stopPropagation there) would break the drag.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task);
        }
      }}
      role="button"
      tabIndex={0}
      className="cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <LabelsBar labels={task.labels} />

      <div className="flex items-start justify-between gap-2">
        {dragHandle && (
          <button
            type="button"
            {...handleProps}
            aria-label={t("dnd.handle", { title: task.title })}
            // Clicks stop here so grabbing the grip doesn't also open the task.
            // Key events must NOT be stopped: React's stopPropagation also
            // stops the native event, and dnd-kit's KeyboardSensor listens for
            // the arrow/space keys on the document.
            onClick={(e) => {
              e.stopPropagation();
              onHandleClick?.(e);
            }}
            className="-ml-1 shrink-0 cursor-grab p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <p className="flex-1 text-sm font-medium leading-tight">{task.title}</p>
        <Badge variant={variant} className="shrink-0">
          {t(`priority.${task.priority}`)}
        </Badge>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
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
          {task.attachmentCount && task.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              {task.attachmentCount}
            </span>
          )}
          {task.commentCount && task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {task.commentCount}
            </span>
          )}
        </div>
        <AssigneeStack assignees={task.assignees} />
      </div>
    </div>
  );
}
