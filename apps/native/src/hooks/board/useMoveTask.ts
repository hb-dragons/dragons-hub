// Note: this hook's rollback path is not unit-tested because @dragons/native
// has no test harness yet. The pure reorder logic it calls (applyTaskMove)
// is covered by @dragons/shared's test suite.
import { useSWRConfig } from "swr";
import type { Arguments } from "swr";
import { adminBoardApi } from "@/lib/api";
import { applyTaskMove } from "@dragons/shared";
import type { TaskCardData } from "@dragons/shared";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { i18n } from "@/lib/i18n";

const tasksPrefix = (boardId: number) => `admin/boards/${boardId}/tasks`;

export function useMoveTask(boardId: number) {
  const { cache, mutate } = useSWRConfig();
  const toast = useToast();

  return async function moveTask(
    taskId: number,
    targetColumnId: number,
    targetPosition: number,
  ): Promise<void> {
    const prefix = tasksPrefix(boardId);

    // Snapshot every cache entry we're about to mutate so we can restore them on error.
    const snapshots = new Map<Arguments, TaskCardData[] | undefined>();
    const cacheKeys = (cache as unknown as { keys: () => IterableIterator<Arguments> }).keys();
    for (const key of cacheKeys) {
      if (Array.isArray(key) && key[0] === prefix) {
        const entry = (cache as unknown as { get: (k: Arguments) => { data?: unknown } | undefined }).get(key);
        if (entry) snapshots.set(key, entry.data as TaskCardData[] | undefined);
      }
    }

    // Optimistic local apply across every filter variant of the tasks cache.
    await mutate(
      (key) => Array.isArray(key) && key[0] === prefix,
      (prev: TaskCardData[] | undefined) =>
        prev ? applyTaskMove(prev, taskId, targetColumnId, targetPosition) : prev,
      { revalidate: false },
    );

    try {
      await adminBoardApi.moveTask(taskId, {
        columnId: targetColumnId,
        position: targetPosition,
      });
      // On success, reconcile with server truth.
      await mutate((key) => Array.isArray(key) && key[0] === prefix);
    } catch (error) {
      // Roll back to the snapshot we captured before the optimistic apply.
      for (const [key, value] of snapshots) {
        await mutate(key, value, { revalidate: false });
      }
      // Also try to revalidate so we eventually get server truth.
      void mutate((key) => Array.isArray(key) && key[0] === prefix);
      haptics.warning();
      toast.show({ title: i18n.t("toast.moveFailed"), variant: "error" });
      throw error;
    }
  };
}
