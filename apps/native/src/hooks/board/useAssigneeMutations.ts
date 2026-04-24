import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { taskKey } from "./useTaskDetail";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useAssigneeMutations(boardId: number) {
  const { mutate } = useSWRConfig();

  return {
    add: async (taskId: number, userId: string) => {
      await adminBoardApi.addAssignee(taskId, userId);
      await Promise.all([
        mutate(taskKey(taskId)),
        mutate(
          (key) => Array.isArray(key) && key[0] === tasksPrefix(boardId),
        ),
      ]);
    },
    remove: async (taskId: number, userId: string) => {
      await adminBoardApi.removeAssignee(taskId, userId);
      await Promise.all([
        mutate(taskKey(taskId)),
        mutate(
          (key) => Array.isArray(key) && key[0] === tasksPrefix(boardId),
        ),
      ]);
    },
  };
}
