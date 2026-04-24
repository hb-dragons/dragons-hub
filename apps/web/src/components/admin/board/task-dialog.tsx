"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@dragons/ui/components/dialog";
import { Button } from "@dragons/ui/components/button";
import { Textarea } from "@dragons/ui/components/textarea";
import { Badge } from "@dragons/ui/components/badge";
import { Skeleton } from "@dragons/ui/components/skeleton";
import { Check, Loader2, Trash2, X } from "lucide-react";
import type { BoardColumnData, TaskPriority } from "@dragons/shared";
import { useTaskDetail } from "@/hooks/use-board";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import { useAssigneeMutations } from "@/hooks/use-assignee-mutations";
import { useChecklistMutations } from "@/hooks/use-checklist-mutations";
import { useCommentMutations } from "@/hooks/use-comment-mutations";
import { ChecklistEditor } from "./checklist-editor";
import { CommentThread } from "./comment-thread";
import { TaskDialogSidebar } from "./task-dialog-sidebar";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

export interface TaskDialogProps {
  taskId: number | null;
  boardId: number;
  columns: BoardColumnData[];
  onClose: () => void;
}

export function TaskDialog({
  taskId,
  boardId,
  columns,
  onClose,
}: TaskDialogProps) {
  const t = useTranslations();
  const format = useFormatter();
  const { data: detail, isLoading, error } = useTaskDetail(taskId);
  const { updateTask, deleteTask } = useTaskMutations(boardId);
  const { addAssignee, removeAssignee } = useAssigneeMutations(boardId);
  const { addItem, toggleItem, deleteItem } = useChecklistMutations(boardId);
  const { addComment } = useCommentMutations();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!showSaved) return;
    const id = setTimeout(() => setShowSaved(false), 1600);
    return () => clearTimeout(id);
  }, [showSaved]);

  // Seed local edit state only when switching tasks, not on every SWR
  // revalidation — otherwise in-flight edits would be clobbered whenever a
  // sibling mutation (e.g. checklist toggle) revalidates the task detail.
  const seededIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!detail) {
      if (taskId === null) seededIdRef.current = null;
      return;
    }
    if (seededIdRef.current === detail.id) return;
    seededIdRef.current = detail.id;
    setTitle(detail.title);
    setDescription(detail.description ?? "");
    setPriority(detail.priority);
    setDueDate(detail.dueDate);
    setShowSaved(false);
  }, [detail, taskId]);

  const isOpen = taskId !== null;
  const dirty =
    !!detail &&
    (title !== detail.title ||
      description !== (detail.description ?? "") ||
      priority !== detail.priority ||
      dueDate !== detail.dueDate);

  const column = detail
    ? columns.find((c) => c.id === detail.columnId) ?? null
    : null;
  const checked = detail?.checklist.filter((i) => i.isChecked).length ?? 0;
  const total = detail?.checklist.length ?? 0;
  const progressPct = total > 0 ? Math.round((checked / total) * 100) : 0;

  async function save() {
    if (!taskId || !detail || !title.trim()) return;
    setSaving(true);
    try {
      await updateTask(taskId, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate,
      });
      setShowSaved(true);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!detail) return;
    setTitle(detail.title);
    setDescription(detail.description ?? "");
    setPriority(detail.priority);
    setDueDate(detail.dueDate);
  }

  async function confirmDelete() {
    if (!taskId) return;
    await deleteTask(taskId);
    onClose();
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="flex flex-col gap-0 overflow-hidden p-0 max-h-[90vh]"
          style={{ maxWidth: "40rem", width: "calc(100% - 2rem)" }}
        >
          <div className="relative shrink-0 border-b px-6 py-3">
            <DialogTitle className="sr-only">
              {detail?.title ?? t("board.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("board.task.title")}
            </DialogDescription>
            <div className="flex items-center gap-2 pr-10 text-xs text-muted-foreground">
              {column ? (
                <Badge variant="outline" className="gap-1.5">
                  {column.color && (
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: column.color }}
                    />
                  )}
                  {column.name}
                </Badge>
              ) : (
                <Skeleton className="h-5 w-24" />
              )}
              {detail && (
                <span className="font-mono text-[10px]">#{detail.id}</span>
              )}
              <div className="ml-auto flex h-5 items-center gap-1.5">
                {saving && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>{t("common.saving")}</span>
                  </>
                )}
                {!saving && showSaved && (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Check className="h-3 w-3" />
                    {t("common.saved")}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {error ? (
              <div className="p-6 text-sm text-muted-foreground">
                {t("board.task.loadFailed")}
              </div>
            ) : isLoading || !detail ? (
              <TaskDialogSkeleton />
            ) : (
              <div className="flex flex-col gap-6 p-6">
                <div className="min-w-0 space-y-6">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    placeholder={t("board.task.titlePlaceholder")}
                    aria-label={t("board.task.title")}
                    className="w-full bg-transparent text-2xl font-semibold leading-tight outline-none placeholder:text-muted-foreground/60"
                  />

                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("board.task.descriptionPlaceholder")}
                    aria-label={t("board.task.description")}
                    rows={4}
                    className="resize-y"
                  />

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("board.task.checklist")}
                      </h3>
                      {total > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {checked}/{total}
                        </span>
                      )}
                    </div>
                    {total > 0 && (
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-[width] duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    )}
                    <ChecklistEditor
                      items={detail.checklist}
                      onToggle={(id, isChecked) =>
                        toggleItem(detail.id, id, isChecked)
                      }
                      onAdd={(label) =>
                        addItem(detail.id, label).then(() => {})
                      }
                      onDelete={(id) => deleteItem(detail.id, id)}
                    />
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("board.task.comments")}
                    </h3>
                    <CommentThread
                      comments={detail.comments}
                      onAdd={(body) =>
                        addComment(detail.id, body).then(() => {})
                      }
                    />
                  </section>
                </div>

                <TaskDialogSidebar
                  priority={priority}
                  onPriorityChange={setPriority}
                  dueDate={dueDate}
                  onDueDateChange={setDueDate}
                  assignees={detail.assignees}
                  onAddAssignee={(uid) =>
                    addAssignee(detail.id, uid).then(() => {})
                  }
                  onRemoveAssignee={(uid) =>
                    removeAssignee(detail.id, uid).then(() => {})
                  }
                  createdAt={detail.createdAt}
                  updatedAt={detail.updatedAt}
                  format={format}
                />
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/30 px-6 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={!detail}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {t("board.delete.confirm")}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={discard}
                disabled={!dirty || saving}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={!dirty || saving || !title.trim()}
              >
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          </div>
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

function TaskDialogSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Skeleton className="h-8 w-2/3" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-1 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 border-t pt-4">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </div>
  );
}
