"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
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
import type { BoardColumnData, TaskCardData } from "./types";
import { TASK_PRIORITIES } from "@dragons/shared";

interface CreateTaskDialogProps {
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
  const { mutate } = useSWRConfig();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [columnId, setColumnId] = useState<string>(
    defaultColumnId?.toString() ?? columns[0]?.id.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("normal");
    setDueDate(null);
    setColumnId(defaultColumnId?.toString() ?? columns[0]?.id.toString() ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      const created = await fetchAPI<TaskCardData>(
        `/admin/boards/${boardId}/tasks`,
        {
          method: "POST",
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            priority,
            dueDate,
            columnId: parseInt(columnId, 10),
          }),
        },
      );
      await mutate(
        SWR_KEYS.boardTasks(boardId),
        (current: TaskCardData[] | undefined) => [...(current ?? []), created],
        { revalidate: false },
      );
      toast.success(t("board.toast.created"));
      reset();
      onOpenChange(false);
    } catch {
      // Error surfaced by fetchAPI
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">{t("board.task.title")}</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">{t("board.task.description")}</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("board.task.priority")}</Label>
              <Select value={priority} onValueChange={setPriority}>
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
