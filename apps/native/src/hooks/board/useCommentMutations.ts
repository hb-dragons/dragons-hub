import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import { taskKey } from "./useTaskDetail";

export function useCommentMutations() {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function withErrorToast<T>(
    fn: () => Promise<T>,
    failKey: "toast.saveFailed" | "toast.deleteFailed",
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      haptics.warning();
      toast.show({ title: i18n.t(failKey), variant: "error" });
      throw error;
    }
  }

  return {
    add: (taskId: number, body: string) =>
      withErrorToast(async () => {
        await adminBoardApi.addComment(taskId, body);
        await mutate(taskKey(taskId));
      }, "toast.saveFailed"),
    update: (taskId: number, commentId: number, body: string) =>
      withErrorToast(async () => {
        await adminBoardApi.updateComment(taskId, commentId, body);
        await mutate(taskKey(taskId));
      }, "toast.saveFailed"),
    remove: (taskId: number, commentId: number) =>
      withErrorToast(async () => {
        await adminBoardApi.deleteComment(taskId, commentId);
        await mutate(taskKey(taskId));
      }, "toast.deleteFailed"),
  };
}
