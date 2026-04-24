import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskDetail, TaskPriority } from "@dragons/shared";
import type { UpdateTaskBody } from "@dragons/api-client";
import { taskKey } from "./useTaskDetail";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useTaskMutations(boardId: number) {
  const { mutate } = useSWRConfig();

  async function patch(taskId: number, body: UpdateTaskBody): Promise<TaskDetail> {
    const next = await adminBoardApi.updateTask(taskId, body);
    await Promise.all([
      mutate(taskKey(taskId), next, { revalidate: false }),
      mutate(
        (key) => Array.isArray(key) && key[0] === tasksPrefix(boardId),
      ),
    ]);
    return next;
  }

  return {
    setTitle: (id: number, title: string) => patch(id, { title }),
    setDescription: (id: number, description: string | null) => patch(id, { description }),
    setPriority: (id: number, priority: TaskPriority) => patch(id, { priority }),
    setDueDate: (id: number, dueDate: string | null) => patch(id, { dueDate }),
    deleteTask: async (id: number) => {
      await adminBoardApi.deleteTask(id);
      await Promise.all([
        mutate(taskKey(id), undefined, { revalidate: false }),
        mutate(
          (key) => Array.isArray(key) && key[0] === tasksPrefix(boardId),
        ),
      ]);
    },
  };
}
