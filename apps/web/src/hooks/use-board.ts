import useSWR from "swr";
import { queries } from "@/lib/swr-queries";
import type { BoardFilters } from "./use-board-filters";

export function useBoards() {
  const boardsQ = queries.boards();
  return useSWR(boardsQ.key, boardsQ.fetcher);
}

export function useBoard(boardId: number | null) {
  const boardDetailQ = boardId != null ? queries.boardDetail(boardId) : null;
  return useSWR(boardDetailQ?.key ?? null, boardDetailQ?.fetcher ?? null);
}

export function useBoardTasks(
  boardId: number | null,
  filters?: BoardFilters,
) {
  const serverFilter =
    filters && filters.assigneeIds.length === 1
      ? { assigneeId: filters.assigneeIds[0] }
      : undefined;
  const priorityFilter = filters?.priority
    ? { priority: filters.priority }
    : undefined;
  const boardTasksQ =
    boardId != null
      ? queries.boardTasks(boardId, { ...serverFilter, ...priorityFilter })
      : null;
  return useSWR(boardTasksQ?.key ?? null, boardTasksQ?.fetcher ?? null);
}

export function useTaskDetail(taskId: number | null) {
  const taskDetailQ = taskId != null ? queries.taskDetail(taskId) : null;
  return useSWR(taskDetailQ?.key ?? null, taskDetailQ?.fetcher ?? null);
}
