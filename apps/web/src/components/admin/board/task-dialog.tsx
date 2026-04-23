"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog";
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
import { Loader2, Trash2 } from "lucide-react";
import { TASK_PRIORITIES, type TaskPriority } from "@dragons/shared";
import { useTaskDetail } from "@/hooks/use-board";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import { useAssigneeMutations } from "@/hooks/use-assignee-mutations";
import { useChecklistMutations } from "@/hooks/use-checklist-mutations";
import { useCommentMutations } from "@/hooks/use-comment-mutations";
import { ChecklistEditor } from "./checklist-editor";
import { CommentThread } from "./comment-thread";
import { TaskDialogSidebar } from "./task-dialog-sidebar";
import { ActivityFeed } from "./activity-feed.stub";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

export interface TaskDialogProps {
  taskId: number | null;
  boardId: number;
  onClose: () => void;
}

export function TaskDialog({ taskId, boardId, onClose }: TaskDialogProps) {
  const t = useTranslations();
  const { data: detail } = useTaskDetail(taskId);
  const { updateTask, deleteTask } = useTaskMutations(boardId);
  const { addAssignee, removeAssignee } = useAssigneeMutations(boardId);
  const { addItem, toggleItem, deleteItem } = useChecklistMutations(boardId);
  const { addComment } = useCommentMutations();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (detail) {
      setTitle(detail.title);
      setDescription(detail.description ?? "");
      setPriority(detail.priority);
      setDueDate(detail.dueDate);
    }
  }, [detail]);

  const isOpen = taskId !== null;
  const hasChanges =
    detail &&
    (title !== detail.title ||
      description !== (detail.description ?? "") ||
      priority !== detail.priority ||
      dueDate !== detail.dueDate);

  async function save() {
    if (!taskId) return;
    setSaving(true);
    try {
      await updateTask(taskId, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate,
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!taskId) return;
    await deleteTask(taskId);
    onClose();
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="sr-only">
              {detail?.title ?? t("board.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("board.task.title")}
            </DialogDescription>
          </DialogHeader>

          {detail ? (
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="td-title">{t("board.task.title")}</Label>
                  <Input
                    id="td-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="td-description">
                    {t("board.task.description")}
                  </Label>
                  <Textarea
                    id="td-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
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

                {hasChanges && (
                  <Button onClick={save} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving ? t("common.saving") : t("common.save")}
                  </Button>
                )}

                <div>
                  <Label>{t("board.task.checklist")}</Label>
                  <ChecklistEditor
                    items={detail.checklist}
                    onToggle={(id, checked) => toggleItem(taskId!, id, checked)}
                    onAdd={(label) => addItem(taskId!, label).then(() => {})}
                    onDelete={(id) => deleteItem(taskId!, id)}
                  />
                </div>

                <div>
                  <Label>{t("board.task.comments")}</Label>
                  <CommentThread
                    comments={detail.comments}
                    onAdd={(body) => addComment(taskId!, body).then(() => {})}
                  />
                </div>

                <ActivityFeed taskId={taskId!} />

                <div className="flex justify-end pt-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("board.delete.confirm")}
                  </Button>
                </div>
              </div>

              <TaskDialogSidebar
                assignees={detail.assignees}
                onAddAssignee={(uid) => addAssignee(taskId!, uid).then(() => {})}
                onRemoveAssignee={(uid) =>
                  removeAssignee(taskId!, uid).then(() => {})
                }
              />
            </div>
          ) : (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("board.delete.taskTitle")}
        body={t("board.delete.taskBody")}
        onConfirm={confirmDelete}
      />
    </>
  );
}
