"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@dragons/ui/components/badge";
import { Calendar, CheckSquare, Paperclip, MessageSquare } from "lucide-react";
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
  dragHandle?: React.HTMLAttributes<HTMLDivElement>;
}

export function TaskCard({ task, onOpen, dragHandle }: TaskCardProps) {
  const t = useTranslations("board");
  const variant = priorityVariant[task.priority];
  const hasChecklist = task.checklistTotal > 0;

  return (
    <div
      {...dragHandle}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
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
        <p className="text-sm font-medium leading-tight">{task.title}</p>
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
