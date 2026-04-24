import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { taskKey } from "./useTaskDetail";

export function useCommentMutations() {
  const { mutate } = useSWRConfig();
  return {
    add: async (taskId: number, body: string) => {
      await adminBoardApi.addComment(taskId, body);
      await mutate(taskKey(taskId));
    },
    update: async (taskId: number, commentId: number, body: string) => {
      await adminBoardApi.updateComment(taskId, commentId, body);
      await mutate(taskKey(taskId));
    },
    remove: async (taskId: number, commentId: number) => {
      await adminBoardApi.deleteComment(taskId, commentId);
      await mutate(taskKey(taskId));
    },
  };
}
