import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import { taskKey } from "./useTaskDetail";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useAssigneeMutations(boardId: number) {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function reconcile(taskId: number) {
    await Promise.all([
      mutate(taskKey(taskId)),
      mutate((key) => Array.isArray(key) && key[0] === tasksPrefix(boardId)),
    ]);
  }

  async function withErrorToast<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
      throw error;
    }
  }

  return {
    add: (taskId: number, userId: string) =>
      withErrorToast(async () => {
        await adminBoardApi.addAssignee(taskId, userId);
        await reconcile(taskId);
      }),
    remove: (taskId: number, userId: string) =>
      withErrorToast(async () => {
        await adminBoardApi.removeAssignee(taskId, userId);
        await reconcile(taskId);
      }),
  };
}
