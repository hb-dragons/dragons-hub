"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { BoardData, BoardColumnData, TaskCardData } from "./types";
import { TaskCard } from "./task-card";
import { CreateTaskDialog } from "./create-task-dialog";
import { TaskDetailSheet } from "./task-detail-sheet";
import { ColumnSettingsDialog } from "./column-settings-dialog";

interface KanbanBoardProps {
  boardId: number;
}

export function KanbanBoard({ boardId }: KanbanBoardProps) {
  const t = useTranslations();
  const { mutate } = useSWRConfig();
  const { data: board } = useSWR<BoardData>(
    SWR_KEYS.boardDetail(boardId),
    apiFetcher,
  );
  const { data: tasks } = useSWR<TaskCardData[]>(
    SWR_KEYS.boardTasks(boardId),
    apiFetcher,
  );

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogColumnId, setCreateDialogColumnId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskCardData | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<BoardColumnData | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);

  const columns = board?.columns ?? [];
  const taskList = useMemo(() => tasks ?? [], [tasks]);

  const getColumnTasks = useCallback(
    (columnId: number) =>
      taskList
        .filter((t) => t.columnId === columnId)
        .sort((a, b) => a.position - b.position),
    [taskList],
  );

  function handleDragStart(e: React.DragEvent, taskId: number) {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId.toString());
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleDrop(e: React.DragEvent, targetColumnId: number) {
    e.preventDefault();
    const taskId = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(taskId)) return;
    setDraggedTaskId(null);

    const task = taskList.find((t) => t.id === taskId);
    if (!task || task.columnId === targetColumnId) return;

    // Optimistic update
    await mutate(
      SWR_KEYS.boardTasks(boardId),
      (current: TaskCardData[] | undefined) =>
        (current ?? []).map((t) =>
          t.id === taskId ? { ...t, columnId: targetColumnId, position: 0 } : t,
        ),
      { revalidate: false },
    );

    try {
      await fetchAPI(`/admin/tasks/${taskId}/move`, {
        method: "PATCH",
        body: JSON.stringify({ columnId: targetColumnId, position: 0 }),
      });
      toast.success(t("board.toast.moved"));
    } catch {
      // Revalidate on failure to restore correct state
      await mutate(SWR_KEYS.boardTasks(boardId));
    }
  }

  function openCreateDialog(columnId: number) {
    setCreateDialogColumnId(columnId);
    setCreateDialogOpen(true);
  }

  function openColumnSettings(column?: BoardColumnData) {
    setEditingColumn(column ?? null);
    setColumnSettingsOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => openColumnSettings()}>
            <Plus className="mr-1 h-4 w-4" />
            {t("board.addColumn")}
          </Button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns
          .sort((a, b) => a.position - b.position)
          .map((column) => {
            const colTasks = getColumnTasks(column.id);
            return (
              <div
                key={column.id}
                className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/50"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-semibold hover:underline"
                    onClick={() => openColumnSettings(column)}
                  >
                    {column.color && (
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: column.color }}
                      />
                    )}
                    {column.name}
                    <span className="text-xs font-normal text-muted-foreground">
                      {colTasks.length}
                    </span>
                  </button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => openCreateDialog(column.id)}
                    title={t("board.addTask")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {colTasks.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      {t("board.emptyColumn")}
                    </p>
                  ) : (
                    colTasks.map((task) => (
                      <div
                        key={task.id}
                        className={
                          draggedTaskId === task.id ? "opacity-50" : ""
                        }
                      >
                        <TaskCard
                          task={task}
                          onDragStart={handleDragStart}
                          onClick={setSelectedTask}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
      </div>

      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        boardId={boardId}
        columns={columns}
        defaultColumnId={createDialogColumnId}
      />

      <TaskDetailSheet
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        boardId={boardId}
      />

      <ColumnSettingsDialog
        open={columnSettingsOpen}
        onOpenChange={setColumnSettingsOpen}
        boardId={boardId}
        column={editingColumn}
      />
    </div>
  );
}
