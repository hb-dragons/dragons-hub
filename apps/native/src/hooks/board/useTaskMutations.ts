import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import type { TaskDetail, TaskPriority } from "@dragons/shared";
import type { TaskUpdateBody } from "@dragons/api-client";
import { isBoardTasksKey } from "@/lib/board/task-keys";
import { taskKey } from "./useTaskDetail";

export function useTaskMutations(boardId: number) {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function patch(taskId: number, body: TaskUpdateBody): Promise<TaskDetail> {
    try {
      const next = await adminBoardApi.updateTask(taskId, body);
      await Promise.all([
        mutate(taskKey(taskId), next, { revalidate: false }),
        mutate(isBoardTasksKey(boardId)),
      ]);
      return next;
    } catch (error) {
      haptics.error();
      toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
      throw error;
    }
  }

  async function deleteTask(id: number) {
    try {
      await adminBoardApi.deleteTask(id);
      await Promise.all([
        mutate(taskKey(id), undefined, { revalidate: false }),
        mutate(isBoardTasksKey(boardId)),
      ]);
    } catch (error) {
      haptics.error();
      toast.show({ title: i18n.t("toast.deleteFailed"), variant: "error" });
      throw error;
    }
  }

  return {
    setTitle: (id: number, title: string) => patch(id, { title }),
    setDescription: (id: number, description: string | null) =>
      patch(id, { description }),
    setPriority: (id: number, priority: TaskPriority) =>
      patch(id, { priority }),
    setDueDate: (id: number, dueDate: string | null) =>
      patch(id, { dueDate }),
    deleteTask,
  };
}
