import { useCallback } from "react";
import { useSWRConfig } from "swr";
import type { TaskCardData } from "@dragons/shared";
import { adminBoardApi } from "@/lib/api";
import { restoreTaskInput } from "@/lib/board/create-task-input";
import { isBoardTasksKey } from "@/lib/board/task-keys";
import { haptics } from "@/lib/haptics";
import { i18n } from "@/lib/i18n";
import { useTaskMutations } from "./useTaskMutations";
import { useToast } from "@/hooks/useToast";

/**
 * Delete a task, and offer undo on the toast that says so.
 *
 * Deleting is reachable three ways — the card's swipe action, the context menu
 * on the card (#220) and the task detail sheet — so the undo lives here rather
 * than beside any one of them. Undo *recreates* the task: the row is gone, so
 * the restored task carries a new id (`restoreTaskInput` decides what else
 * comes back with it).
 *
 * There is no confirmation step in front of it. Undo is the confirmation, and
 * an alert plus an undo toast asks the same question twice.
 */
export function useDeleteTaskWithUndo(boardId: number): (task: TaskCardData) => void {
  const { mutate } = useSWRConfig();
  const { deleteTask } = useTaskMutations(boardId);
  const toast = useToast();

  return useCallback(
    (task: TaskCardData) => {
      haptics.warning();
      // Snapshot before the await: the SWR cache drops the task as soon as the
      // delete lands, and undo has to describe the task that was there.
      const restore = restoreTaskInput(task);

      deleteTask(task.id)
        .then(() => {
          toast.show({
            title: i18n.t("toast.taskDeleted"),
            action: {
              label: i18n.t("toast.undo"),
              onPress: () => {
                void (async () => {
                  try {
                    await adminBoardApi.createTask(boardId, restore);
                    await mutate(isBoardTasksKey(boardId));
                  } catch {
                    toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
                  }
                })();
              },
            },
          });
        })
        .catch(() => {
          // The delete failed: useTaskMutations already toasted it.
        });
    },
    [boardId, deleteTask, mutate, toast],
  );
}
