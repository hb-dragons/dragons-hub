"use client";

import { useTranslations, type useFormatter } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { DatePicker } from "@dragons/ui/components/date-picker";
import { AssigneePicker } from "./assignee-picker";
import { AssigneeStack } from "./assignee-stack";
import {
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskAssignee,
} from "@dragons/shared";

export interface TaskDialogSidebarProps {
  priority: TaskPriority;
  onPriorityChange: (p: TaskPriority) => void;
  dueDate: string | null;
  onDueDateChange: (d: string | null) => void;
  assignees: TaskAssignee[];
  onAddAssignee: (userId: string) => Promise<void>;
  onRemoveAssignee: (userId: string) => Promise<void>;
  createdAt: string;
  updatedAt: string;
  format: ReturnType<typeof useFormatter>;
}

export function TaskDialogSidebar({
  priority,
  onPriorityChange,
  dueDate,
  onDueDateChange,
  assignees,
  onAddAssignee,
  onRemoveAssignee,
  createdAt,
  updatedAt,
  format,
}: TaskDialogSidebarProps) {
  const t = useTranslations("board");
  return (
    <aside className="space-y-4 border-t pt-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("task.priority")}>
          <Select
            value={priority}
            onValueChange={(v) => onPriorityChange(v as TaskPriority)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`priority.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t("task.dueDate")}>
          <DatePicker
            value={dueDate}
            onChange={onDueDateChange}
            className="w-full"
          />
        </Field>
      </div>

      <Field label={t("task.assignee")}>
        <div className="flex items-center gap-2">
          {assignees.length > 0 && (
            <AssigneeStack assignees={assignees} size="md" max={5} />
          )}
          <div className="flex-1">
            <AssigneePicker
              assignees={assignees}
              onAdd={onAddAssignee}
              onRemove={onRemoveAssignee}
            />
          </div>
        </div>
      </Field>

      <dl className="flex justify-between gap-4 border-t pt-3 text-xs text-muted-foreground">
        <div>
          <dt className="text-[10px] uppercase tracking-wide">
            {t("task.createdAt")}
          </dt>
          <dd className="tabular-nums">
            {format.dateTime(new Date(createdAt), "short")}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-[10px] uppercase tracking-wide">
            {t("task.updatedAt")}
          </dt>
          <dd className="tabular-nums">
            {format.dateTime(new Date(updatedAt), "short")}
          </dd>
        </div>
      </dl>
    </aside>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      {children}
    </section>
  );
}
