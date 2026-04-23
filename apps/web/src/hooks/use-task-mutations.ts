import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import type { TaskCardData, TaskDetail, TaskPriority } from "@dragons/shared";

export interface TaskCreateInput {
  title: string;
  description?: string | null;
  columnId: number;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeIds?: string[];
}

export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeIds?: string[];
}

function matchBoardTasks(boardId: number) {
  return (key: unknown): boolean =>
    typeof key === "string" &&
    key.startsWith(`/admin/boards/${boardId}/tasks`);
}

export function useTaskMutations(boardId: number) {
  const { mutate } = useSWRConfig();

  async function createTask(input: TaskCreateInput): Promise<TaskDetail> {
    try {
      const created = await fetchAPI<TaskDetail>(
        `/admin/boards/${boardId}/tasks`,
        { method: "POST", body: JSON.stringify(input) },
      );
      await mutate(matchBoardTasks(boardId));
      return created;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create task");
      throw err;
    }
  }

  async function updateTask(
    id: number,
    input: TaskUpdateInput,
  ): Promise<TaskDetail> {
    try {
      const updated = await fetchAPI<TaskDetail>(`/admin/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      await Promise.all([
        mutate(SWR_KEYS.taskDetail(id), updated, { revalidate: false }),
        mutate(matchBoardTasks(boardId)),
      ]);
      return updated;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update task");
      throw err;
    }
  }

  async function moveTask(
    id: number,
    columnId: number,
    position: number,
  ): Promise<void> {
    try {
      await fetchAPI(`/admin/tasks/${id}/move`, {
        method: "PATCH",
        body: JSON.stringify({ columnId, position }),
      });
      await mutate(matchBoardTasks(boardId));
    } catch (err) {
      await mutate(matchBoardTasks(boardId));
      toast.error(err instanceof Error ? err.message : "Failed to move task");
      throw err;
    }
  }

  async function deleteTask(id: number): Promise<void> {
    try {
      await fetchAPI(`/admin/tasks/${id}`, { method: "DELETE" });
      await mutate(
        matchBoardTasks(boardId),
        (current: TaskCardData[] | undefined) =>
          (current ?? []).filter((t) => t.id !== id),
        { revalidate: true },
      );
      await mutate(SWR_KEYS.taskDetail(id), undefined, { revalidate: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
      throw err;
    }
  }

  return { createTask, updateTask, moveTask, deleteTask };
}
