"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { useBoard, useBoardTasks } from "@/hooks/use-board";
import { useBoardFilters } from "@/hooks/use-board-filters";
import { BoardToolbar } from "./board-toolbar";
import { KanbanBoard } from "./kanban-board";
import { CreateTaskDialog } from "./create-task-dialog";
import { ColumnSettingsDialog } from "./column-settings-dialog";
import { TaskDialog } from "./task-dialog";

export interface BoardViewProps {
  boardId: number;
}

export function BoardView({ boardId }: BoardViewProps) {
  const t = useTranslations("board");
  const { filters } = useBoardFilters();
  const { data: board } = useBoard(boardId);
  const { data: allTasks } = useBoardTasks(boardId, filters);

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskColumnId, setCreateTaskColumnId] = useState<number | null>(
    null,
  );
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<BoardColumnData | null>(
    null,
  );
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);

  const tasks = useMemo(() => {
    if (!allTasks) return [];
    let out = allTasks;
    if (filters.assigneeIds.length > 1) {
      const set = new Set(filters.assigneeIds);
      out = out.filter((t) => t.assignees.some((a) => set.has(a.userId)));
    }
    if (filters.q.trim()) {
      const q = filters.q.trim().toLowerCase();
      out = out.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [allTasks, filters]);

  function openCreateTask(columnId: number) {
    setCreateTaskColumnId(columnId);
    setCreateTaskOpen(true);
  }

  function openColumnSettings(column?: BoardColumnData) {
    setEditingColumn(column ?? null);
    setColumnSettingsOpen(true);
  }

  function openTask(task: TaskCardData) {
    setOpenTaskId(task.id);
  }

  if (!board) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        {t("emptyBoard")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BoardToolbar
        boardId={boardId}
        onAddColumn={() => openColumnSettings()}
      />

      <KanbanBoard
        board={board}
        tasks={tasks}
        onOpenTask={openTask}
        onAddTask={openCreateTask}
        onEditColumn={openColumnSettings}
      />

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        boardId={boardId}
        columns={board.columns}
        defaultColumnId={createTaskColumnId}
      />

      <ColumnSettingsDialog
        open={columnSettingsOpen}
        onOpenChange={setColumnSettingsOpen}
        boardId={boardId}
        column={editingColumn}
      />

      <TaskDialog
        taskId={openTaskId}
        boardId={boardId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
