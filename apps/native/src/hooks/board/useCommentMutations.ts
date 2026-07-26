import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { withErrorToast } from "@/lib/board/with-error-toast";
import { taskKey } from "./useTaskDetail";

export function useCommentMutations() {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  return {
    add: (taskId: number, body: string) =>
      withErrorToast(
        async () => {
          await adminBoardApi.addComment(taskId, body);
          await mutate(taskKey(taskId));
        },
        "toast.saveFailed",
        toast,
      ),
    update: (taskId: number, commentId: number, body: string) =>
      withErrorToast(
        async () => {
          await adminBoardApi.updateComment(taskId, commentId, body);
          await mutate(taskKey(taskId));
        },
        "toast.saveFailed",
        toast,
      ),
    remove: (taskId: number, commentId: number) =>
      withErrorToast(
        async () => {
          await adminBoardApi.deleteComment(taskId, commentId);
          await mutate(taskKey(taskId));
        },
        "toast.deleteFailed",
        toast,
      ),
  };
}
