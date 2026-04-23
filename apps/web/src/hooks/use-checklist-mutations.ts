import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import type { ChecklistItem } from "@dragons/shared";

function matchBoardTasks(boardId: number) {
  return (key: unknown): boolean =>
    typeof key === "string" &&
    key.startsWith(`/admin/boards/${boardId}/tasks`);
}

export function useChecklistMutations(boardId: number) {
  const { mutate } = useSWRConfig();

  async function addItem(
    taskId: number,
    label: string,
  ): Promise<ChecklistItem> {
    try {
      const item = await fetchAPI<ChecklistItem>(
        `/admin/tasks/${taskId}/checklist`,
        { method: "POST", body: JSON.stringify({ label }) },
      );
      await Promise.all([
        mutate(SWR_KEYS.taskDetail(taskId)),
        mutate(matchBoardTasks(boardId)),
      ]);
      return item;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add item");
      throw err;
    }
  }

  async function toggleItem(
    taskId: number,
    itemId: number,
    isChecked: boolean,
  ): Promise<void> {
    try {
      await fetchAPI(`/admin/tasks/${taskId}/checklist/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ isChecked }),
      });
      await Promise.all([
        mutate(SWR_KEYS.taskDetail(taskId)),
        mutate(matchBoardTasks(boardId)),
      ]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to toggle item",
      );
      throw err;
    }
  }

  async function updateLabel(
    taskId: number,
    itemId: number,
    label: string,
  ): Promise<void> {
    try {
      await fetchAPI(`/admin/tasks/${taskId}/checklist/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ label }),
      });
      await mutate(SWR_KEYS.taskDetail(taskId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update item");
      throw err;
    }
  }

  async function deleteItem(
    taskId: number,
    itemId: number,
  ): Promise<void> {
    try {
      await fetchAPI(`/admin/tasks/${taskId}/checklist/${itemId}`, {
        method: "DELETE",
      });
      await Promise.all([
        mutate(SWR_KEYS.taskDetail(taskId)),
        mutate(matchBoardTasks(boardId)),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete item");
      throw err;
    }
  }

  return { addItem, toggleItem, updateLabel, deleteItem };
}
