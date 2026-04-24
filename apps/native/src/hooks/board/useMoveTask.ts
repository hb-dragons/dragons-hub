import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { applyTaskMove } from "@dragons/shared";
import type { TaskCardData } from "@dragons/shared";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useMoveTask(boardId: number) {
  const { mutate } = useSWRConfig();

  return async function moveTask(
    taskId: number,
    targetColumnId: number,
    targetPosition: number,
  ): Promise<void> {
    // Optimistic local apply across every filter variant of the tasks cache.
    await mutate(
      (key) => Array.isArray(key) && key[0] === tasksPrefix(boardId),
      (prev: TaskCardData[] | undefined) =>
        prev ? applyTaskMove(prev, taskId, targetColumnId, targetPosition) : prev,
      { revalidate: false },
    );

    try {
      await adminBoardApi.moveTask(taskId, {
        columnId: targetColumnId,
        position: targetPosition,
      });
    } finally {
      // Reconcile with server truth.
      await mutate(
        (key) => Array.isArray(key) && key[0] === tasksPrefix(boardId),
      );
    }
  };
}
