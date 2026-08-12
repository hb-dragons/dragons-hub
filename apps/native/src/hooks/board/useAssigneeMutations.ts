import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { isBoardTasksKey } from "@/lib/board/task-keys";
import { withErrorToast } from "@/lib/board/with-error-toast";
import { taskKey } from "./useTaskDetail";

export function useAssigneeMutations(boardId: number) {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function reconcile(taskId: number) {
    await Promise.all([
      mutate(taskKey(taskId)),
      mutate(isBoardTasksKey(boardId)),
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
