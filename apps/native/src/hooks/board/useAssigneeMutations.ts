import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { withErrorToast } from "@/lib/board/with-error-toast";
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

  return {
    add: (taskId: number, userId: string) =>
      withErrorToast(
        async () => {
          await adminBoardApi.addAssignee(taskId, userId);
          await reconcile(taskId);
        },
        "toast.saveFailed",
        toast,
      ),
    remove: (taskId: number, userId: string) =>
      withErrorToast(
        async () => {
          await adminBoardApi.removeAssignee(taskId, userId);
          await reconcile(taskId);
        },
        "toast.deleteFailed",
        toast,
      ),
  };
}
