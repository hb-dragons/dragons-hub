"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Textarea } from "@dragons/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { DatePicker } from "@dragons/ui/components/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog";
import { Loader2 } from "lucide-react";
import { TASK_PRIORITIES, type TaskPriority } from "@dragons/shared";
import type { BoardColumnData } from "@dragons/shared";
import { AssigneePicker } from "./assignee-picker";
import { AssigneeStack } from "./assignee-stack";
import { useUsers } from "@/hooks/use-users";
import { useTaskMutations } from "@/hooks/use-task-mutations";

export interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: number;
  columns: BoardColumnData[];
  defaultColumnId: number | null;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  boardId,
  columns,
  defaultColumnId,
}: CreateTaskDialogProps) {
  const t = useTranslations();
  const { data: users } = useUsers();
  const { createTask } = useTaskMutations(boardId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [columnId, setColumnId] = useState<string>(
    defaultColumnId?.toString() ?? columns[0]?.id.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("normal");
    setDueDate(null);
    setAssigneeIds([]);
    setColumnId(defaultColumnId?.toString() ?? columns[0]?.id.toString() ?? "");
  }

  const assigneeObjects = assigneeIds
    .map((id) => users?.get(id))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({
      userId: u.id,
      name: u.name,
      assignedAt: new Date().toISOString(),
    }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate,
        columnId: parseInt(columnId, 10),
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      });
      toast.success(t("board.toast.created"));
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("board.addTask")}</DialogTitle>
          <DialogDescription>{t("board.task.title")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ct-title">{t("board.task.title")}</Label>
            <Input
              id="ct-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ct-desc">{t("board.task.description")}</Label>
            <Textarea
              id="ct-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("board.task.priority")}</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TaskPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`board.priority.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("board.task.dueDate")}</Label>
              <DatePicker value={dueDate} onChange={setDueDate} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("common.columns")}</Label>
            <Select value={columnId} onValueChange={setColumnId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col.id} value={col.id.toString()}>
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("board.task.assignee")}</Label>
            <AssigneePicker
              assignees={assigneeObjects}
              onAdd={(id) => setAssigneeIds((prev) => [...prev, id])}
              onRemove={(id) =>
                setAssigneeIds((prev) => prev.filter((x) => x !== id))
              }
            />
            {assigneeObjects.length > 0 && (
              <AssigneeStack assignees={assigneeObjects} size="md" />
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!title.trim() || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? t("common.saving") : t("board.addTask")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
