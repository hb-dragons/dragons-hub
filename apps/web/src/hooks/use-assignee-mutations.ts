import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import type { TaskAssignee } from "@dragons/shared";

function matchBoardTasks(boardId: number) {
  return (key: unknown): boolean =>
    typeof key === "string" &&
    key.startsWith(`/admin/boards/${boardId}/tasks`);
}

export function useAssigneeMutations(boardId: number) {
  const { mutate } = useSWRConfig();

  async function addAssignee(
    taskId: number,
    userId: string,
  ): Promise<TaskAssignee> {
    try {
      const assignee = await api.boards.addAssignee(taskId, userId);
      await Promise.all([
        mutate(SWR_KEYS.taskDetail(taskId)),
        mutate(matchBoardTasks(boardId)),
      ]);
      return assignee;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add assignee",
      );
      throw err;
    }
  }

  async function removeAssignee(
    taskId: number,
    userId: string,
  ): Promise<void> {
    try {
      await api.boards.removeAssignee(taskId, userId);
      await Promise.all([
        mutate(SWR_KEYS.taskDetail(taskId)),
        mutate(matchBoardTasks(boardId)),
      ]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove assignee",
      );
      throw err;
    }
  }

  return { addAssignee, removeAssignee };
}
