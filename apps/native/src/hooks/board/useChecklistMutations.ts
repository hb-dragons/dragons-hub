import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import type { TaskDetail } from "@dragons/shared";
import { taskKey } from "./useTaskDetail";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useChecklistMutations(boardId: number) {
  const { mutate } = useSWRConfig();

  async function refresh(taskId: number) {
    await Promise.all([
      mutate(taskKey(taskId)),
      mutate((key) => Array.isArray(key) && key[0] === tasksPrefix(boardId)),
    ]);
  }

  return {
    addItem: async (taskId: number, label: string) => {
      await adminBoardApi.addChecklistItem(taskId, label);
      await refresh(taskId);
    },
    toggle: async (taskId: number, itemId: number, isChecked: boolean) => {
      await mutate(
        taskKey(taskId),
        (prev: TaskDetail | undefined) => {
          if (!prev) return prev;
          const nextChecklist = prev.checklist.map((i) =>
            i.id === itemId ? { ...i, isChecked } : i,
          );
          return {
            ...prev,
            checklist: nextChecklist,
            checklistChecked: nextChecklist.filter((i) => i.isChecked).length,
          };
        },
        { revalidate: false },
      );
      await adminBoardApi.updateChecklistItem(taskId, itemId, { isChecked });
      await refresh(taskId);
    },
    deleteItem: async (taskId: number, itemId: number) => {
      await adminBoardApi.deleteChecklistItem(taskId, itemId);
      await refresh(taskId);
    },
  };
}
