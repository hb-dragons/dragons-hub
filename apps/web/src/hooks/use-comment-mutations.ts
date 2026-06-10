import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import type { TaskComment } from "@dragons/shared";

export function useCommentMutations() {
  const { mutate } = useSWRConfig();

  async function addComment(
    taskId: number,
    body: string,
  ): Promise<TaskComment> {
    try {
      const comment = await api.boards.addComment(taskId, body);
      await mutate(SWR_KEYS.taskDetail(taskId));
      return comment;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add comment");
      throw err;
    }
  }

  async function updateComment(
    taskId: number,
    commentId: number,
    body: string,
  ): Promise<void> {
    try {
      await api.boards.updateComment(taskId, commentId, body);
      await mutate(SWR_KEYS.taskDetail(taskId));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update comment",
      );
      throw err;
    }
  }

  async function deleteComment(
    taskId: number,
    commentId: number,
  ): Promise<void> {
    try {
      await api.boards.deleteComment(taskId, commentId);
      await mutate(SWR_KEYS.taskDetail(taskId));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete comment",
      );
      throw err;
    }
  }

  return { addComment, updateComment, deleteComment };
}
