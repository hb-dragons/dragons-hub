import { useSWRConfig } from "swr";
import { adminBoardApi } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";
import type { TaskDetail } from "@dragons/shared";
import { taskKey } from "./useTaskDetail";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useChecklistMutations(boardId: number) {
  const { cache, mutate } = useSWRConfig();
  const toast = useToast();

  async function refresh(taskId: number) {
    await Promise.all([
      mutate(taskKey(taskId)),
      mutate((key) => Array.isArray(key) && key[0] === tasksPrefix(boardId)),
    ]);
  }

  function notifyError() {
    haptics.warning();
    toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
  }

  return {
    addItem: async (taskId: number, label: string) => {
      try {
        await adminBoardApi.addChecklistItem(taskId, label);
        await refresh(taskId);
      } catch (error) {
        notifyError();
        throw error;
      }
    },
    toggle: async (taskId: number, itemId: number, isChecked: boolean) => {
      const key = taskKey(taskId);
      const entry = (cache as unknown as { get: (k: unknown) => { data?: unknown } | undefined }).get(key);
      const snapshot = entry?.data as TaskDetail | undefined;

      await mutate(
        key,
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

      try {
        await adminBoardApi.updateChecklistItem(taskId, itemId, { isChecked });
        await refresh(taskId);
      } catch (error) {
        // Roll back to previous task detail and force a revalidation.
        await mutate(key, snapshot, { revalidate: false });
        void refresh(taskId);
        notifyError();
        throw error;
      }
    },
    deleteItem: async (taskId: number, itemId: number) => {
      try {
        await adminBoardApi.deleteChecklistItem(taskId, itemId);
        await refresh(taskId);
      } catch (error) {
        haptics.warning();
        toast.show({ title: i18n.t("toast.deleteFailed"), variant: "error" });
        throw error;
      }
    },
  };
}
